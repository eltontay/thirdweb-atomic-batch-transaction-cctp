export interface ChainConfig {
  usdc: string;
  tokenMessenger: string;
  messageTransmitter: string;
  domain: number;
  chainId: number;
  explorerUrl: string;
}

export interface CCTPConfig {
  [key: string]: ChainConfig;
}

export interface WalletResponse {
  result: {
    walletAddress: string;
    status: string;
    type: string;
  };
}

export interface BalanceResult {
  decimals: string;
  displayValue: string;
  name: string;
  symbol: string;
  value: string;
}

export interface BalanceResponse {
  result: BalanceResult;
}

export interface TransactionResponse {
  transactionHash: string;
}

export interface AttestationResponse {
  message: string;
  attestation: string;
}

export type CCTPTransferStatus = 
  | 'idle'
  | 'approving'
  | 'burning'
  | 'waitingForAttestation'
  | 'receiving'
  | 'completed'
  | 'failed';

export interface CCTPTransferState {
  status: CCTPTransferStatus;
  error?: string;
  sourceTransactionHash?: string;
  destinationTransactionHash?: string;
  attestation?: {
    message: string;
    attestation: string;
  };
  approvalHash?: string;
  burnHash?: string;
  receiveHash?: string;
}

export type TransactionStatus = 'queued' | 'submitted' | 'sent' | 'mined' | 'failed';

export interface TransactionStatusResponse {
  result: {
    queueId: string;
    walletAddress: string;
    contractAddress: string;
    chainId: string;
    status: TransactionStatus;
    txHash?: string;
    transactionHash?: string;
    extension: string;
    encodedInputData: string;
    txType: number;
    gasPrice: string;
    gasLimit: string;
    maxPriorityFeePerGas: string;
    maxFeePerGas: string;
  };
}

export interface TransferResponse {
  result: {
    queueId: string;
  };
}

export const CCTP_CONFIG: CCTPConfig = {
  'ethereum-sepolia': {
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    tokenMessenger: '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa',
    messageTransmitter: '0xe737e5cebeeba77efe34d4aa090756590b1ce275',
    domain: 0,
    chainId: 11155111,
    explorerUrl: 'https://sepolia.etherscan.io'
  },
  'base-sepolia': {
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    tokenMessenger: '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa',
    messageTransmitter: '0xe737e5cebeeba77efe34d4aa090756590b1ce275',
    domain: 6,
    chainId: 84532,
    explorerUrl: 'https://sepolia.basescan.org'
  },
  'avalanche-fuji': {
    usdc: '0x5425890298aed601595a70AB815c96711a31Bc65',
    tokenMessenger: '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa',
    messageTransmitter: '0xe737e5cebeeba77efe34d4aa090756590b1ce275',
    domain: 1,
    chainId: 43113,
    explorerUrl: 'https://testnet.snowtrace.io'
  },
  'linea-sepolia': {
    usdc: '0xfece4462d57bd51a6a552365a011b95f0e16d9b7',
    tokenMessenger: '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa',
    messageTransmitter: '0xe737e5cebeeba77efe34d4aa090756590b1ce275',
    domain: 11,
    chainId: 59141,
    explorerUrl: 'https://sepolia.lineascan.build'
  },
}; 