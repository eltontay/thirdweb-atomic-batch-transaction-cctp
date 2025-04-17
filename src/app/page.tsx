'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createWallet, getUSDCBalance, sendPayrollBatchTransaction, processRecipientMinting, pollTransactionStatus, waitForAttestation } from '../services/cctpService';
import { CCTP_CONFIG, CCTPTransferState, CCTPTransferStatus } from '../types/cctp';
import RecipientForm from './components/RecipientForm';
import { debounce } from 'lodash';
import { Interface } from 'ethers';

export default function Home() {
  const [sourceWallet, setSourceWallet] = useState<{ id: string; address: string } | null>(null);
  const [sourceChain, setSourceChain] = useState<string>('ethereum-sepolia');
  const [recipients, setRecipients] = useState<Array<{ chain: string; address: string; amount: string }>>([]);
  const [balances, setBalances] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [balanceLoading, setBalanceLoading] = useState<{ [key: string]: boolean }>({});
  const [error, setError] = useState<string>('');
  const [copiedText, setCopiedText] = useState<string>('');
  const [transferState, setTransferState] = useState<CCTPTransferState>({
    status: 'idle',
    recipientStates: {}
  });

  // Add a ref to track active transfers
  const activeTransfers = useRef<{ [key: string]: boolean }>({});

  const chains = Object.keys(CCTP_CONFIG);

  // Debounced balance fetch
  const debouncedFetchBalances = useCallback(
    debounce((chain?: string) => {
      if (sourceWallet?.address) {
        fetchBalances(chain);
      }
    }, 1000),
    [sourceWallet]
  );

  // Only fetch balances when wallet or recipients meaningfully change
  useEffect(() => {
    if (sourceWallet?.address) {
      debouncedFetchBalances();
    }
  }, [sourceWallet?.address, recipients.map(r => r.address).join(',')]);

  const handleReset = () => {
    // Clear all active transfers
    activeTransfers.current = {};
    
    // Reset transfer state
    setTransferState({
      status: 'idle',
      recipientStates: {}
    });
    
    // Reset only the amounts while keeping the wallet addresses
    setRecipients(recipients.map(recipient => ({
      chain: recipient.chain,
      address: recipient.address,
      amount: ''
    })));
    
    // Reset error state
    setError('');
  };

  const fetchBalances = async (chain?: string) => {
    if (!sourceWallet?.address) return;

    try {
      // Fetch source wallet balance
      if (sourceWallet?.address && (!chain || chain === sourceChain)) {
        setBalanceLoading(prev => ({ ...prev, [sourceChain]: true }));
        const sourceBalance = await getUSDCBalance(sourceChain, sourceWallet.address);
        setBalances(prev => ({
          ...prev,
          [sourceChain]: sourceBalance?.result?.displayValue?.replace(/\.0$/, '') || '0'
        }));
        setBalanceLoading(prev => ({ ...prev, [sourceChain]: false }));
      }

      // Fetch recipient balances
      for (const recipient of recipients) {
        if (recipient.address && (!chain || chain === recipient.chain)) {
          setBalanceLoading(prev => ({ ...prev, [recipient.address]: true }));
          const recipientBalance = await getUSDCBalance(recipient.chain, recipient.address);
          setBalances(prev => ({
            ...prev,
            [recipient.address]: recipientBalance?.result?.displayValue?.replace(/\.0$/, '') || '0'
          }));
          setBalanceLoading(prev => ({ ...prev, [recipient.address]: false }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch balances:', err);
    }
  };

  const handleRefreshBalance = async (address: string, chain: string) => {
    try {
      setBalanceLoading(prev => ({ ...prev, [address]: true }));
      const balance = await getUSDCBalance(chain, address);
      setBalances(prev => ({
        ...prev,
        [address]: balance?.result?.displayValue?.replace(/\.0$/, '') || '0'
      }));
    } catch (err) {
      console.error('Failed to refresh balance:', err);
    } finally {
      setBalanceLoading(prev => ({ ...prev, [address]: false }));
    }
  };

  const handleCreateWallet = async (chain: string) => {
    try {
      setLoading(true);
      setError('');
      const response = await createWallet(chain, `${chain}-source`);
      console.log('Wallet created:', response);

      if (!response.result?.walletAddress) {
        throw new Error('Invalid wallet response');
      }

      const walletData = {
        id: response.result.walletAddress,
        address: response.result.walletAddress
      };

      setSourceWallet(walletData);
    } catch (err) {
      console.error('Error creating wallet:', err);
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!sourceWallet?.address) return;

    try {
      // Initial state - sending batch transaction
      setTransferState({
        status: 'processing',
        recipientStates: Object.fromEntries(
          recipients.map(recipient => [
            recipient.address,
            { status: 'processing', message: 'Waiting for burn transaction to be mined...' }
          ])
        )
      });

      // Send the batch transaction
      const response = await sendPayrollBatchTransaction(
        sourceChain,
        sourceWallet.address,
        recipients
      );

      console.log('Batch transaction response:', response);

      // Poll for the batch transaction status
      const batchTxHash = await pollTransactionStatus(response.result.queueId);

      // Update state with transaction details
      setTransferState(prev => ({
        ...prev,
        status: 'mining',
        recipientStates: Object.fromEntries(
          recipients.map(recipient => [
            recipient.address,
            {
              status: 'waitingForAttestation',
              message: 'Waiting for attestation...',
              transactionHash: batchTxHash
            }
          ])
        )
      }));

      // Get attestation once for the batch transaction
      const sourceConfig = CCTP_CONFIG[sourceChain];
      const attestationMessages = await waitForAttestation(sourceConfig.domain.toString(), batchTxHash);
      
      if (!attestationMessages || attestationMessages.length === 0) {
        throw new Error('No attestations received after polling');
      }

      // Update all recipients to receiving state
      setTransferState(prev => ({
        ...prev,
        status: 'receiving',
        recipientStates: Object.fromEntries(
          recipients.map(recipient => [
            recipient.address,
            {
              status: 'receiving',
              message: 'Receiving tokens on destination chain...',
              transactionHash: batchTxHash
            }
          ])
        )
      }));

      // Process the destination chain
      const chain = recipients[0].chain;
      const destConfig = CCTP_CONFIG[chain];
      
      try {
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          try {
            if (retryCount > 0) {
              console.log(`Retry ${retryCount + 1}/${maxRetries} for chain ${chain}`);
              await new Promise(resolve => setTimeout(resolve, 15000));
            }

            // Create receiveMessage transactions using attestations
            const messageTransmitterInterface = new Interface([
              'function receiveMessage(bytes message, bytes attestation)'
            ]);

            console.log('Attestation messages received:', {
              totalMessages: attestationMessages.length,
              messages: attestationMessages.map((msg, idx) => ({
                index: idx,
                messageLength: msg.message.length,
                attestationLength: msg.attestation.length,
                messagePreview: `${msg.message.slice(0, 66)}...`,
                attestationPreview: `${msg.attestation.slice(0, 66)}...`
              }))
            });

            // Create a receive message transaction for each recipient with their corresponding attestation
            const receiveMessageTxs = attestationMessages.map((msg, index) => {
              console.log(`Creating receive message transaction ${index + 1}/${attestationMessages.length}:`, {
                recipientAddress: recipients[index].address,
                messageLength: msg.message.length,
                attestationLength: msg.attestation.length,
                messageStart: msg.message.slice(0, 66),
                attestationStart: msg.attestation.slice(0, 66)
              });

              return {
                toAddress: destConfig.messageTransmitter,
                data: messageTransmitterInterface.encodeFunctionData('receiveMessage', [
                  msg.message,
                  msg.attestation
                ]),
                value: "0"
              };
            });

            console.log('Final receive message transactions:', {
              chain,
              chainId: destConfig.chainId,
              messageCount: receiveMessageTxs.length,
              recipientCount: recipients.length,
              attestationCount: attestationMessages.length,
              transactions: receiveMessageTxs.map((tx, idx) => ({
                index: idx,
                recipient: recipients[idx].address,
                dataLength: tx.data.length
              }))
            });

            // Send batch receiveMessage transaction
            const batchResponse = await fetch('/api/wallet/receive', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-backend-wallet-address': sourceWallet.address
              },
              body: JSON.stringify({
                transactions: receiveMessageTxs,
                chain: destConfig.chainId.toString(),
                isDestination: true
              })
            });

            if (!batchResponse.ok) {
              const error = await batchResponse.json();
              throw new Error(error.error || 'Failed to send receive message');
            }

            const batchResult = await batchResponse.json();
            console.log('Transaction submitted:', {
              chain,
              queueId: batchResult.result.queueId
            });

            // Poll for transaction status
            const mintTxHash = await pollTransactionStatus(batchResult.result.queueId);

            // Update all recipients with success
            recipients.forEach(recipient => {
              setTransferState(prev => ({
                ...prev,
                recipientStates: {
                  ...prev.recipientStates,
                  [recipient.address]: {
                    status: 'completed',
                    message: 'Transfer completed!',
                    transactionHash: batchTxHash,
                    mintTransactionHash: mintTxHash
                  }
                }
              }));
            });

            break;
          } catch (error) {
            console.error(`Error processing chain ${chain} (attempt ${retryCount + 1}):`, error);
            retryCount++;
            
            if (retryCount === maxRetries) {
              throw error;
            }
          }
        }
      } catch (error) {
        console.error(`Failed to process chain ${chain}:`, error);
        // Update all recipients with failure
        recipients.forEach(recipient => {
          setTransferState(prev => ({
            ...prev,
            recipientStates: {
              ...prev.recipientStates,
              [recipient.address]: {
                status: 'failed',
                message: error instanceof Error ? error.message : 'Unknown error occurred',
                transactionHash: batchTxHash
              }
            }
          }));
        });
      }
    } catch (error) {
      console.error('Transfer error:', error);
      setTransferState({
        status: 'failed',
        recipientStates: Object.fromEntries(
          recipients.map(recipient => [
            recipient.address,
            {
              status: 'failed',
              message: error instanceof Error ? error.message : 'Unknown error occurred'
            }
          ])
        )
      });
    }
  };

  const getTransferStatusMessage = () => {
    switch (transferState.status) {
      case 'mining':
        return 'Waiting for burn transaction to be mined...';
      case 'processing':
        // Check if all recipients are completed
        const allCompleted = Object.values(transferState.recipientStates).every(
          state => state.status === 'completed'
        );
        if (allCompleted) {
          return 'All transfers completed!';
        }
        // Check if any recipients failed
        const anyFailed = Object.values(transferState.recipientStates).some(
          state => state.status === 'failed'
        );
        if (anyFailed) {
          return 'Some transfers failed';
        }
        return 'Processing cross-chain transfers...';
      case 'failed':
        return `Transfer failed: ${transferState.error}`;
      default:
        return '';
    }
  };

  const getRecipientStatusMessage = (address: string) => {
    const state = transferState.recipientStates[address];
    if (!state) return '';

    if (state.message) {
      return state.message;
    }

    switch (state.status) {
      case 'processing':
        return 'Processing transfer...';
      case 'waitingForAttestation':
        return 'Waiting for attestation...';
      case 'receiving':
        return 'Receiving tokens on destination chain...';
      case 'completed':
        return 'Transfer completed!';
      case 'failed':
        return `Transfer failed: ${state.error}`;
      default:
        return '';
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(''), 2000);
  };

  return (
    <main className="min-h-screen bg-[#0f172a] p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">USDC Payroll Batch Transfer</h1>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Reset Transfer
          </button>
        </div>

        {/* Source Wallet Section */}
        <div className="border border-gray-700 p-4 rounded-lg bg-[#1e293b]">
          <div className="flex justify-between items-start mb-4">
            <h4 className="text-white">Sender</h4>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Chain</label>
              <select
                value={sourceChain}
                onChange={(e) => {
                  setSourceChain(e.target.value);
                  debouncedFetchBalances(e.target.value);
                }}
                className="w-full p-2 border border-gray-600 rounded bg-[#0f172a] text-white"
              >
                {chains.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {sourceWallet ? (
              <>
                <div className="flex items-center space-x-2">
                  <p className="text-gray-400">Address:</p>
                  <p className="text-white">{sourceWallet.address}</p>
                  <button
                    onClick={() => copyToClipboard(sourceWallet.address, 'address')}
                    className="text-blue-500 hover:text-blue-400"
                  >
                    {copiedText === 'address' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <p className="text-gray-400">Balance:</p>
                  <p className="text-white">
                    {balanceLoading[sourceChain] ? 'Loading...' : (balances[sourceChain] || '0')} USDC
                  </p>
                  <button
                    onClick={() => fetchBalances()}
                    disabled={balanceLoading[sourceChain]}
                    className="text-blue-500 hover:text-blue-400 disabled:opacity-50"
                  >
                    {balanceLoading[sourceChain] ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => handleCreateWallet(sourceChain)}
                disabled={loading}
                className="w-full p-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Source Wallet'}
              </button>
            )}
          </div>
        </div>

        {/* Recipients Section */}
        <RecipientForm 
          recipients={recipients} 
          onRecipientsChange={setRecipients}
          isTransferStarted={transferState.status !== 'idle'}
          balances={balances}
          balanceLoading={balanceLoading}
          onRefreshBalance={handleRefreshBalance}
        />

        {/* Recipient Statuses */}
        {transferState.status !== 'idle' && (
          <div className="border border-gray-700 p-6 rounded-lg bg-[#0f172a]">
            <h2 className="text-xl font-semibold mb-4 text-white">Transfer Status</h2>
            <div className="space-y-4">
              <div className="flex flex-col space-y-2">
                <div className="text-white">
                  {getTransferStatusMessage()}
                </div>
                
                {/* Batch Transaction at Top Level */}
                {Object.values(transferState.recipientStates)[0]?.transactionHash && (
                  <div className="flex items-center justify-between text-sm border-t border-gray-700 pt-4">
                    <span className="text-gray-400">Atomic Batch Transaction Hash (Approve + Burns):</span>
                    <a 
                      href={`${CCTP_CONFIG[sourceChain].explorerUrl}/tx/${Object.values(transferState.recipientStates)[0]?.transactionHash || ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-400"
                    >
                      {(Object.values(transferState.recipientStates)[0]?.transactionHash || '').slice(0, 6)}...
                      {(Object.values(transferState.recipientStates)[0]?.transactionHash || '').slice(-4)}
                    </a>
                  </div>
                )}
              </div>

              {/* Individual Recipient Sections - Grouped by Chain */}
              {(() => {
                // Group recipients by chain
                const recipientsByChain: { [chain: string]: typeof recipients } = {};
                recipients.forEach(recipient => {
                  if (!recipientsByChain[recipient.chain]) {
                    recipientsByChain[recipient.chain] = [];
                  }
                  recipientsByChain[recipient.chain].push(recipient);
                });

                return Object.entries(recipientsByChain).map(([chain, chainRecipients], chainIndex) => {
                  const firstRecipientState = transferState.recipientStates[chainRecipients[0].address];
                  const destConfig = CCTP_CONFIG[chain];
                  
                  return (
                    <div key={chain} className="border-t border-gray-700 pt-4">
                      <div className="flex flex-col space-y-4">
                        {/* Chain Header */}
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-gray-400">Destination Chain</p>
                            <p className="text-white">{chain}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-gray-400">Status</p>
                            <p className="text-white">{firstRecipientState?.message || ''}</p>
                          </div>
                        </div>

                        {/* Shared Mint Transaction for the Chain */}
                        {firstRecipientState?.mintTransactionHash && (
                          <div className="flex items-center justify-between text-sm bg-[#1e293b] p-3 rounded">
                            <span className="text-gray-400">Atomic Batch Mint Transaction:</span>
                            <a 
                              href={`${destConfig.explorerUrl}/tx/${firstRecipientState.mintTransactionHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-400"
                            >
                              {firstRecipientState.mintTransactionHash.slice(0, 6)}...
                              {firstRecipientState.mintTransactionHash.slice(-4)}
                            </a>
                          </div>
                        )}

                        {/* Recipients for this Chain */}
                        <div className="pl-4 space-y-3">
                          {chainRecipients.map((recipient, index) => {
                            const recipientState = transferState.recipientStates[recipient.address];
                            return (
                              <div key={recipient.address} className="flex justify-between items-center text-sm">
                                <div>
                                  <p className="text-gray-400">Recipient {index + 1}</p>
                                  <p className="text-white">{recipient.address}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-white">{recipientState?.status === 'failed' ? 
                                    `Failed: ${recipientState.message}` : 
                                    recipientState?.status || ''}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Transfer Button */}
        {sourceWallet && recipients.length > 0 && (
          <button
            onClick={handleTransfer}
            disabled={transferState.status !== 'idle'}
            className="w-full p-4 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {transferState.status === 'idle' ? 'Send Batch Transfer' : getTransferStatusMessage()}
          </button>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-900 text-white rounded">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
