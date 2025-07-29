import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import BN from 'bn.js';

// Configuration
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SHARED_ARTIFACTS_PATH = '/shared-artifacts';

// CRITICAL: Always use the existing deployer keypair
// Address: AnCL6TWEGYo3zVhrXckfFiAqdQpo158JUCWPFQJEpS95
const DEPLOYER_KEYPAIR_PATH = '/shared-artifacts/deployer-keypair.json';

// Constants
const HARVEST_THRESHOLD = new BN('500000000000000'); // 500,000 MIKO (with 9 decimals)
const MIN_HOLD_AMOUNT = new BN('100000000000'); // Placeholder: 100 MIKO (will be updated based on price)

async function initializeVault() {
  console.log('🔧 Initializing MIKO Vault Program');
  console.log('====================================');
  console.log('');

  try {
    // Load deployer keypair
    console.log('Loading deployer keypair...');
    const deployerKeypairData = JSON.parse(fs.readFileSync(DEPLOYER_KEYPAIR_PATH, 'utf-8'));
    const deployerKeypair = Keypair.fromSecretKey(new Uint8Array(deployerKeypairData));
    console.log('Deployer address:', deployerKeypair.publicKey.toBase58());

    // Load PDAs
    const pdaPath = path.join(SHARED_ARTIFACTS_PATH, 'pdas.json');
    const pdas = JSON.parse(fs.readFileSync(pdaPath, 'utf-8'));
    const vaultPDA = new PublicKey(pdas.vault.address);
    console.log('Vault PDA:', vaultPDA.toBase58());

    // Load program IDs
    const programsPath = path.join(SHARED_ARTIFACTS_PATH, 'programs.json');
    const programs = JSON.parse(fs.readFileSync(programsPath, 'utf-8'));
    const vaultProgram = new PublicKey(programs.absoluteVault.programId);
    console.log('Vault Program:', vaultProgram.toBase58());

    // Load token info
    const tokenInfoPath = path.join(SHARED_ARTIFACTS_PATH, 'token-info.json');
    const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf-8'));
    const mintPubkey = new PublicKey(tokenInfo.mint);
    console.log('Token Mint:', mintPubkey.toBase58());

    // Create connection
    const connection = new Connection(RPC_URL, 'confirmed');

    // Check if vault is already initialized
    console.log('');
    console.log('Checking if vault is already initialized...');
    const vaultAccountInfo = await connection.getAccountInfo(vaultPDA);
    if (vaultAccountInfo) {
      console.log('❌ Vault is already initialized!');
      process.exit(1);
    }
    console.log('✅ Vault PDA does not exist yet, ready to initialize');

    // Initialize parameters
    // For initial development, using deployer address for all roles
    // These should be updated with proper addresses in production
    const initParams = {
      authority: deployerKeypair.publicKey,        // Admin authority
      treasury: deployerKeypair.publicKey,         // Treasury wallet (for 20% share)
      ownerWallet: deployerKeypair.publicKey,     // Owner wallet (receives 1% of tax)
      keeperAuthority: deployerKeypair.publicKey, // Keeper bot authority
      minHoldAmount: MIN_HOLD_AMOUNT,             // Min $100 USD equivalent
    };

    console.log('');
    console.log('Initialization Parameters:');
    console.log('=========================');
    console.log('Authority:', initParams.authority.toBase58());
    console.log('Treasury:', initParams.treasury.toBase58());
    console.log('Owner Wallet:', initParams.ownerWallet.toBase58());
    console.log('Keeper Authority:', initParams.keeperAuthority.toBase58());
    console.log('Min Hold Amount:', initParams.minHoldAmount.toString());
    console.log('');

    // Create initialize instruction
    console.log('Creating initialize instruction...');
    
    // Instruction discriminator for 'initialize' from IDL
    const discriminator = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);
    
    // Serialize arguments
    const data = Buffer.concat([
      discriminator,
      initParams.authority.toBuffer(),
      initParams.treasury.toBuffer(),
      initParams.ownerWallet.toBuffer(),
      initParams.keeperAuthority.toBuffer(),
      initParams.minHoldAmount.toArrayLike(Buffer, 'le', 8),
    ]);

    const initializeIx = new TransactionInstruction({
      programId: vaultProgram,
      keys: [
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: deployerKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    // Create and send transaction
    console.log('');
    console.log('Sending initialize transaction...');
    const transaction = new Transaction().add(initializeIx);
    
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = deployerKeypair.publicKey;
    transaction.sign(deployerKeypair);

    const signature = await connection.sendRawTransaction(transaction.serialize());
    console.log('Transaction sent:', signature);

    // Wait for confirmation
    console.log('Waiting for confirmation...');
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      console.error('❌ Transaction failed:', confirmation.value.err);
      process.exit(1);
    }

    console.log('✅ Vault initialized successfully!');

    // Fetch and verify vault state
    console.log('');
    console.log('Fetching vault state...');
    const vaultAccount = await connection.getAccountInfo(vaultPDA);
    
    if (!vaultAccount) {
      console.error('❌ Failed to fetch vault account after initialization');
      process.exit(1);
    }

    console.log('✅ Vault account created');
    console.log('Account owner:', vaultAccount.owner.toBase58());
    console.log('Account size:', vaultAccount.data.length, 'bytes');

    // Save initialization info
    const initInfo = {
      vaultPDA: vaultPDA.toBase58(),
      initializedAt: new Date().toISOString(),
      transactionSignature: signature,
      initParams: {
        authority: initParams.authority.toBase58(),
        treasury: initParams.treasury.toBase58(),
        ownerWallet: initParams.ownerWallet.toBase58(),
        keeperAuthority: initParams.keeperAuthority.toBase58(),
        minHoldAmount: initParams.minHoldAmount.toString(),
      },
      tokenMint: mintPubkey.toBase58(),
      vaultProgram: vaultProgram.toBase58(),
    };

    const initInfoPath = path.join(SHARED_ARTIFACTS_PATH, 'vault-init-info.json');
    fs.writeFileSync(initInfoPath, JSON.stringify(initInfo, null, 2));
    console.log('');
    console.log('✅ Initialization info saved to shared-artifacts/vault-init-info.json');

    console.log('');
    console.log('🎉 Vault initialization complete!');
    console.log('');
    console.log('Note: The vault program should have automatically added the following');
    console.log('accounts to both fee_exclusions and reward_exclusions lists:');
    console.log('1. Owner wallet:', initParams.ownerWallet.toBase58());
    console.log('2. Treasury:', initParams.treasury.toBase58());
    console.log('3. Keeper wallet:', initParams.keeperAuthority.toBase58());
    console.log('4. Vault program:', vaultProgram.toBase58());
    console.log('5. Vault PDA:', vaultPDA.toBase58());
    console.log('');
    console.log('Next step: Run verification to confirm auto-exclusions');

  } catch (error) {
    console.error('');
    console.error('❌ Error initializing vault:', error);
    process.exit(1);
  }
}

// Run initialization
initializeVault().catch(console.error);