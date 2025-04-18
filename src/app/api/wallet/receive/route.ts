import { NextResponse } from 'next/server';

const API_BASE_URL = 'http://localhost:3005';

export async function POST(request: Request) {
  console.log('=== Incoming Request to /api/wallet/receive ===');
  try {
    const body = await request.json();
    console.log('Received request body:', body);

    // Get the initiating wallet address from the request headers
    const walletAddress = request.headers.get('x-backend-wallet-address');
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Missing x-backend-wallet-address header' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.chain || !body.transactions || !Array.isArray(body.transactions)) {
      return NextResponse.json(
        { error: 'Missing required fields or invalid transactions array' },
        { status: 400 }
      );
    }

    const chainId = body.chain;

    console.log('Processing atomic batch receive message:', {
      chain: chainId,
      transactionCount: body.transactions.length,
      isDestination: body.isDestination
    });

    const url = `${API_BASE_URL}/backend-wallet/${chainId}/send-transaction-batch-atomic`;
    const headers = {
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_THIRDWEB_ENGINE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Backend-Wallet-Address': walletAddress
    };

    console.log('=== Receive Request Details ===');
    console.log('URL:', url);
    console.log('Headers:', {
      ...headers,
      'Authorization': 'Bearer [HIDDEN]'
    });
    console.log('Body:', JSON.stringify({
      transactions: body.transactions
    }, null, 2));
    console.log('=============================');

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const response = await fetch(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              transactions: body.transactions
            })
          }
        );

        console.log('Response status:', response.status);
        const responseData = await response.json();
        console.log('Response data:', responseData);

        if (!response.ok) {
          console.error('Receive error:', responseData);
          return NextResponse.json(
            { error: responseData.error?.message || 'Failed to receive message' },
            { status: response.status }
          );
        }

        return NextResponse.json(responseData);
      } catch (error) {
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
    }

    return NextResponse.json(
      { error: 'Failed to receive message' },
      { status: 500 }
    );
  } catch (error) {
    console.error('Error in receive endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to receive message' },
      { status: 500 }
    );
  }
} 