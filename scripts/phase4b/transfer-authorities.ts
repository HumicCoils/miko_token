import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  createSetAuthorityInstruction,
  AuthorityType
} from '@solana/spl-token';
import { readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import { ConfigManager } from './config-manager';

async function transferAuthorities() {
  // Use ConfigManager to get auto-derived configuration
  const configManager = new ConfigManager('./minimal-config.json');
  const config = await configManager.getFullConfig();
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  
  // Load deployer keypair
  const deployerKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync('./phase4b-deployer.json', 'utf-8')))
  );
  
  const tokenMint = new PublicKey(config.token.mint_address);
  const vaultProgram = new PublicKey(config.programs.vault_program_id);
  
  // Calculate Vault PDA
  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), tokenMint.toBuffer()],
    vaultProgram
  );
  
  console.log('Transferring authorities to Vault PDA...');
  console.log('Token Mint:', tokenMint.toString());
  console.log('Vault PDA:', vaultPda.toString());
  console.log('Current Authority:', deployerKeypair.publicKey.toString());
  
  try {
    // Transfer Transfer Fee Config Authority
    console.log('\nTransferring Transfer Fee Config Authority...');
    const transferFeeConfigIx = createSetAuthorityInstruction(
      tokenMint,
      deployerKeypair.publicKey,
      AuthorityType.TransferFeeConfig,
      vaultPda,
      [],
      TOKEN_2022_PROGRAM_ID
    );
    
    // Transfer Withdraw Withheld Authority
    console.log('Transferring Withdraw Withheld Authority...');
    const withdrawWithheldIx = createSetAuthorityInstruction(
      tokenMint,
      deployerKeypair.publicKey,
      AuthorityType.WithheldWithdraw,
      vaultPda,
      [],
      TOKEN_2022_PROGRAM_ID
    );
    
    // Create and send transaction
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new Transaction()
      .add(transferFeeConfigIx)
      .add(withdrawWithheldIx);
    
    tx.recentBlockhash = blockhash;
    tx.feePayer = deployerKeypair.publicKey;
    tx.sign(deployerKeypair);
    
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, 'confirmed');
    
    console.log('\nAuthorities transferred successfully!');
    console.log('Transaction:', sig);
    
    // Save transfer info
    const transferInfo = {
      tokenMint: tokenMint.toString(),
      vaultPda: vaultPda.toString(),
      vaultBump,
      transferredAuthorities: [
        'TransferFeeConfig',
        'WithheldWithdraw'
      ],
      previousAuthority: deployerKeypair.publicKey.toString(),
      newAuthority: vaultPda.toString(),
      transactionSignature: sig,
      timestamp: new Date().toISOString()
    };
    
    writeFileSync(
      './authority-transfer-info.json',
      JSON.stringify(transferInfo, null, 2)
    );
    
    console.log('\nAuthority transfer info saved to authority-transfer-info.json');
    
  } catch (error) {
    console.error('Error transferring authorities:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  transferAuthorities()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { transferAuthorities };