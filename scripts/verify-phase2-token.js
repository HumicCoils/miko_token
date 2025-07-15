const { 
  Connection, 
  PublicKey,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getTransferFeeConfig,
  getTransferHook,
  getAccount
} = require('@solana/spl-token');
const fs = require('fs');

// Load token info
const tokenInfoPath = '/shared-artifacts/token-info.json';
if (!fs.existsSync(tokenInfoPath)) {
  throw new Error('token-info.json not found in shared-artifacts');
}

const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf8'));
const MINT_ADDRESS = new PublicKey(tokenInfo.mint);
const DEPLOYER = new PublicKey(tokenInfo.temporaryAuthority);
const DEPLOYER_TOKEN_ACCOUNT = new PublicKey(tokenInfo.deployerTokenAccount);

// Network configuration
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const RPC_URL = NETWORK === 'mainnet-beta' 
  ? 'https://api.mainnet-beta.solana.com'
  : 'https://api.devnet.solana.com';

async function verifyPhase2() {
  try {
    console.log('🔍 Verifying Phase 2: MIKO Token Creation');
    console.log('==========================================');
    console.log('Mint:', MINT_ADDRESS.toString());
    console.log('Deployer:', DEPLOYER.toString());
    console.log('\n');

    // Connect to cluster
    const connection = new Connection(RPC_URL, 'confirmed');

    // Get mint info
    const mintInfo = await getMint(connection, MINT_ADDRESS, 'confirmed', TOKEN_2022_PROGRAM_ID);
    
    console.log('📋 Token Information:');
    console.log('- Supply:', mintInfo.supply.toString(), 'raw units');
    console.log('- Supply:', Number(mintInfo.supply) / (10 ** 9), 'MIKO');
    console.log('- Decimals:', mintInfo.decimals);
    console.log('- Is Initialized:', mintInfo.isInitialized);
    
    console.log('\n🔐 Authority Verification:');
    
    // Check mint authority (should still be deployer)
    const mintAuthority = mintInfo.mintAuthority?.toString() || 'null';
    const mintAuthorityCorrect = mintAuthority === DEPLOYER.toString();
    console.log(`- Mint Authority: ${mintAuthority}`);
    console.log(`  ${mintAuthorityCorrect ? '✅ Still with deployer (correct for Phase 2)' : '❌ Should be deployer'}`);
    
    // Check freeze authority (should be null)
    const freezeAuthority = mintInfo.freezeAuthority?.toString() || 'null';
    const freezeAuthorityCorrect = freezeAuthority === 'null';
    console.log(`- Freeze Authority: ${freezeAuthority}`);
    console.log(`  ${freezeAuthorityCorrect ? '✅ Permanently null' : '❌ Should be null'}`);
    
    // Get transfer fee config
    const transferFeeConfig = await getTransferFeeConfig(mintInfo);
    if (transferFeeConfig) {
      console.log('\n💰 Transfer Fee Configuration:');
      const fee = transferFeeConfig.newerTransferFee.transferFeeBasisPoints;
      console.log('- Current Fee:', fee, 'basis points (', fee / 100, '%)');
      console.log('- Maximum Fee:', transferFeeConfig.newerTransferFee.maximumFee.toString());
      
      const configAuthority = transferFeeConfig.transferFeeConfigAuthority?.toString() || 'null';
      const configAuthorityCorrect = configAuthority === DEPLOYER.toString();
      console.log(`- Config Authority: ${configAuthority}`);
      console.log(`  ${configAuthorityCorrect ? '✅ Still with deployer (correct for Phase 2)' : '❌ Should be deployer'}`);
      
      const withdrawAuthority = transferFeeConfig.withdrawWithheldAuthority?.toString() || 'null';
      const withdrawAuthorityCorrect = withdrawAuthority === DEPLOYER.toString();
      console.log(`- Withdraw Authority: ${withdrawAuthority}`);
      console.log(`  ${withdrawAuthorityCorrect ? '✅ Still with deployer (correct for Phase 2)' : '❌ Should be deployer'}`);
    } else {
      console.log('\n❌ Transfer Fee Config not found!');
    }
    
    // Get transfer hook
    const transferHook = await getTransferHook(mintInfo);
    if (transferHook) {
      console.log('\n🪝 Transfer Hook Configuration:');
      console.log('- Hook Program ID:', transferHook.programId?.toString());
      
      const hookAuthority = transferHook.authority?.toString() || 'null';
      const hookAuthorityCorrect = hookAuthority === DEPLOYER.toString();
      console.log(`- Hook Authority: ${hookAuthority}`);
      console.log(`  ${hookAuthorityCorrect ? '✅ Still with deployer (correct for Phase 2)' : '❌ Should be deployer'}`);
    } else {
      console.log('\n❌ Transfer Hook not found!');
    }
    
    // Check token balance
    console.log('\n💼 Token Distribution:');
    const deployerAccount = await getAccount(
      connection,
      DEPLOYER_TOKEN_ACCOUNT,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    const deployerBalance = Number(deployerAccount.amount) / (10 ** 9);
    console.log('- Deployer Balance:', deployerBalance, 'MIKO');
    const balanceCorrect = deployerBalance === 1_000_000_000;
    console.log(`  ${balanceCorrect ? '✅ All tokens in deployer wallet' : '❌ Should have all 1B tokens'}`);
    
    // Phase 2 Checklist
    console.log('\n📊 Phase 2 Checklist:');
    const checklist = {
      'Total supply minted (1B MIKO)': mintInfo.supply.toString() === '1000000000000000000',
      'Mint authority still with deployer': mintAuthority === DEPLOYER.toString(),
      'Freeze authority null': freezeAuthority === 'null',
      '30% initial fee active': transferFeeConfig && transferFeeConfig.newerTransferFee.transferFeeBasisPoints === 3000,
      'All tokens in deployer wallet': deployerBalance === 1_000_000_000,
      'Transfer fee authorities with deployer': transferFeeConfig && 
        transferFeeConfig.transferFeeConfigAuthority?.toString() === DEPLOYER.toString() &&
        transferFeeConfig.withdrawWithheldAuthority?.toString() === DEPLOYER.toString(),
      'Transfer hook authority with deployer': transferHook && 
        transferHook.authority?.toString() === DEPLOYER.toString()
    };
    
    let allPassed = true;
    for (const [check, passed] of Object.entries(checklist)) {
      console.log(`- ${check}: ${passed ? '✅' : '❌'}`);
      if (!passed) allPassed = false;
    }
    
    console.log('\n📈 Summary:');
    if (allPassed) {
      console.log('✅ Phase 2 completed successfully!');
      console.log('✅ Token created with 1B supply');
      console.log('✅ All authorities temporarily with deployer');
      console.log('✅ Ready for Phase 3: Vault initialization and authority transfers');
    } else {
      console.log('❌ Phase 2 has issues that need to be resolved!');
    }

  } catch (error) {
    console.error('\n❌ Error verifying Phase 2:', error);
    process.exit(1);
  }
}

// Run verification
verifyPhase2().catch(console.error);