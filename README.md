# USDC Atomic Batch Sample App (CCTP + Thirdweb Engine + Circle Wallets)

> **Important**: This project requires local setup and cannot be run directly in Replit or other online environments. You must fork this repository, download it to your local machine, and run it there.

This project demonstrates atomic batch cross-chain USDC transfers using CCTP (Cross-Chain Transfer Protocol) with Thirdweb Engine's Smart Circle Wallets. The demo showcases:
1. Atomic batch transactions for USDC approval and burnings in a single transaction
2. Atomic batch minting on destination chain, allowing multiple recipients to receive tokens in a single transaction
3. Reduced gas costs and improved transaction reliability through batching

## Features

- Create and manage Circle Wallets through Thirdweb Engine
- Atomic batch transactions for both burning and minting:
  - Single transaction for USDC approval and multiple burns
  - Single transaction for multiple mints on destination chain
- Real-time balance tracking and transaction status monitoring
- Supported testnet chains:
  - Ethereum Sepolia
  - Base Sepolia
  - Avalanche Fuji
  - Linea Sepolia

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- Docker and Docker Compose installed
- Thirdweb Engine running locally on port 3005 (see [Setup Thirdweb Engine](#setup-thirdweb-engine) section)
- Circle Developer Console account ([Sign up here](https://console.circle.com/))
- Native tokens for gas fees on source chain
- Testnet USDC from [Circle USDC Faucet](https://faucet.circle.com/)

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

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_THIRDWEB_CREDENTIAL_ID=your_thirdweb_credential_id
NEXT_PUBLIC_THIRDWEB_ENGINE_ACCESS_TOKEN=your_thirdweb_access_token
NEXT_PUBLIC_CIRCLE_API_KEY=your_circle_api_key
```

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

## Usage Guide

1. **Initial Setup**:
   - Create a source wallet on your chosen source chain
   - Get testnet USDC from the [Circle USDC Faucet](https://faucet.circle.com/)
   - Fund the source wallet with testnet USDC and native tokens for gas

2. **Adding Recipients**:
   - Add multiple recipients using the "Add Recipient" button
   - All recipients must be on the same destination chain
   - Enter the amount for each recipient

3. **Executing Transfer**:
   - Click "Send Batch Transfer" to initiate the transfer
   - The app will:
     1. Create an atomic batch transaction for approval and burns
     2. Wait for attestations from Circle
     3. Create atomic batch mint transaction for all recipients
     4. Show real-time status updates

## Transaction Flow

1. **Atomic Batch Burn**:
   - Single transaction that combines:
     - USDC approval
     - Multiple burn operations for different recipients
   - All burns succeed or fail together

2. **Attestation Handling**:
   - Waits for attestations from Circle
   - Matches each attestation to its corresponding recipient

3. **Atomic Batch Mint**:
   - Single transaction containing all mint operations
   - All recipients receive their tokens in one transaction
   - All mints succeed or fail together

## Architecture

The project uses:
- Next.js 14 with App Router
- Thirdweb Engine (running locally on Docker) for wallet management and transactions
- Circle CCTP Protocol for cross-chain transfers
- Circle Wallets for secure key management
- Ethers.js for blockchain interactions
- Tailwind CSS for UI

## Project Structure

```
src/
├── app/                    # Next.js app directory
│   ├── api/               # API routes for wallet and attestation handling
│   └── page.tsx           # Main application component
├── services/              # Business logic
│   └── cctpService.ts     # CCTP and wallet operations
└── types/                 # TypeScript type definitions
    └── cctp.ts           # CCTP and wallet types
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Security

Please read our [Security Policy](SECURITY.md) for details on our code of conduct and the process for submitting pull requests.

## Questions & Support

Have questions? Feel free to:
- Connect with me on X (Twitter): [@txnsheng](https://twitter.com/txnsheng)
- Join the Circle Discord community: [buildoncircle](https://discord.gg/@buildoncircle)
