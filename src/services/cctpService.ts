import axios from 'axios';
import { CCTP_CONFIG, WalletResponse, BalanceResponse, TransactionResponse, AttestationResponse, CCTPConfig, TransactionStatusResponse, TransferResponse } from '../types/cctp';
import { Interface, getAddress } from 'ethers';
import { pad } from 'viem';

const API_BASE_URL = 'http://localhost:3005';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

interface CircleAttestationResponse {
  messages: Array<{
    status: string;
    message: string;
    attestation: string;
  }>;
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

async function pollTransactionStatus(queueId: string, timeout = 300000): Promise<string> {
  const startTime = Date.now();
  let lastStatus = '';
  let lastTxHash: string | undefined;
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`/api/transaction/status/${queueId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API error: ${errorData.error || 'Unknown error'}`);
      }
      
      const data: TransactionStatusResponse = await response.json();
      const currentTxHash = data.result.transactionHash || data.result.txHash;
      
      // Log full response data for debugging
      console.log(`Transaction status for ${queueId}:`, {
        status: data.result.status,
        txHash: currentTxHash,
        queueId: queueId,
        fullData: data.result
      });

      // Track status changes
      if (data.result.status !== lastStatus) {
        console.log(`Status changed from ${lastStatus || 'initial'} to ${data.result.status}`);
        lastStatus = data.result.status;
      }

      // Track txHash changes
      if (currentTxHash !== lastTxHash) {
        console.log(`TxHash changed from ${lastTxHash || 'none'} to ${currentTxHash || 'none'}`);
        lastTxHash = currentTxHash;
      }
      
      switch (data.result.status) {
        case 'mined':
          // If we have a current txHash, return it
          if (currentTxHash) {
            return currentTxHash;
          }
          // If we have a previously stored txHash, use that
          if (lastTxHash) {
            return lastTxHash;
          }
          // If we don't have a txHash but status is mined, wait a bit and try again
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        case 'failed':
          throw new Error(`Transaction failed: ${currentTxHash || 'No transaction hash'}`);
        case 'queued':
        case 'submitted':
        case 'sent':
          // Store txHash if available
          if (currentTxHash) {
            lastTxHash = currentTxHash;
          }
          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        default:
          throw new Error(`Unknown transaction status: ${data.result.status}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Transaction failed')) {
        throw error;
      }
      console.error('Error polling transaction status:', error);
      // Wait before retry on error
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new Error(`Transaction polling timed out after ${timeout/1000} seconds`);
}

export async function sendAtomicBatchTransaction(
  sourceConfig: CCTPConfig[keyof CCTPConfig],
  transactions: { toAddress: string; data: string; value: string }[],
  walletAddress: string,
  destinationChain: string,
  destinationAddress: string
): Promise<string> {
  try {
    // Convert amount to BigInt and handle decimals
    const amount = BigInt(transactions[1].value);

    // Create interfaces for encoding function calls
    const approveInterface = new Interface([
      'function approve(address spender, uint256 amount)'
    ]);
    const depositForBurnInterface = new Interface([
      'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 deadline)'
    ]);

    // Get the encoded data for approve
    const approveData = approveInterface.encodeFunctionData('approve', [
      sourceConfig.tokenMessenger, // spender is the token messenger contract
      amount.toString() // amount to approve as string
    ]);

    // Calculate max fee (1/5000 of amount)
    const maxFee = amount / BigInt(5000);

    // Get the encoded data for depositForBurn
    const depositForBurnData = depositForBurnInterface.encodeFunctionData('depositForBurn', [
      amount.toString(), // amount as string
      CCTP_CONFIG[destinationChain].domain.toString(), // destination domain as string
      pad(destinationAddress as `0x${string}`), // mint recipient as bytes32 (using destination address)
      sourceConfig.usdc as `0x${string}`, // burn token
      "0x0000000000000000000000000000000000000000000000000000000000000000", // destination caller as full zero string
      maxFee.toString(), // max fee as string
      "1000" // deadline - using the known working value
    ]);

    // Update transactions with encoded data
    const encodedTransactions = [
      {
        toAddress: sourceConfig.usdc,
        data: approveData,
        value: "0"
      },
      {
        toAddress: sourceConfig.tokenMessenger,
        data: depositForBurnData,
        value: "0" // Value is 0 because amount is in the data
      }
    ];

    console.log('Sending encoded transactions:', {
      amount: amount.toString(),
      transactions: encodedTransactions,
      approveData,
      depositForBurnData,
      sourceAddress: walletAddress,
      destinationAddress // Log destination address for verification
    });

    const response = await fetch('/api/wallet/transfer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-wallet-address': walletAddress
      },
      body: JSON.stringify({ transactions: encodedTransactions })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send transfer');
    }

    const data: TransferResponse = await response.json();
    console.log('Transfer queued with ID:', data.result.queueId);

    // Poll for transaction status and return the transaction hash
    return await pollTransactionStatus(data.result.queueId);
  } catch (error) {
    console.error('Error in sendAtomicBatchTransaction:', error);
    throw error;
  }
}

export async function waitForAttestation(
  sourceDomain: string,
  transactionHash: string
): Promise<AttestationResponse> {
  const maxAttempts = 30; // 5 minutes total with 10-second intervals
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`Attestation attempt ${attempts}/${maxAttempts}`);
      
      const response = await axios.get<AttestationResponse>(`/api/attestation/${sourceDomain}/${transactionHash}`);
      
      // Log the response for debugging
      console.log('Attestation response:', {
        status: response.status,
        data: response.data
      });

      // If we get a complete attestation, return it immediately
      if (response.data.attestation && response.status === 200) {
        console.log('Complete attestation found:', response.data);
        return response.data;
      }
      
      // For any other response (including 202/pending), wait and continue polling
      console.log('Attestation not complete yet, continuing to poll...');
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before next attempt
      
    } catch (error) {
      // Log error but continue polling
      console.error('Error in attestation attempt:', error);
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before next attempt
    }
  }

  throw new Error(`Timeout waiting for attestation after ${maxAttempts} attempts`);
}

export async function receiveMessage(
  chain: string,
  walletId: string,
  message: string,
  attestation: string
): Promise<TransactionResponse> {
  try {
    const config = CCTP_CONFIG[chain];
    if (!config) {
      throw new Error(`Invalid chain: ${chain}`);
    }

    // Checksum the addresses
    const checksummedWalletId = getAddress(walletId);
    const checksummedMessageTransmitter = getAddress(config.messageTransmitter);

    console.log('Receiving message with:', {
      chain,
      walletId: checksummedWalletId,
      messageTransmitter: checksummedMessageTransmitter,
      message,
      attestation
    });

    const response = await fetch('/api/wallet/receive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-wallet-address': checksummedWalletId
      },
      body: JSON.stringify({
        chain,
        contractAddress: checksummedMessageTransmitter,
        abiParameters: [message, attestation]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to receive message');
    }

    const data = await response.json();
    console.log('Receive message response:', data);

    if (!data.result?.queueId) {
      throw new Error('No queueId in response');
    }

    // Poll for transaction status
    const txHash = await pollTransactionStatus(data.result.queueId);
    console.log('Receive transaction hash:', txHash);

    return {
      transactionHash: txHash
    };
  } catch (error) {
    console.error('Error in receiveMessage:', error);
    throw error;
  }
} 