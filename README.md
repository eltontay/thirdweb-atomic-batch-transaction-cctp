# Thirdweb Engine Atomic Batch CCTP Demo

> **Important**: This project requires local setup and cannot be run directly in Replit or other online environments. You must fork this repository, download it to your local machine, and run it there.

This project demonstrates cross-chain USDC transfers using Circle CCTP (Cross-Chain Transfer Protocol) with Thirdweb Engine's Smart Circle Wallets. The demo showcases atomic batch transactions, allowing users to approve and burn USDC in a single transaction, reducing gas costs and improving transaction reliability. The demo supports transfers between different testnet chains including Ethereum Sepolia, Base Sepolia, Avalanche Fuji, and Linea Sepolia.

## Features

- Create Thirdweb Engine's Smart Circle Wallets on different testnet chains
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
- Docker and Docker Compose installed
- Thirdweb Engine running locally on port 3005 (see [Setup Thirdweb Engine](#setup-thirdweb-engine) section)
- Testnet tokens for gas fees
- Circle Developer Console account ([Sign up here](https://console.circle.com/))
- Native tokens for both source and destination chains (ETH for Sepolia, ETH for Base Sepolia, AVAX for Fuji, ETH for Linea Sepolia)

## Setup Thirdweb Engine

This project requires a local instance of Thirdweb Engine running on port 3005. You can set it up in two ways:

1. **Using Replit Template**:
   - Visit [Replit Template](https://replit.com/@buildoncircle/Self-Host-Thirdweb-Engine-with-Programmable-Wallet)
   - Fork the template
   - **Important**: Download the files to your local machine as this setup requires Docker, which is not supported in Replit's environment

2. **Using GitHub Repository**:
   - Clone the [GitHub Repository](https://github.com/eltontay/thirdweb_engine_circle_pw)
   - Follow the setup instructions in the repository

After setting up Thirdweb Engine locally, ensure it's running on port 3005 before starting this demo application.

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
NEXT_PUBLIC_THIRDWEB_CREDENTIAL_ID=your_credential_id
NEXT_PUBLIC_THIRDWEB_API_URL=http://localhost:3005
NEXT_PUBLIC_CIRCLE_API_KEY=your_circle_api_key
```

You can create your Circle API key in the [Circle Developer Console](https://console.circle.com/).

## Installation

1. Clone the repository:
```bash
git clone https://github.com/eltontay/thirdweb-atomic-batch-transaction-cctp.git
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
2. Get testnet USDC from the [Circle USDC Faucet](https://faucet.circle.com/)
3. Fund the source wallet with testnet USDC
4. Enter the amount to transfer
5. Click "Transfer" to initiate the cross-chain transfer
6. Monitor the transfer progress in the UI

## Architecture

The project uses:
- Next.js 14 with App Router
- Thirdweb Engine (running locally on Docker) for wallet management and transactions
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

## Security

Please read our [Security Policy](SECURITY.md) for details on our code of conduct and the process for submitting pull requests.

## Questions & Support

Have questions? Feel free to:
- Connect with me on X (Twitter): [@txnsheng](https://twitter.com/txnsheng)
- Join the Circle Discord community: [buildoncircle](https://discord.gg/@buildoncircle)
