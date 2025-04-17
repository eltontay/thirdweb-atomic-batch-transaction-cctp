import { NextResponse } from 'next/server';

const API_BASE_URL = 'http://localhost:3005';

export async function POST(request: Request) {
  console.log('=== Incoming Request to /api/wallet/transfer ===');
  try {
    const body = await request.json();
    console.log('Received request body:', body);

    // Get the initiating wallet address from the request headers
    const initiatingWalletAddress = request.headers.get('x-backend-wallet-address');
    if (!initiatingWalletAddress) {
      return NextResponse.json(
        { error: 'Missing x-backend-wallet-address header' },
        { status: 400 }
      );
    }

    if (!body.transactions || !Array.isArray(body.transactions)) {
      return NextResponse.json(
        { error: 'Invalid request body - transactions array required' },
        { status: 400 }
      );
    }

    if (!body.sourceChain) {
      return NextResponse.json(
        { error: 'Source chain ID is required' },
        { status: 400 }
      );
    }

    const chainId = body.sourceChain;

    const url = `${API_BASE_URL}/backend-wallet/${chainId}/send-transaction-batch-atomic`;
    const headers = {
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_THIRDWEB_ENGINE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Backend-Wallet-Address': initiatingWalletAddress
    };

    console.log('=== Transfer Request Details ===');
    console.log('URL:', url);
    console.log('Headers:', {
      ...headers,
      'Authorization': 'Bearer [HIDDEN]'
    });
    console.log('Body:', JSON.stringify(body, null, 2));
    console.log('=============================');

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
        console.error('Transfer error:', responseData);
        return NextResponse.json(
          { error: responseData.error?.message || 'Failed to send transfer' },
          { status: response.status }
        );
      }

      return NextResponse.json(responseData);
    } catch (error) {
      console.error('Error sending transfer:', error);
      return NextResponse.json(
        { error: 'Failed to send transfer' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error sending transfer:', error);
    return NextResponse.json(
      { error: 'Failed to send transfer' },
      { status: 500 }
    );
  }
} 