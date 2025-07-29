import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction, PublicKey } from '@solana/web3.js';
import { 
  createMint, 
  getMint, 
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
} from '@solana/spl-token';
import * as fs from 'fs';

async function createPhase4BToken() {
  // Load minimal config
  const minimalConfig = JSON.parse(fs.readFileSync('minimal-config.json', 'utf-8'));
  const connection = new Connection(minimalConfig.rpc_url, 'confirmed');
  
  // Load deployer
  const deployerData = JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  console.log('Creating MIKO token for Phase 4-B...');
  console.log('Deployer:', deployer.publicKey.toBase58());
  console.log('Vault Program:', minimalConfig.vault_program_id);
  console.log('Smart Dial Program:', minimalConfig.smart_dial_program_id);
  
  // Create MIKO mint
  const mintKeypair = Keypair.generate();
  const mintLen = getMintLen([ExtensionType.TransferFeeConfig]);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
  
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: deployer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      mintKeypair.publicKey,
      deployer.publicKey,
      deployer.publicKey,
      3000, // 30% initial fee
      BigInt(10_000_000_000), // max fee
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      9,
      deployer.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );
  
  await sendAndConfirmTransaction(connection, transaction, [deployer, mintKeypair]);
  console.log('MIKO token created:', mintKeypair.publicKey.toBase58());
  
  // Mint total supply
  const deployerAta = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer,
    mintKeypair.publicKey,
    deployer.publicKey,
    false,
    'confirmed',
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  
  await mintTo(
    connection,
    deployer,
    mintKeypair.publicKey,
    deployerAta.address,
    deployer,
    1_000_000_000 * 10 ** 9,
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  
  console.log('Total supply minted: 1,000,000,000 MIKO');
  console.log('Deployer ATA:', deployerAta.address.toBase58());
  
  // Update minimal config with the generated token mint
  minimalConfig.token_mint = mintKeypair.publicKey.toBase58();
  
  fs.writeFileSync('minimal-config.json', JSON.stringify(minimalConfig, null, 2));
  console.log('\nToken mint saved to minimal-config.json');
  
  // Also save deployment info for reference
  const deploymentInfo = {
    deployer: deployer.publicKey.toBase58(),
    mikoToken: mintKeypair.publicKey.toBase58(),
    deployerAta: deployerAta.address.toBase58(),
    createdAt: new Date().toISOString(),
  };
  
  fs.writeFileSync('phase4b-deployment-info.json', JSON.stringify(deploymentInfo, null, 2));
  console.log('Deployment info saved to phase4b-deployment-info.json');
  
  // Also save keypairs for later use
  fs.writeFileSync('phase4b-mint-keypair.json', JSON.stringify(Array.from(mintKeypair.secretKey)));
  console.log('Mint keypair saved to phase4b-mint-keypair.json');
}

createPhase4BToken().catch(console.error);