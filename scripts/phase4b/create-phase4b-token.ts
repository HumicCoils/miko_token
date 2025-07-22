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

const FORK_URL = 'http://127.0.0.1:8899';

async function createPhase4BToken() {
  const connection = new Connection(FORK_URL, 'confirmed');
  
  // Load deployer
  const deployerData = JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  console.log('Creating MIKO token for Phase 4-B...');
  console.log('Deployer:', deployer.publicKey.toBase58());
  
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
  
  // Load program keypairs to get addresses
  const vaultKeypairData = JSON.parse(fs.readFileSync('phase4b-programs/vault-phase4b.json', 'utf-8'));
  const vaultAddress = Keypair.fromSecretKey(new Uint8Array(vaultKeypairData)).publicKey.toBase58();
  
  const smartDialKeypairData = JSON.parse(fs.readFileSync('phase4b-programs/smartdial-phase4b.json', 'utf-8'));
  const smartDialAddress = Keypair.fromSecretKey(new Uint8Array(smartDialKeypairData)).publicKey.toBase58();
  
  // Save Phase 4-B config
  const config = {
    programs: {
      vault: vaultAddress,
      smartDial: smartDialAddress,
    },
    deployer: deployer.publicKey.toBase58(),
    mikoToken: mintKeypair.publicKey.toBase58(),
    deployerAta: deployerAta.address.toBase58(),
    createdAt: new Date().toISOString(),
  };
  
  fs.writeFileSync('phase4b-config.json', JSON.stringify(config, null, 2));
  console.log('\nConfiguration saved to phase4b-config.json');
  
  // Also save keypairs for later use
  fs.writeFileSync('phase4b-mint-keypair.json', JSON.stringify(Array.from(mintKeypair.secretKey)));
  console.log('Mint keypair saved to phase4b-mint-keypair.json');
}

createPhase4BToken().catch(console.error);