import { NextResponse } from 'next/server';
import { Interface } from 'ethers';

const API_BASE_URL = 'http://localhost:3005';

async function pollTransactionStatus(queueId: string): Promise<string> {
  const maxAttempts = 30; // 5 minutes with 10-second intervals
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`${API_BASE_URL}/transaction/status/${queueId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch transaction status');
      }

      const data = await response.json();
      console.log('Transaction status:', data);

      if (data.result.status === 'mined' && data.result.transactionHash) {
        // Verify onchain status
        if (data.result.onchainStatus === 'success') {
          return data.result.transactionHash;
        } else {
          throw new Error(`Transaction failed onchain: ${data.result.errorMessage || 'Unknown error'}`);
        }
      }

      // If not mined, wait before next attempt
      await new Promise(resolve => setTimeout(resolve, 10000));
      attempts++;
    } catch (error) {
      console.error('Error polling transaction:', error);
      await new Promise(resolve => setTimeout(resolve, 10000));
      attempts++;
    }
  }

  throw new Error('Transaction polling timeout');
}

export async function POST(request: Request) {
  try {
    // Get the wallet address from headers
    const walletAddress = request.headers.get('x-backend-wallet-address');
    if (!walletAddress) {
      return NextResponse.json({ error: 'Missing wallet address header' }, { status: 400 });
    }

    // Parse request body
    const body = await request.json();
    const { chain, contractAddress, abiParameters } = body;

    // Validate required fields
    if (!chain || !contractAddress || !abiParameters) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log('Calling receiveMessage with:', {
      chain,
      contractAddress,
      functionName: 'receiveMessage(bytes,bytes)',
      args: abiParameters
    });

    // Make request to thirdweb API
    const response = await fetch(`${API_BASE_URL}/contract/${chain}/${contractAddress}/write`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_THIRDWEB_ENGINE_ACCESS_TOKEN}`,
        'X-Backend-Wallet-Address': walletAddress
      },
      body: JSON.stringify({
        functionName: 'receiveMessage(bytes,bytes)',
        args: abiParameters
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Error from thirdweb API:', error);
      return NextResponse.json({ error: error.error || 'Failed to receive message' }, { status: response.status });
    }

    const data = await response.json();
    console.log('Thirdweb API response:', data);

    if (!data.result?.queueId) {
      throw new Error('No queueId in response');
    }

    // Poll for transaction status
    const txHash = await pollTransactionStatus(data.result.queueId);
    console.log('Transaction mined:', txHash);

    return NextResponse.json({
      result: {
        queueId: data.result.queueId,
        transactionHash: txHash
      }
    });
  } catch (error) {
    console.error('Error in receive endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 