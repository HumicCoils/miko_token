const { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const {
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID
} = require('@solana/spl-token');
const fs = require('fs');

// Load token info
const tokenInfoPath = '/shared-artifacts/token-info.json';
if (!fs.existsSync(tokenInfoPath)) {
  throw new Error('token-info.json not found in shared-artifacts');
}

const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf8'));
const MINT_ADDRESS = new PublicKey(tokenInfo.mint);
const DEPLOYER_TOKEN_ACCOUNT = new PublicKey(tokenInfo.deployerTokenAccount);

// Network configuration
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const RPC_URL = NETWORK === 'mainnet-beta' 
  ? 'https://api.mainnet-beta.solana.com'
  : 'https://api.devnet.solana.com';

async function testTransferFee() {
  try {
    console.log('🧪 Testing 30% Transfer Fee');
    console.log('============================');
    console.log('Mint:', MINT_ADDRESS.toString());
    console.log('\n');

    // Connect to cluster
    const connection = new Connection(RPC_URL, 'confirmed');

    // Load deployer keypair
    const deployerKeypath = process.env.PAYER_KEYPAIR || '/root/.config/solana/id.json';
    const deployer = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync(deployerKeypath, 'utf8')))
    );
    
    // Generate a test recipient
    const recipient = Keypair.generate();
    console.log('Test recipient:', recipient.publicKey.toString());
    
    // Create associated token account for recipient
    const recipientTokenAccount = getAssociatedTokenAddressSync(
      MINT_ADDRESS,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    const createATAIx = createAssociatedTokenAccountInstruction(
      deployer.publicKey,
      recipientTokenAccount,
      recipient.publicKey,
      MINT_ADDRESS,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    // Transfer 1000 MIKO (with 9 decimals)
    const transferAmount = BigInt(1000 * 10 ** 9);
    console.log('\n📤 Transfer Details:');
    console.log('- Amount to transfer:', 1000, 'MIKO');
    console.log('- Expected fee (30%):', 300, 'MIKO');
    console.log('- Expected received:', 700, 'MIKO');
    
    // Get initial balance
    const initialBalance = await getAccount(
      connection,
      DEPLOYER_TOKEN_ACCOUNT,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    console.log('\n💰 Initial Balances:');
    console.log('- Deployer:', Number(initialBalance.amount) / (10 ** 9), 'MIKO');
    
    // Create transfer instruction
    const transferIx = createTransferCheckedInstruction(
      DEPLOYER_TOKEN_ACCOUNT,
      MINT_ADDRESS,
      recipientTokenAccount,
      deployer.publicKey,
      transferAmount,
      9, // decimals
      [],
      TOKEN_2022_PROGRAM_ID
    );
    
    // Send transaction
    console.log('\n🚀 Sending transfer transaction...');
    const transaction = new Transaction().add(createATAIx, transferIx);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [deployer],
      { commitment: 'confirmed' }
    );
    console.log('Transaction signature:', signature);
    
    // Check final balances
    const finalDeployerBalance = await getAccount(
      connection,
      DEPLOYER_TOKEN_ACCOUNT,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    const recipientBalance = await getAccount(
      connection,
      recipientTokenAccount,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log('\n💰 Final Balances:');
    console.log('- Deployer:', Number(finalDeployerBalance.amount) / (10 ** 9), 'MIKO');
    console.log('- Recipient:', Number(recipientBalance.amount) / (10 ** 9), 'MIKO');
    
    // Calculate actual fee
    const deployerDiff = Number(initialBalance.amount) - Number(finalDeployerBalance.amount);
    const actualFee = deployerDiff - Number(recipientBalance.amount);
    const feePercentage = (actualFee / deployerDiff) * 100;
    
    console.log('\n📊 Transfer Analysis:');
    console.log('- Total deducted from sender:', deployerDiff / (10 ** 9), 'MIKO');
    console.log('- Amount received by recipient:', Number(recipientBalance.amount) / (10 ** 9), 'MIKO');
    console.log('- Fee collected:', actualFee / (10 ** 9), 'MIKO');
    console.log('- Fee percentage:', feePercentage.toFixed(2) + '%');
    
    // Verify 30% fee
    if (Math.abs(feePercentage - 30) < 0.01) {
      console.log('\n✅ Transfer fee is working correctly at 30%!');
    } else {
      console.log('\n❌ Transfer fee is not 30% as expected!');
    }
    
    // Check where fees are held
    console.log('\n🔍 Fee Collection Status:');
    console.log('- Fees are withheld in token accounts');
    console.log('- Can be harvested by Vault PDA (after Phase 3)');
    console.log('- Currently inaccessible (deployer cannot harvest)');

  } catch (error) {
    console.error('\n❌ Error testing transfer fee:', error);
    if (error.logs) {
      console.error('\nTransaction logs:');
      error.logs.forEach(log => console.error(log));
    }
    process.exit(1);
  }
}

// Run test
testTransferFee().catch(console.error);