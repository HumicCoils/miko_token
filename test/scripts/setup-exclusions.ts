import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as fs from 'fs';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { AbsoluteVault } from '../../target/types/absolute_vault';
import absoluteVaultIdl from '../../target/idl/absolute_vault.json';

async function setupExclusions() {
  console.log('[TEST MODE] Setting up exclusion lists...');
  
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load keeper wallet
  const keeperKeypair = Keypair.fromSecretKey(
    Buffer.from(process.env.KEEPER_BOT_PRIVATE_KEY!, 'base64')
  );
  
  // Setup provider
  const provider = new AnchorProvider(
    connection,
    new Wallet(keeperKeypair),
    { commitment: 'confirmed' }
  );
  
  // Load program
  const ABSOLUTE_VAULT_PROGRAM = new PublicKey(process.env.ABSOLUTE_VAULT_PROGRAM!);
  const program = new Program<AbsoluteVault>(
    absoluteVaultIdl as any,
    ABSOLUTE_VAULT_PROGRAM,
    provider
  );
  
  console.log('Keeper wallet:', keeperKeypair.publicKey.toBase58());
  console.log('Program ID:', ABSOLUTE_VAULT_PROGRAM.toBase58());
  
  // Wallets to exclude from tax and rewards
  const exclusions = [
    // System wallets
    new PublicKey(process.env.TREASURY_WALLET!),
    new PublicKey(process.env.OWNER_WALLET!),
    keeperKeypair.publicKey,
    
    // Add any DEX pool addresses here
    // new PublicKey('RAYDIUM_POOL_ADDRESS'),
    // new PublicKey('METEORA_POOL_ADDRESS'),
  ];
  
  console.log('\nWallets to exclude:');
  exclusions.forEach(wallet => {
    console.log('- ' + wallet.toBase58());
  });
  
  try {
    // Update exclusions
    const tx = await program.methods
      .updateExclusions(exclusions, exclusions)
      .accounts({
        keeperBot: keeperKeypair.publicKey,
      })
      .rpc();
    
    console.log('\n[TEST MODE] Exclusions updated successfully!');
    console.log('Transaction:', tx);
    
    // Verify exclusions
    const [exclusionsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('exclusions')],
      ABSOLUTE_VAULT_PROGRAM
    );
    
    const exclusionList = await program.account.exclusionList.fetch(exclusionsPda);
    console.log('\nVerified exclusions:');
    console.log('Tax exclusions:', exclusionList.taxExclusions.length);
    console.log('Reward exclusions:', exclusionList.rewardExclusions.length);
    
  } catch (error) {
    console.error('Failed to update exclusions:', error);
  }
}

setupExclusions().catch(console.error);