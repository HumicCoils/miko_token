import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getTransferFeeAmount, unpackAccount } from '@solana/spl-token';
import { ConfigManager } from '../config-manager';

async function checkAccumulatedFees() {
  const configManager = new ConfigManager('../minimal-config.json');
  const config = await configManager.getFullConfig();
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  
  const mintPubkey = new PublicKey(config.token.mint_address);
  const vaultPda = new PublicKey(config.pdas.vault_pda);
  
  console.log('=== Checking Accumulated Fees ===');
  console.log('Token Mint:', mintPubkey.toBase58());
  console.log('Vault PDA:', vaultPda.toBase58());
  console.log('');

  // Get the token mint account to access transfer fee config
  const mintInfo = await connection.getAccountInfo(mintPubkey);
  if (!mintInfo) {
    console.error('Mint account not found');
    return;
  }

  // Get all token accounts for this mint
  const tokenAccounts = await connection.getProgramAccounts(
    TOKEN_2022_PROGRAM_ID,
    {
      commitment: 'finalized',
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: mintPubkey.toBase58(),
          },
        },
      ],
    }
  );

  console.log(`Found ${tokenAccounts.length} token accounts`);
  
  let totalFees = 0;
  let accountsWithFees = 0;
  const feeDetails: any[] = [];

  for (const { pubkey, account } of tokenAccounts) {
    try {
      const tokenAccount = unpackAccount(pubkey, account, TOKEN_2022_PROGRAM_ID);
      
      // Check if account has withheld fees
      const transferFeeAmount = getTransferFeeAmount(tokenAccount);
      if (transferFeeAmount && transferFeeAmount.withheldAmount > BigInt(0)) {
        accountsWithFees++;
        const fees = Number(transferFeeAmount.withheldAmount);
        totalFees += fees;
        
        // Get owner info
        const owner = tokenAccount.owner;
        const balance = Number(tokenAccount.amount);
        
        feeDetails.push({
          account: pubkey.toBase58(),
          owner: owner.toBase58(),
          balance: balance / 1e9,
          withheldFees: fees / 1e9,
        });
      }
    } catch (error) {
      // Skip accounts that can't be parsed
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total accumulated fees: ${totalFees / 1e9} MIKO`);
  console.log(`Accounts with fees: ${accountsWithFees}`);
  console.log(`Harvest threshold: 500,000 MIKO`);
  console.log(`Ready to harvest: ${totalFees / 1e9 >= 500000 ? 'YES' : 'NO'}`);
  
  if (feeDetails.length > 0) {
    console.log('\n=== Top accounts with fees ===');
    feeDetails
      .sort((a, b) => b.withheldFees - a.withheldFees)
      .slice(0, 10)
      .forEach((detail, i) => {
        console.log(`${i + 1}. ${detail.owner}`);
        console.log(`   Balance: ${detail.balance.toFixed(2)} MIKO`);
        console.log(`   Withheld: ${detail.withheldFees.toFixed(2)} MIKO`);
      });
  }
  
  // Check swap test wallets specifically
  console.log('\n=== Checking swap test wallets ===');
  const testWallets = [
    'D6C7nUPV1ySv6f4nyjV8svRywkUCwfAUKv2v8eLQ4LFz',
    'C8f1hyCe8dM33mXuMnheEfGnm7c77WNPB38PGUaeZpLU',
    'BPNeyztYxYygzvYXZ19LmF21aRtvpDdVNVDVgJZ66zVA',
  ];
  
  for (const wallet of testWallets) {
    const walletPubkey = new PublicKey(wallet);
    const atas = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { mint: mintPubkey }
    );
    
    if (atas.value.length > 0) {
      const balance = atas.value[0].account.data.parsed.info.tokenAmount.uiAmount;
      console.log(`${wallet}: ${balance?.toFixed(2) || 0} MIKO`);
    }
  }
  
  // Check current fee rate
  console.log('\n=== Current Fee Configuration ===');
  const mintData = mintInfo.data;
  // Find TransferFeeConfig extension
  let offset = 165; // Base mint data size
  while (offset < mintData.length - 4) {
    const extensionType = mintData.readUInt16LE(offset);
    const extensionLen = mintData.readUInt16LE(offset + 2);
    
    if (extensionType === 1) { // TransferFeeConfig
      const configOffset = offset + 4;
      const currentEpoch = mintData.readBigUInt64LE(configOffset);
      const currentFee = mintData.readUInt16LE(configOffset + 10);
      console.log(`Current epoch: ${currentEpoch}`);
      console.log(`Current fee: ${currentFee} basis points (${currentFee / 100}%)`);
      break;
    }
    offset += 4 + extensionLen;
  }
}

checkAccumulatedFees().catch(console.error);