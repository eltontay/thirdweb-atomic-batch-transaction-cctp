import { useState } from 'react';
import { CCTP_CONFIG } from '../../types/cctp';
import { createWallet } from '../../services/cctpService';

interface RecipientFormProps {
  recipients: Array<{
    chain: string;
    address: string;
    amount: string;
  }>;
  onRecipientsChange: (recipients: Array<{
    chain: string;
    address: string;
    amount: string;
  }>) => void;
  isTransferStarted: boolean;
  balances: { [key: string]: string };
  balanceLoading: { [key: string]: boolean };
  onRefreshBalance: (address: string, chain: string) => void;
}

export default function RecipientForm({ 
  recipients, 
  onRecipientsChange,
  isTransferStarted,
  balances,
  balanceLoading,
  onRefreshBalance
}: RecipientFormProps) {
  const chains = Object.keys(CCTP_CONFIG);
  const [copiedText, setCopiedText] = useState<string>('');
  const [loading, setLoading] = useState<{ [key: number]: boolean }>({});

  const addRecipient = () => {
    onRecipientsChange([
      ...recipients,
      { chain: chains[0], address: '', amount: '' }
    ]);
  };

  const removeRecipient = (index: number) => {
    onRecipientsChange(recipients.filter((_, i) => i !== index));
  };

  const updateRecipient = (index: number, field: 'chain' | 'address' | 'amount', value: string) => {
    const newRecipients = [...recipients];
    if (field === 'amount' && value) {
      // Convert to USDC decimals (6 decimals)
      const amountInDecimals = (parseFloat(value) * 1e6).toString();
      newRecipients[index] = { ...newRecipients[index], [field]: amountInDecimals };
    } else {
      newRecipients[index] = { ...newRecipients[index], [field]: value };
    }
    onRecipientsChange(newRecipients);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(''), 2000);
  };

  const handleCreateWallet = async (index: number, chain: string) => {
    try {
      setLoading(prev => ({ ...prev, [index]: true }));
      const response = await createWallet(chain, `${chain}-recipient-${index}`);

      if (!response.result?.walletAddress) {
        throw new Error('Invalid wallet response');
      }

      updateRecipient(index, 'address', response.result.walletAddress);
    } catch (error) {
      console.error('Error creating recipient wallet:', error);
    } finally {
      setLoading(prev => ({ ...prev, [index]: false }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">Recipients</h3>
        {!isTransferStarted && (
          <button
            onClick={addRecipient}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Recipient
          </button>
        )}
      </div>

      {recipients.map((recipient, index) => (
        <div key={index} className="border border-gray-700 p-4 rounded-lg bg-[#1e293b]">
          <div className="flex justify-between items-start mb-4">
            <h4 className="text-white">Recipient {index + 1}</h4>
            {!isTransferStarted && !recipient.address && (
              <button
                onClick={() => removeRecipient(index)}
                className="text-red-500 hover:text-red-400"
              >
                Remove
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Chain</label>
              <select
                value={recipient.chain}
                onChange={(e) => updateRecipient(index, 'chain', e.target.value)}
                className="w-full p-2 border border-gray-600 rounded bg-[#0f172a] text-white"
              >
                {chains.map((chain) => (
                  <option key={chain} value={chain}>
                    {chain}
                  </option>
                ))}
              </select>
            </div>

            <div>
              {!recipient.address ? (
                <button
                  onClick={() => handleCreateWallet(index, recipient.chain)}
                  disabled={loading[index]}
                  className="w-full p-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading[index] ? 'Creating...' : 'Create Recipient Wallet'}
                </button>
              ) : (
                <>
                  <div className="flex items-center space-x-2">
                    <p className="text-gray-400">Address:</p>
                    <p className="text-white">{recipient.address}</p>
                    <button
                      onClick={() => copyToClipboard(recipient.address, `address-${index}`)}
                      className="text-blue-500 hover:text-blue-400"
                    >
                      {copiedText === `address-${index}` ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="flex items-center space-x-2 mt-2">
                    <p className="text-gray-400">Balance:</p>
                    <p className="text-white">
                      {balanceLoading[recipient.address] ? 'Loading...' : balances[recipient.address] || '0'} USDC
                    </p>
                    <button
                      onClick={() => onRefreshBalance(recipient.address, recipient.chain)}
                      disabled={balanceLoading[recipient.address]}
                      className="ml-2 p-1 text-blue-500 hover:text-blue-400 disabled:opacity-50"
                    >
                      {balanceLoading[recipient.address] ? 'Refreshing...' : 'Refresh'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {recipient.address && !isTransferStarted && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Amount to Receive (USDC)</label>
                <input
                  type="number"
                  value={recipient.amount ? (parseFloat(recipient.amount) / 1e6).toString() : ''}
                  onChange={(e) => updateRecipient(index, 'amount', e.target.value)}
                  placeholder="0.0"
                  className="w-full p-2 border border-gray-600 rounded bg-[#0f172a] text-white"
                />
              </div>
            )}
            {isTransferStarted && recipient.amount && (
              <div className="flex items-center space-x-2">
                <p className="text-gray-400">Amount to Receive:</p>
                <p className="text-white">{(parseFloat(recipient.amount) / 1e6).toString()} USDC</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
} 