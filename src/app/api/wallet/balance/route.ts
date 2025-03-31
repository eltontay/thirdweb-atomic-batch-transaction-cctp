import { NextResponse } from 'next/server';
import { CCTP_CONFIG } from '@/types/cctp';

const API_BASE_URL = 'http://localhost:3005';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chainId = searchParams.get('chain');
    const wallet_address = searchParams.get('wallet_address');

    if (!chainId || !wallet_address) {
      return NextResponse.json(
        { error: 'Chain ID and wallet address are required' },
        { status: 400 }
      );
    }

    // Find chain config by chain ID
    const chainConfig = Object.values(CCTP_CONFIG).find(
      config => config.chainId.toString() === chainId
    );

    if (!chainConfig) {
      console.error('Invalid chain ID:', chainId);
      return NextResponse.json(
        { error: 'Invalid chain ID' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${API_BASE_URL}/contract/${chainId}/${chainConfig.usdc}/erc20/balance-of?wallet_address=${wallet_address}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_THIRDWEB_ENGINE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Balance fetch error:', errorData);
      return NextResponse.json(
        { error: errorData.error?.message || 'Failed to get balance' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error getting balance:', error);
    return NextResponse.json(
      { error: 'Failed to get balance' },
      { status: 500 }
    );
  }
} 