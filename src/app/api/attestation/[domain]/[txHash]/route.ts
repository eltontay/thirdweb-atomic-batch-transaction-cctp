import { NextResponse } from 'next/server';

const API_BASE_URL = 'https://iris-api-sandbox.circle.com/v2/messages';
const MAX_ATTEMPTS = 3; // We'll do a few quick attempts in the API route
const RETRY_DELAY = 2000; // 2 seconds between attempts

export async function GET(
  request: Request,
  { params }: { params: { domain: string; txHash: string } }
) {
  const { domain, txHash } = params;
  
  try {
    if (!domain || !txHash) {
      return NextResponse.json(
        { error: 'Domain and transaction hash are required' },
        { status: 400 }
      );
    }
    
    console.log('=== Checking Attestation ===');
    console.log('Domain:', domain);
    console.log('Transaction Hash:', txHash);

    // Try a few quick attempts
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

        console.log(`Attempt ${attempt} - Response status:`, response.status);
        const data = await response.json();
        console.log(`Attempt ${attempt} - Attestation data:`, data);

        // If we get a successful response
        if (response.ok) {
          const message = data.messages?.[0];
          if (!message) {
            console.log('No message found in response');
            if (attempt < MAX_ATTEMPTS) {
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              continue;
            }
            break;
          }

          // If status is complete, return the attestation
          if (message.status === 'complete') {
            return NextResponse.json({
              message: message.message,
              attestation: message.attestation
            });
          }
          
          // Not complete yet, continue polling if we have more attempts
          if (attempt < MAX_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
          
          // Return 202 to indicate still processing
          return NextResponse.json({
            status: message.status,
            message: 'Attestation is still processing'
          }, { status: 202 });
        }

        // If response not ok, wait before next attempt
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }
    }

    // After all attempts, return 202 to indicate still processing
    return NextResponse.json(
      { status: 'pending', message: 'Attestation is still processing' },
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