import { NextResponse } from 'next/server';

const API_BASE_URL = 'http://localhost:3005';

export async function GET(
  request: Request,
  { params }: { params: { queueId: string } }
) {
  try {
    const queueId = params.queueId;
    
    console.log('=== Checking Transaction Status ===');
    console.log('QueueId:', queueId);

    const response = await fetch(
      `${API_BASE_URL}/transaction/status/${queueId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_THIRDWEB_ENGINE_ACCESS_TOKEN}`,
        },
      }
    );

    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Transaction status data:', data);

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || 'Failed to get transaction status' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error checking transaction status:', error);
    return NextResponse.json(
      { error: 'Failed to check transaction status' },
      { status: 500 }
    );
  }
} 