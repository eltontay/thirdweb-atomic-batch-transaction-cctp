import { NextResponse } from 'next/server';

const API_BASE_URL = 'https://iris-api-sandbox.circle.com/v2/messages';
const MAX_ATTEMPTS = 3;
const RETRY_DELAY = 2000;

interface CircleMessage {
  status: string;
  attestation: string;
  message: string;
}

export async function GET(
  request: Request,
  context: { params: { domain: string; txHash: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const { domain, txHash } = params;
    
    if (!domain || !txHash) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }
    
    console.log('Checking attestation:', { domain, txHash });

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(
          `${API_BASE_URL}/${domain}?transactionHash=${txHash}`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CIRCLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          if (attempt < MAX_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
          throw new Error(`Circle API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('Circle API response:', data);

        if (!data.messages || !Array.isArray(data.messages) || data.messages.length === 0) {
          return NextResponse.json(
            { status: 'processing', message: 'No messages found yet' },
            { status: 202 }
          );
        }

        // Check if all attestations are ready
        const allComplete = data.messages.every((message: CircleMessage) => 
          message.status === 'complete' && message.attestation && message.attestation !== 'PENDING'
        );

        if (!allComplete) {
          return NextResponse.json(
            { status: 'processing', message: 'Some attestations still processing' },
            { status: 202 }
          );
        }

        console.log('All attestations ready:', {
          messageCount: data.messages.length,
          messages: data.messages.map((msg: CircleMessage, idx: number) => ({
            index: idx,
            status: msg.status,
            hasAttestation: !!msg.attestation
          }))
        });

        return NextResponse.json({ messages: data.messages });

      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          continue;
        }
        throw error;
      }
    }

    return NextResponse.json(
      { status: 'pending', message: 'Attestation still processing' },
      { status: 202 }
    );

  } catch (error) {
    console.error('Error getting attestation:', error);
    return NextResponse.json(
      { error: 'Failed to get attestation' },
      { status: 500 }
    );
  }
} 