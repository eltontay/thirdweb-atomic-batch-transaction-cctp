'use client';

import { useState, useEffect } from 'react';
import { createWallet, getUSDCBalance, sendAtomicBatchTransaction, waitForAttestation, receiveMessage } from '../services/cctpService';
import { CCTP_CONFIG, CCTPTransferState, CCTPTransferStatus } from '../types/cctp';

export default function Home() {
  const [sourceWallet, setSourceWallet] = useState<{ id: string; address: string } | null>(null);
  const [destinationWallet, setDestinationWallet] = useState<{ id: string; address: string } | null>(null);
  const [sourceChain, setSourceChain] = useState<string>('ethereum-sepolia');
  const [destinationChain, setDestinationChain] = useState<string>('base-sepolia');
  const [amount, setAmount] = useState<string>('');
  const [balances, setBalances] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [balanceLoading, setBalanceLoading] = useState<{ [key: string]: boolean }>({});
  const [error, setError] = useState<string>('');
  const [copiedText, setCopiedText] = useState<string>('');
  const [transferState, setTransferState] = useState<CCTPTransferState>({
    status: 'idle'
  });

  const chains = Object.keys(CCTP_CONFIG);

  const fetchBalances = async (chain?: string) => {
    if (!sourceWallet?.address && !destinationWallet?.address) return;

    try {
      if (sourceWallet?.address && (!chain || chain === sourceChain)) {
        setBalanceLoading(prev => ({ ...prev, [sourceChain]: true }));
        console.log('Fetching source wallet balance:', {
          chain: sourceChain,
          address: sourceWallet.address
        });
        
        const sourceBalance = await getUSDCBalance(sourceChain, sourceWallet.address);
        console.log('Source balance result:', sourceBalance?.result?.displayValue);
        
        setBalances(prev => {
          const newBalances = {
            ...prev,
            [sourceChain]: sourceBalance?.result?.displayValue || '0'
          };
          console.log('Updated balances state:', newBalances);
          return newBalances;
        });
        setBalanceLoading(prev => ({ ...prev, [sourceChain]: false }));
      }
      
      if (destinationWallet?.address && (!chain || chain === destinationChain)) {
        setBalanceLoading(prev => ({ ...prev, [destinationChain]: true }));
        console.log('Fetching destination wallet balance:', {
          chain: destinationChain,
          address: destinationWallet.address
        });
        
        const destBalance = await getUSDCBalance(destinationChain, destinationWallet.address);
        console.log('Destination balance result:', destBalance);
        
        setBalances(prev => {
          const newBalances = {
            ...prev,
            [destinationChain]: destBalance?.result?.displayValue || '0'
          };
          console.log('Updated balances state:', newBalances);
          return newBalances;
        });
        setBalanceLoading(prev => ({ ...prev, [destinationChain]: false }));
      }
    } catch (err) {
      console.error('Failed to fetch balances:', err);
    }
  };

  // Initial balance fetch when wallets are created
  useEffect(() => {
    if (sourceWallet || destinationWallet) {
      fetchBalances();
    }
  }, [sourceWallet, destinationWallet]);

  const handleCreateWallet = async (chain: string, isSource: boolean) => {
    try {
      setLoading(true);
      setError('');
      const response = await createWallet(chain, `${chain}-${isSource ? 'source' : 'destination'}`);
      console.log('Wallet created:', response);

      if (!response.result?.walletAddress) {
        throw new Error('Invalid wallet response');
      }

      const walletData = {
        id: response.result.walletAddress,
        address: response.result.walletAddress
      };

      if (isSource) {
        setSourceWallet(walletData);
      } else {
        setDestinationWallet(walletData);
      }
    } catch (err) {
      console.error('Error creating wallet:', err);
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!amount || transferState.status !== 'idle') return;

    try {
      setTransferState({ status: 'approving' });

      // Convert amount to wei format (no decimals)
      const amountInWei = (parseFloat(amount) * 1e6).toString(); // USDC has 6 decimals

      const transactions = [
        {
          toAddress: CCTP_CONFIG[sourceChain].usdc,
          data: "", // Will be encoded by cctpService
          value: "0"
        },
        {
          toAddress: CCTP_CONFIG[sourceChain].tokenMessenger,
          data: "", // Will be encoded by cctpService
          value: amountInWei
        }
      ];

      // Send the transaction and wait for it to be mined
      const txHash = await sendAtomicBatchTransaction(
        CCTP_CONFIG[sourceChain],
        transactions,
        sourceWallet?.address || '',
        destinationChain,
        destinationWallet?.address || ''
      );

      // Update state to show successful burn
      setTransferState({
        status: 'burning',
        sourceTransactionHash: txHash,
        burnHash: txHash
      });

      // Short delay to show the burn success state
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Update state to show waiting for attestation
      setTransferState({
        status: 'waitingForAttestation',
        sourceTransactionHash: txHash,
        burnHash: txHash
      });

      try {
        // Wait for attestation
        const attestation = await waitForAttestation(
          CCTP_CONFIG[sourceChain].domain.toString(),
          txHash
        );
        
        // Update state to show receiving
        setTransferState({
          status: 'receiving',
          sourceTransactionHash: txHash,
          burnHash: txHash,
          attestation
        });

        // Call receiveMessage to complete the transfer
        const receiveResponse = await receiveMessage(
          destinationChain,
          destinationWallet?.id || '',
          attestation.message,
          attestation.attestation
        );

        // Refresh balances after successful transfer
        await fetchBalances();
        
        setTransferState({
          status: 'completed',
          sourceTransactionHash: txHash,
          burnHash: txHash,
          attestation,
          receiveHash: receiveResponse.transactionHash
        });
      } catch (attestationError) {
        console.error('Attestation failed:', attestationError);
        setTransferState({
          status: 'waitingForAttestation',
          sourceTransactionHash: txHash,
          burnHash: txHash,
          error: 'Attestation pending - please check back later'
        });
      }

    } catch (error) {
      console.error('Transfer failed:', error);
      setTransferState({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Transfer failed'
      });
    }
  };

  const getTransferStatusMessage = () => {
    switch (transferState.status) {
      case 'approving':
        return 'Approving USDC transfer...';
      case 'burning':
        return 'Burning USDC on source chain...';
      case 'waitingForAttestation':
        return 'Waiting for attestation...';
      case 'receiving':
        return 'Receiving USDC on destination chain...';
      case 'completed':
        return 'Transfer completed!';
      case 'failed':
        return `Transfer failed: ${transferState.error}`;
      default:
        return '';
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(''), 2000);
  };

  const WalletInfo = ({ title, chain, wallet, balance }: { title: string; chain: string; wallet: { id: string; address: string } | null; balance?: string }) => (
    <div className="border border-gray-700 p-6 rounded-lg bg-[#0f172a]">
      <h2 className="text-xl font-semibold mb-4 text-white">{title}</h2>
      <select
        value={chain}
        onChange={(e) => title === "Source Wallet" ? setSourceChain(e.target.value) : setDestinationChain(e.target.value)}
        className="w-full p-2 mb-4 border border-gray-600 rounded bg-[#1e293b] text-white"
      >
        {chains.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      
      {wallet ? (
        <div className="space-y-3">
          <div className="bg-[#1e293b] p-3 rounded border border-gray-600">
            <div className="flex justify-between items-center mb-1">
              <span className="text-gray-300">Wallet Address:</span>
              <button
                onClick={() => copyToClipboard(wallet.address, `${title} Address`)}
                className="text-blue-400 hover:text-blue-300 text-sm px-3 py-1 rounded border border-blue-400 hover:border-blue-300"
              >
                {copiedText === `${title} Address` ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-white break-all font-mono text-sm">{wallet.address}</p>
          </div>

          <div className="bg-[#1e293b] p-3 rounded border border-gray-600">
            <div className="flex justify-between items-center">
              <span className="text-gray-300">USDC Balance:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchBalances(chain)}
                  disabled={balanceLoading[chain]}
                  className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1 rounded border border-blue-400 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {balanceLoading[chain] ? (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                </button>
                <span className="text-white font-mono">{balance || '0'}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => handleCreateWallet(chain, title === "Source Wallet")}
          disabled={loading}
          className="w-full bg-blue-600 text-white px-4 py-3 rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating Wallet...
            </span>
          ) : (
            `Create ${title}`
          )}
        </button>
      )}
    </div>
  );

  return (
    <main className="min-h-screen p-8 bg-black text-white">
      <h1 className="text-4xl font-bold mb-8 text-center">CCTP Cross-Chain Transfer Demo</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
        <WalletInfo
          title="Source Wallet"
          chain={sourceChain}
          wallet={sourceWallet}
          balance={balances[sourceChain]}
        />
        <WalletInfo
          title="Destination Wallet"
          chain={destinationChain}
          wallet={destinationWallet}
          balance={balances[destinationChain]}
        />
      </div>

      {sourceWallet && destinationWallet && (
        <div className="mt-8 border border-gray-700 p-6 rounded-lg bg-[#0f172a] max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Transfer USDC</h2>
            <button
              onClick={() => {
                setTransferState({ status: 'idle' });
                fetchBalances(); // Refresh balances
              }}
              className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            >
              Reset Transfer
            </button>
          </div>
          <div className="flex gap-4">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="flex-1 p-3 border border-gray-600 rounded bg-[#1e293b] text-white"
            />
            <button
              onClick={handleTransfer}
              disabled={loading || !amount || transferState.status !== 'idle'}
              className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {getTransferStatusMessage()}
                </>
              ) : (
                'Transfer'
              )}
            </button>
          </div>

          {/* Transfer Progress */}
          {transferState.status !== 'idle' && (
            <div className="mt-4 space-y-2">
              {transferState.sourceTransactionHash && (
                <p>
                  Source Transaction: <a
                    href={`${CCTP_CONFIG[sourceChain].explorerUrl}/tx/${transferState.sourceTransactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-700"
                  >
                    View on Explorer
                  </a>
                  <span className="ml-2 text-gray-400">(Approval and Burn USDC on {sourceChain})</span>
                </p>
              )}
              {transferState.attestation && (
                <p>
                  Attestation Status: <span className="text-green-500">Complete</span>
                </p>
              )}
              {(transferState.status === 'receiving' || transferState.receiveHash) && (
                <p>
                  Destination Transaction: {transferState.receiveHash ? (
                    <>
                      <a
                        href={`${CCTP_CONFIG[destinationChain].explorerUrl}/tx/${transferState.receiveHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700"
                      >
                        View on Explorer
                      </a>
                      <span className="ml-2 text-gray-400">
                        (Mint USDC on {destinationChain})
                      </span>
                    </>
                  ) : (
                    <span className="text-yellow-500">Processing...</span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-900/50 text-red-200 rounded max-w-6xl mx-auto border border-red-500">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-red-200 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        </div>
      )}
    </main>
  );
}
