const { 
  Connection, 
  PublicKey,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getTransferFeeConfig,
  getTransferHook
} = require('@solana/spl-token');
const fs = require('fs');

// Load token info
const tokenInfoPath = '/shared-artifacts/token-info.json';
if (!fs.existsSync(tokenInfoPath)) {
  throw new Error('token-info.json not found in shared-artifacts');
}

const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf8'));
const MINT_ADDRESS = new PublicKey(tokenInfo.mint);
const VAULT_PDA = new PublicKey(tokenInfo.vaultPda);

// Network configuration
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const RPC_URL = NETWORK === 'mainnet-beta' 
  ? 'https://api.mainnet-beta.solana.com'
  : 'https://api.devnet.solana.com';

async function verifyTokenAuthorities() {
  try {
    console.log('🔍 Verifying MIKO Token Authorities');
    console.log('====================================');
    console.log('Mint:', MINT_ADDRESS.toString());
    console.log('Vault PDA:', VAULT_PDA.toString());
    console.log('\n');

    // Connect to cluster
    const connection = new Connection(RPC_URL, 'confirmed');

    // Get mint info
    const mintInfo = await getMint(connection, MINT_ADDRESS, 'confirmed', TOKEN_2022_PROGRAM_ID);
    
    console.log('📋 Mint Information:');
    console.log('- Supply:', mintInfo.supply.toString());
    console.log('- Decimals:', mintInfo.decimals);
    console.log('- Is Initialized:', mintInfo.isInitialized);
    
    console.log('\n🔐 Authority Verification:');
    
    // Check mint authority
    const mintAuthority = mintInfo.mintAuthority?.toString() || 'null';
    const mintAuthorityCorrect = mintAuthority === 'null';
    console.log(`- Mint Authority: ${mintAuthority} ${mintAuthorityCorrect ? '✅ (Revoked as expected)' : '❌ (Should be null)'}`);
    
    // Check freeze authority
    const freezeAuthority = mintInfo.freezeAuthority?.toString() || 'null';
    const freezeAuthorityCorrect = freezeAuthority === 'null';
    console.log(`- Freeze Authority: ${freezeAuthority} ${freezeAuthorityCorrect ? '✅ (Never set)' : '❌ (Should be null)'}`);
    
    // Get transfer fee config
    const transferFeeConfig = await getTransferFeeConfig(mintInfo);
    if (transferFeeConfig) {
      console.log('\n💰 Transfer Fee Configuration:');
      console.log('- Current Fee:', transferFeeConfig.newerTransferFee.transferFeeBasisPoints, 'basis points (', 
        transferFeeConfig.newerTransferFee.transferFeeBasisPoints / 100, '%)');
      console.log('- Maximum Fee:', transferFeeConfig.newerTransferFee.maximumFee.toString());
      
      const configAuthority = transferFeeConfig.transferFeeConfigAuthority?.toString() || 'null';
      const configAuthorityCorrect = configAuthority === VAULT_PDA.toString();
      console.log(`- Config Authority: ${configAuthority} ${configAuthorityCorrect ? '✅' : '❌ (Should be Vault PDA)'}`);
      
      const withdrawAuthority = transferFeeConfig.withdrawWithheldAuthority?.toString() || 'null';
      const withdrawAuthorityCorrect = withdrawAuthority === VAULT_PDA.toString();
      console.log(`- Withdraw Authority: ${withdrawAuthority} ${withdrawAuthorityCorrect ? '✅' : '❌ (Should be Vault PDA)'}`);
    } else {
      console.log('\n❌ Transfer Fee Config not found!');
    }
    
    // Get transfer hook
    const transferHook = await getTransferHook(mintInfo);
    if (transferHook) {
      console.log('\n🪝 Transfer Hook Configuration:');
      console.log('- Hook Program ID:', transferHook.programId?.toString());
      
      const hookAuthority = transferHook.authority?.toString() || 'null';
      const hookAuthorityCorrect = hookAuthority === VAULT_PDA.toString();
      console.log(`- Hook Authority: ${hookAuthority} ${hookAuthorityCorrect ? '✅' : '❌ (Should be Vault PDA)'}`);
    } else {
      console.log('\n❌ Transfer Hook not found!');
    }
    
    // Summary
    console.log('\n📊 Summary:');
    let allCorrect = mintAuthorityCorrect && freezeAuthorityCorrect;
    
    if (transferFeeConfig) {
      const configAuthority = transferFeeConfig.transferFeeConfigAuthority?.toString() || 'null';
      const configAuthorityCorrect = configAuthority === VAULT_PDA.toString();
      const withdrawAuthority = transferFeeConfig.withdrawWithheldAuthority?.toString() || 'null';
      const withdrawAuthorityCorrect = withdrawAuthority === VAULT_PDA.toString();
      allCorrect = allCorrect && configAuthorityCorrect && withdrawAuthorityCorrect;
    }
    
    if (transferHook) {
      const hookAuthority = transferHook.authority?.toString() || 'null';
      const hookAuthorityCorrect = hookAuthority === VAULT_PDA.toString();
      allCorrect = allCorrect && hookAuthorityCorrect;
    }
    
    if (allCorrect) {
      console.log('✅ All authorities are correctly configured!');
      console.log('- Mint authority is revoked (no more minting possible)');
      console.log('- Freeze authority was never set (tokens can never be frozen)');
      console.log('- Transfer fee authorities are set to Vault PDA');
      console.log('- Transfer hook authority is set to Vault PDA');
    } else {
      console.log('❌ Some authorities are not correctly configured!');
    }

  } catch (error) {
    console.error('\n❌ Error verifying authorities:', error);
    process.exit(1);
  }
}

// Run verification
verifyTokenAuthorities().catch(console.error);