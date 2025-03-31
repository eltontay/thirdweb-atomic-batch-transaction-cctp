# Thirdweb Engine Atomic Batch CCTP Demo

This project demonstrates cross-chain USDC transfers using Circle CCTP (Cross-Chain Transfer Protocol) with Thirdweb Smart Circle Wallets. The demo showcases atomic batch transactions, allowing users to approve and burn USDC in a single transaction, reducing gas costs and improving transaction reliability. The demo supports transfers between different testnet chains including Ethereum Sepolia, Base Sepolia, Avalanche Fuji, and Linea Sepolia.

## Features

- Create Thirdweb Smart Circle Wallets on different testnet chains
- Atomic batch transactions for USDC approval and burning
- Transfer USDC between chains using Circle CCTP
- Real-time balance tracking
- Transaction status monitoring
- Support for multiple testnet chains:
  - Ethereum Sepolia
  - Base Sepolia
  - Avalanche Fuji
  - Linea Sepolia

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- Thirdweb Engine running locally on port 3005
- Testnet tokens for gas fees

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
NEXT_PUBLIC_THIRDWEB_CREDENTIAL_ID=your_credential_id
NEXT_PUBLIC_THIRDWEB_API_URL=http://localhost:3005
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/thirdweb-atomic-batch-transaction-cctp.git
cd thirdweb-atomic-batch-transaction-cctp
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Start the development server:
```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. Create source and destination Thirdweb Smart Circle Wallets on your chosen chains
2. Fund the source wallet with testnet USDC
3. Enter the amount to transfer
4. Click "Transfer" to initiate the cross-chain transfer
5. Monitor the transfer progress in the UI

## Architecture

The project uses:
- Next.js 14 with App Router
- Thirdweb Engine for wallet management and transactions
- Circle CCTP Protocol
- Ethers.js for blockchain interactions
- Tailwind CSS for styling

## Supported Chains

The demo supports the following testnet chains:

- Ethereum Sepolia
- Base Sepolia
- Avalanche Fuji
- Linea Sepolia

Each chain has its own USDC contract and Circle CCTP infrastructure.

## Transaction Flow

1. **Atomic Approve & Burn**: 
   - The source wallet executes an atomic batch transaction that:
     - Approves the TokenMessenger contract to spend USDC
     - Burns the USDC in a single transaction
   - This atomic operation reduces gas costs and ensures both operations succeed or fail together
2. **Attestation**: Circle's infrastructure generates an attestation for the burn
3. **Mint**: The destination wallet receives the USDC on the destination chain

## Development

### Project Structure

```
src/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   └── page.tsx           # Main page component
├── services/              # Business logic
│   └── cctpService.ts     # CCTP-related functions
└── types/                 # TypeScript types
    └── cctp.ts           # CCTP-related types
```

### Key Components

- `page.tsx`: Main UI component handling wallet creation and transfers
- `cctpService.ts`: Service layer for Circle CCTP operations, including atomic batch transaction handling
- `api/wallet/*`: API routes for wallet operations
- `api/attestation/*`: API routes for attestation handling

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
