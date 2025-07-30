import { 
  Connection, 
  Keypair, 
  Transaction, 
  SystemProgram,
  sendAndConfirmTransaction,
  ComputeBudgetProgram
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  getMintLen,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getMint
} from '@solana/spl-token';
import { getConfigManager } from './config-manager';

/**
 * Create MIKO token with 5% fee and unlimited maximum
 */
async function createToken() {
  console.log('=== Create MIKO Token ===\n');
  
  const configManager = getConfigManager();
  const connection = configManager.getConnection();
  const network = configManager.getNetwork();
  const tokenConfig = configManager.getTokenConfig();
  
  console.log(`Network: ${network.toUpperCase()}`);
  console.log(`RPC: ${configManager.getRpcUrl()}\n`);
  
  // Load deployer keypair
  const deployer = configManager.loadKeypair('deployer');
  console.log('Deployer:', deployer.publicKey.toBase58());
  
  // Check deployer balance
  const balance = await connection.getBalance(deployer.publicKey);
  console.log('Deployer Balance:', balance / 1e9, 'SOL');
  
  if (balance < 0.1 * 1e9) {
    throw new Error('Insufficient SOL balance. Need at least 0.1 SOL');
  }
  
  // Token configuration
  console.log('\nToken Configuration:');
  console.log('- Name:', tokenConfig.name);
  console.log('- Symbol:', tokenConfig.symbol);
  console.log('- Decimals:', tokenConfig.decimals);
  console.log('- Total Supply:', tokenConfig.totalSupply.toLocaleString());
  console.log('- Transfer Fee:', tokenConfig.transferFeeBps / 100, '%');
  console.log('- Maximum Fee:', tokenConfig.maximumFee, '(unlimited)');
  console.log('- Freeze Authority: null (disabled)');
  
  // Generate or load mint keypair
  let mintKeypair: Keypair;
  try {
    mintKeypair = configManager.loadKeypair('mint');
    console.log('\nUsing existing mint keypair:', mintKeypair.publicKey.toBase58());
  } catch {
    mintKeypair = Keypair.generate();
    configManager.saveKeypair('mint', mintKeypair);
    console.log('\nGenerated new mint keypair:', mintKeypair.publicKey.toBase58());
  }
  
  // Calculate rent
  const extensions = [ExtensionType.TransferFeeConfig];
  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
  
  console.log('\n1. Creating token mint...');
  
  // Build transaction
  const transaction = new Transaction();
  
  // Add priority fee for mainnet
  if (network === 'mainnet') {
    const priorityFee = configManager.getPriorityFee();
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFee.microLamports,
      })
    );
  }
  
  transaction.add(
    // Create account
    SystemProgram.createAccount({
      fromPubkey: deployer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    // Initialize transfer fee config
    createInitializeTransferFeeConfigInstruction(
      mintKeypair.publicKey,
      deployer.publicKey, // transferFeeConfigAuthority (temporary)
      deployer.publicKey, // withdrawWithheldAuthority (temporary)
      tokenConfig.transferFeeBps,
      BigInt(tokenConfig.maximumFee), // u64::MAX for unlimited
      TOKEN_2022_PROGRAM_ID
    ),
    // Initialize mint
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      tokenConfig.decimals,
      deployer.publicKey,   // mint authority (temporary)
      null,                 // freeze authority (disabled)
      TOKEN_2022_PROGRAM_ID
    )
  );
  
  // Send transaction
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [deployer, mintKeypair],
    { commitment: configManager.getCommitment() }
  );
  
  console.log('✅ Token mint created!');
  console.log('Signature:', signature);
  console.log('Mint Address:', mintKeypair.publicKey.toBase58());
  
  // Verify configuration
  console.log('\n2. Verifying configuration...');
  const mintInfo = await getMint(
    connection, 
    mintKeypair.publicKey, 
    configManager.getCommitment(), 
    TOKEN_2022_PROGRAM_ID
  );
  
  console.log('✅ Mint Authority:', mintInfo.mintAuthority?.toBase58() || 'null');
  console.log('✅ Freeze Authority:', mintInfo.freezeAuthority?.toBase58() || 'null');
  console.log('✅ Decimals:', mintInfo.decimals);
  console.log('✅ Supply:', mintInfo.supply.toString());
  
  // Create deployer's token account
  console.log('\n3. Creating deployer token account...');
  const deployerTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer,
    mintKeypair.publicKey,
    deployer.publicKey,
    false,
    configManager.getCommitment(),
    { commitment: configManager.getCommitment() },
    TOKEN_2022_PROGRAM_ID
  );
  
  console.log('Token Account:', deployerTokenAccount.address.toBase58());
  
  // Mint total supply
  console.log('\n4. Minting total supply...');
  const totalSupply = BigInt(tokenConfig.totalSupply) * BigInt(10 ** tokenConfig.decimals);
  
  const mintSig = await mintTo(
    connection,
    deployer,
    mintKeypair.publicKey,
    deployerTokenAccount.address,
    deployer,
    totalSupply,
    [],
    { commitment: configManager.getCommitment() },
    TOKEN_2022_PROGRAM_ID
  );
  
  console.log('✅ Total supply minted!');
  console.log('Signature:', mintSig);
  console.log('Amount:', tokenConfig.totalSupply.toLocaleString(), tokenConfig.symbol);
  
  // Update deployment state
  configManager.updateDeploymentState({
    token_mint: mintKeypair.publicKey.toBase58(),
    token_creation_signature: signature,
    token_mint_signature: mintSig,
    deployer_token_account: deployerTokenAccount.address.toBase58(),
    token_created_at: new Date().toISOString()
  });
  
  console.log('\n✅ Token creation complete!');
  console.log('\n📋 Summary:');
  console.log('- Token Mint:', mintKeypair.publicKey.toBase58());
  console.log('- Total Supply:', tokenConfig.totalSupply.toLocaleString(), tokenConfig.symbol);
  console.log('- Transfer Fee: 5% (unlimited maximum)');
  console.log('- Deployer Balance:', tokenConfig.totalSupply.toLocaleString(), tokenConfig.symbol);
  
  console.log('\n⚠️  IMPORTANT NEXT STEPS:');
  console.log('1. Deploy and initialize programs');
  console.log('2. Transfer authorities to Vault PDA');
  console.log('3. Create liquidity pool');
  console.log('4. Revoke mint authority (FINAL STEP)');
  
  return {
    mint: mintKeypair.publicKey,
    deployerTokenAccount: deployerTokenAccount.address,
    signature,
    mintSignature: mintSig
  };
}

// Run if called directly
if (require.main === module) {
  createToken()
    .then(() => {
      console.log('\n✅ Success!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Error:', err);
      process.exit(1);
    });
}