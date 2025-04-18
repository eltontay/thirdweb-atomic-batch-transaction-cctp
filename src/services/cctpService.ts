import axios from 'axios';
import { CCTP_CONFIG, WalletResponse, BalanceResponse, TransactionResponse, AttestationResponse, CCTPConfig, TransactionStatusResponse, TransferResponse, PayrollRecipient, PayrollBatchResponse, RecipientTransferState, CCTPTransferStatus, CircleMessage } from '../types/cctp';
import { Interface, getAddress } from 'ethers';
import { pad } from 'viem';

const API_BASE_URL = 'http://localhost:3005';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

interface CircleAttestationResponse {
  message: string;
  attestation: string;
}

export const createWallet = async (chain: string, label: string): Promise<WalletResponse> => {
  const response = await axios.post<WalletResponse>('/api/wallet/create', {
    type: 'smart:circle',
    credentialId: process.env.NEXT_PUBLIC_THIRDWEB_CREDENTIAL_ID,
    label,
    isTestnet: 'true',
  });
  return response.data;
};

export const getUSDCBalance = async (chain: string, walletAddress: string): Promise<BalanceResponse> => {
  const config = CCTP_CONFIG[chain];
  if (!config) {
    throw new Error(`Invalid chain: ${chain}`);
  }

  console.log('Fetching balance for:', {
    chain,
    chainId: config.chainId,
    walletAddress,
    contractAddress: config.usdc
  });

  const response = await axios.get<BalanceResponse>(
    `/api/wallet/balance?chain=${config.chainId}&wallet_address=${walletAddress}`
  );
  
  console.log('Balance API Response:', {
    status: response.status,
    data: response.data
  });
  
  return response.data;
};

export async function pollTransactionStatus(queueId: string, shouldContinue?: () => boolean): Promise<string> {
  const maxAttempts = 240; // 20 minutes total with 5-second intervals
  const initialDelay = 2000; // Reduced from 5000ms to 2000ms
  const pollingInterval = 2000; // Reduced from 5000ms to 2000ms
  let attempts = 0;

  // Initial delay to allow transaction to process
  console.log(`Starting to poll transaction status in ${initialDelay/1000} seconds...`);
  await new Promise(resolve => setTimeout(resolve, initialDelay));

  while (attempts < maxAttempts) {
    // Check if we should continue polling
    if (shouldContinue && !shouldContinue()) {
      throw new Error('Polling cancelled');
    }

    try {
      console.log(`Polling transaction status for queueId: ${queueId}, attempt: ${attempts + 1}`);
      const response = await fetch(`/api/transaction/status/${queueId}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Transaction status error:', {
          status: response.status,
          error: errorData,
          queueId,
          attempt: attempts + 1
        });
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Transaction status data:', data, 'Attempt:', attempts + 1, 'Time elapsed:', ((attempts * pollingInterval + initialDelay)/1000/60).toFixed(1), 'minutes');
      
      if (data.result.transactionHash) {
        // Check if the transaction is actually confirmed
        if (data.result.onchainStatus === 'success') {
          console.log('Transaction confirmed:', {
            queueId,
            transactionHash: data.result.transactionHash,
            status: data.result.status,
            onchainStatus: data.result.onchainStatus
          });
          return data.result.transactionHash;
        } else if (data.result.onchainStatus === 'failed') {
          throw new Error(`Transaction failed on-chain: ${data.result.errorMessage || 'No error details available'}`);
        }
      } else if (data.result.status === 'failed' || data.result.status === 'errored') {
        throw new Error(`Transaction ${data.result.status}: ${data.result.errorMessage || 'No error details available'}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, pollingInterval));
      attempts++;
    } catch (error) {
      console.error('Error polling transaction status:', error);
      throw error;
    }
  }

  throw new Error('Transaction polling timeout after 20 minutes');
}

// Helper function to calculate total amount from recipients
function calculateTotalAmount(recipients: { amount: string }[]): bigint {
  return recipients.reduce((sum, recipient) => {
    return sum + BigInt(recipient.amount);
  }, BigInt(0));
}

// Helper function to get chain config
function getChainConfig(chain: string): CCTPConfig[keyof CCTPConfig] {
  const config = CCTP_CONFIG[chain];
  if (!config) {
    throw new Error(`Invalid chain: ${chain}`);
  }
  return config;
}

export async function sendAtomicBatchTransaction(
  sourceConfig: CCTPConfig[keyof CCTPConfig],
  walletAddress: string,
  recipients: { chain: string; address: string; amount: string }[],
  customTransactions?: { toAddress: string; data: string; value: string }[]
): Promise<{ queueId: string; recipientStates: { [address: string]: RecipientTransferState } }> {
  try {
    const totalAmount = calculateTotalAmount(recipients);

    const approveInterface = new Interface([
      'function approve(address spender, uint256 amount)'
    ]);
    const depositForBurnInterface = new Interface([
      'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 deadline)'
    ]);

    const approveData = approveInterface.encodeFunctionData('approve', [
      sourceConfig.tokenMessenger,
      totalAmount.toString()
    ]);

    const burnTransactions = recipients.map((recipient) => {
      const destinationConfig = getChainConfig(recipient.chain);
      const maxFee = BigInt(recipient.amount) / BigInt(5000);

      console.log('Creating burn transaction for:', {
        chain: recipient.chain,
        domain: destinationConfig.domain,
        recipient: recipient.address,
        amount: recipient.amount,
        maxFee: maxFee.toString(),
        deadline: "1000"
      });

      return {
        toAddress: sourceConfig.tokenMessenger,
        data: depositForBurnInterface.encodeFunctionData('depositForBurn', [
          recipient.amount,
          destinationConfig.domain,
          pad(recipient.address as `0x${string}`),
          sourceConfig.usdc as `0x${string}`,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          maxFee.toString(),
          "1000"
        ]),
        value: "0"
      };
    });

    const encodedTransactions = [
      {
        toAddress: sourceConfig.usdc,
        data: approveData,
        value: "0"
      },
      ...burnTransactions,
      ...(customTransactions || [])
    ];

    const response = await fetch('/api/wallet/transfer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-wallet-address': walletAddress
      },
      body: JSON.stringify({ 
        transactions: encodedTransactions,
        sourceChain: sourceConfig.chainId.toString()
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send transfer');
    }

    const data: TransferResponse = await response.json();
    
    // Initialize recipient states with individual burn transaction IDs
    const recipientStates: { [address: string]: RecipientTransferState } = {};
    recipients.forEach((recipient, index) => {
      // Skip the first transaction (approve) and map each recipient to their burn transaction
      const burnTxIndex = index + 1; // +1 to account for the approve transaction
      recipientStates[recipient.address] = { 
        status: 'idle',
        burnQueueId: data.result.queueId // We'll need to modify the backend to return individual queue IDs
      };
    });

    return {
      queueId: data.result.queueId,
      recipientStates
    };
  } catch (error) {
    console.error('Error in sendAtomicBatchTransaction:', error);
    throw error;
  }
}

export async function waitForAttestation(
  sourceDomain: string,
  transactionHash: string,
  shouldContinue?: () => boolean
): Promise<CircleMessage[]> {
  const maxAttempts = 720; // 6 hours with 30-second intervals
  const pollingInterval = 5000; // Check every 5 seconds
  let attempts = 0;

  console.log('Starting attestation polling for:', {
    sourceDomain,
    transactionHash
  });

  while (attempts < maxAttempts) {
    if (shouldContinue && !shouldContinue()) {
      throw new Error('Attestation polling cancelled');
    }

    try {
      attempts++;
      console.log(`Attestation attempt ${attempts}/${maxAttempts} (${(attempts * pollingInterval/1000/60).toFixed(1)} minutes elapsed)`);
      
      const response = await axios.get<AttestationResponse>(`/api/attestation/${sourceDomain}/${transactionHash}`);
      
      // Check if we have a valid attestation
      if (!response.data?.messages?.[0]?.message || !response.data?.messages?.[0]?.attestation) {
        console.log('Attestation not ready yet:', response.data);
        await new Promise(resolve => setTimeout(resolve, pollingInterval));
        continue;
      }

      // Return all messages from the attestation response
      console.log('Attestation ready with messages:', {
        messageCount: response.data.messages.length,
        messages: response.data.messages.map((msg: any, idx: number) => ({
          index: idx,
          messageLength: msg.message.length,
          attestationLength: msg.attestation.length
        }))
      });
      
      return response.data.messages;
    } catch (error) {
      console.error('Error in attestation attempt:', error);
      console.error('Error response:', {
        error: error,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }
  }

  throw new Error(`Timeout waiting for attestation after 6 hours`);
}

export async function receiveMessage(
  chain: string,
  walletId: string,
  message: string,
  attestation: string,
  shouldContinue?: () => boolean
): Promise<TransactionResponse> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const config = getChainConfig(chain);
      const checksummedWalletId = getAddress(walletId);
      const checksummedMessageTransmitter = getAddress(config.messageTransmitter);

      // Add exponential backoff delay between retries
      if (attempt > 0) {
        const backoffDelay = Math.min(30000, 10000 * Math.pow(2, attempt - 1)); // Max 30 seconds
        console.log(`Retry attempt ${attempt + 1}, waiting ${backoffDelay/1000}s with exponential backoff...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }

      console.log('Calling receiveMessage with:', {
        chain,
        chainId: config.chainId,
        messageTransmitter: checksummedMessageTransmitter,
        recipientWallet: checksummedWalletId,
        attempt: attempt + 1,
        messageLength: message.length,
        attestationLength: attestation.length
      });

      const response = await fetch('/api/wallet/receive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-backend-wallet-address': checksummedWalletId
        },
        body: JSON.stringify({
          chain: config.chainId.toString(),
          contractAddress: checksummedMessageTransmitter,
          functionName: 'receiveMessage(bytes,bytes)',
          abiParameters: [message, attestation]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Receive message error:', {
          status: response.status,
          error: errorData,
          chain,
          chainId: config.chainId,
          attempt: attempt + 1
        });
        
        // Check for specific error types
        const errorMessage = errorData.error || 'Failed to receive message';
        if (errorMessage.includes('nonce')) {
          console.error('Nonce error detected:', {
            error: errorMessage,
            chain,
            wallet: checksummedWalletId
          });
        }
        
        // If it's a timeout error, nonce error, or polling timeout, retry
        if (errorMessage.includes('timeout') || 
            errorMessage.includes('nonce') || 
            errorMessage.includes('Transaction polling timeout')) {
          console.log('Retrying due to:', errorMessage);
          attempt++;
          continue;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Receive message response:', {
        ...data,
        chain,
        wallet: checksummedWalletId,
        attempt: attempt + 1
      });

      if (!data.result?.queueId) {
        throw new Error('No queueId in response');
      }

      // Add longer initial delay before polling
      console.log('Waiting 15 seconds before starting to poll...');
      await new Promise(resolve => setTimeout(resolve, 15000));

      try {
        const txHash = await pollTransactionStatus(data.result.queueId, shouldContinue);
        
        // Add delay after successful transaction to allow nonce sync
        console.log('Waiting 15s for bundler to sync nonce...');
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        // Log successful transaction completion
        console.log('Successfully completed receiveMessage:', {
          chain,
          wallet: checksummedWalletId,
          queueId: data.result.queueId,
          transactionHash: txHash,
          attempt: attempt + 1
        });
        
        return { transactionHash: txHash };
      } catch (pollError) {
        console.error('Error polling transaction status:', pollError);
        
        // If polling times out, retry the entire receiveMessage call
        if (pollError instanceof Error && pollError.message.includes('timeout')) {
          console.log('Polling timed out, retrying entire receiveMessage call...');
          attempt++;
          continue;
        }
        
        throw pollError;
      }
    } catch (error) {
      console.error(`Error in receiveMessage attempt ${attempt + 1}:`, error);
      
      if (attempt === maxRetries - 1) {
        throw error;
      }
      attempt++;
    }
  }

  throw new Error('Max retries exceeded for receiveMessage');
}

export async function sendPayrollBatchTransaction(
  sourceChain: string,
  walletAddress: string,
  recipients: PayrollRecipient[]
): Promise<PayrollBatchResponse> {
  try {
    if (!recipients?.length) {
      throw new Error('No recipients provided');
    }

    const sourceConfig = getChainConfig(sourceChain);
    const totalAmount = calculateTotalAmount(recipients);

    const { queueId, recipientStates } = await sendAtomicBatchTransaction(
      sourceConfig,
      walletAddress,
      recipients
    );

    return {
      result: {
        queueId,
        totalAmount: totalAmount.toString(),
        recipientCount: recipients.length,
        recipientStates
      }
    };
  } catch (error) {
    console.error('Error in sendPayrollBatchTransaction:', error);
    throw error;
  }
}

export async function getCircleAttestation(
  sourceChain: string,
  transactionHash: string
): Promise<{ message: string; attestation: string }> {
  try {
    const config = getChainConfig(sourceChain);
    const response = await fetch(`/api/attestation/${config.domain}/${transactionHash}`);
    
    if (!response.ok) {
      if (response.status === 202) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return getCircleAttestation(sourceChain, transactionHash);
      }
      throw new Error('Failed to get attestation');
    }

    const data = await response.json();
    return {
      message: data.message,
      attestation: data.attestation
    };
  } catch (error) {
    console.error('Error getting Circle attestation:', error);
    throw error;
  }
}

export async function processRecipientMinting(
  destinationChain: string,
  senderWallet: string,
  message: string,
  attestation: string,
  onStateUpdate?: (state: { status: CCTPTransferStatus; message: string; transactionHash?: string; mintTransactionHash?: string }) => void
): Promise<string> {
  try {
    const shouldContinue = () => !!onStateUpdate;

    if (onStateUpdate) {
      onStateUpdate({
        status: 'receiving',
        message: 'Receiving tokens on destination chain...'
      });
    }

    console.log('Processing recipient minting:', {
      destinationChain,
      senderWallet
    });

    // Call receiveMessage using the sender's wallet
    const receiveResponse = await receiveMessage(
      destinationChain,
      senderWallet,
      message,
      attestation,
      shouldContinue
    );

    // Add additional delay after successful minting to ensure nonce sync
    console.log('Adding extra delay after minting to ensure nonce sync...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    if (onStateUpdate) {
      onStateUpdate({
        status: 'completed',
        message: 'Transfer completed!',
        mintTransactionHash: receiveResponse.transactionHash
      });
    }

    return receiveResponse.transactionHash;
  } catch (error) {
    console.error('Error in processRecipientMinting:', error);
    
    if (onStateUpdate) {
      onStateUpdate({
        status: 'failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
    
    throw error;
  }
}