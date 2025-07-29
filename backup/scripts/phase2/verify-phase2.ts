import {
  Connection,
  PublicKey,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getTransferFeeConfig,
  getExtensionTypes,
  ExtensionType,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SHARED_ARTIFACTS_PATH = '/shared-artifacts';

async function runPhase2Verifications() {
  console.log('🔍 Running Phase 2 Verification Contracts');
  console.log('==========================================\n');

  try {
    // Load token info
    const tokenInfoPath = path.join(SHARED_ARTIFACTS_PATH, 'token-info.json');
    const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf-8'));
    const mintPubkey = new PublicKey(tokenInfo.mint);
    const deployerPubkey = new PublicKey(tokenInfo.temporaryAuthority);
    
    // Create connection
    const connection = new Connection(RPC_URL, 'confirmed');
    
    // Get mint data
    const mintData = await getMint(
      connection,
      mintPubkey,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );

    // VC:2.NO_UNSUPPORTED_EXT - Verify only supported extensions
    console.log('Running VC:2.NO_UNSUPPORTED_EXT...');
    const extensionTypes = getExtensionTypes(mintData.tlvData);
    const incompatibleExtensions = [
      ExtensionType.TransferHook,
      ExtensionType.PermanentDelegate,
      ExtensionType.NonTransferable,
      ExtensionType.DefaultAccountState,
      ExtensionType.ConfidentialTransferMint,
    ];
    
    const foundIncompatible = extensionTypes.filter(ext => 
      incompatibleExtensions.includes(ext)
    );
    
    const hasTransferFeeConfig = extensionTypes.includes(ExtensionType.TransferFeeConfig);
    
    const vc2NoUnsupportedExt = {
      vc_id: 'VC:2.NO_UNSUPPORTED_EXT',
      observed: {
        extensions: extensionTypes.map(ext => ExtensionType[ext]),
        incompatibleFound: foundIncompatible.map(ext => ExtensionType[ext]),
        hasTransferFeeConfig,
      },
      expected: {
        noIncompatibleExtensions: true,
        hasTransferFeeConfig: true,
      },
      passed: foundIncompatible.length === 0 && hasTransferFeeConfig,
      checked_at: new Date().toISOString(),
      notes: foundIncompatible.length > 0 
        ? `Found incompatible extensions: ${foundIncompatible.map(ext => ExtensionType[ext]).join(', ')}`
        : 'Only TransferFeeConfig extension present',
    };
    
    fs.writeFileSync(
      path.join(SHARED_ARTIFACTS_PATH, 'verification/vc2-no-unsupported-ext.json'),
      JSON.stringify(vc2NoUnsupportedExt, null, 2)
    );
    console.log(`✅ VC:2.NO_UNSUPPORTED_EXT: ${vc2NoUnsupportedExt.passed ? 'PASSED' : 'FAILED'}`);
    
    // VC:2.FEE_RATE - Verify transfer fee is 30%
    console.log('\nRunning VC:2.FEE_RATE...');
    const transferFeeConfig = getTransferFeeConfig(mintData);
    const currentFeeBasisPoints = transferFeeConfig ? 
      Number(transferFeeConfig.newerTransferFee.transferFeeBasisPoints) : 0;
    
    const vc2FeeRate = {
      vc_id: 'VC:2.FEE_RATE',
      observed: {
        transferFeeBasisPoints: currentFeeBasisPoints,
        transferFeePercentage: currentFeeBasisPoints / 100,
      },
      expected: {
        transferFeeBasisPoints: 3000,
        transferFeePercentage: 30,
      },
      passed: currentFeeBasisPoints === 3000,
      checked_at: new Date().toISOString(),
      notes: currentFeeBasisPoints === 3000 
        ? 'Transfer fee correctly set to 30%'
        : `Transfer fee is ${currentFeeBasisPoints / 100}%, expected 30%`,
    };
    
    fs.writeFileSync(
      path.join(SHARED_ARTIFACTS_PATH, 'verification/vc2-fee-rate.json'),
      JSON.stringify(vc2FeeRate, null, 2)
    );
    console.log(`✅ VC:2.FEE_RATE: ${vc2FeeRate.passed ? 'PASSED' : 'FAILED'}`);
    
    // VC:2.AUTHORITIES - Verify all authorities correctly set
    console.log('\nRunning VC:2.AUTHORITIES...');
    const feeConfigAuthority = transferFeeConfig?.transferFeeConfigAuthority?.toBase58() || null;
    const withdrawAuthority = transferFeeConfig?.withdrawWithheldAuthority?.toBase58() || null;
    const mintAuthority = mintData.mintAuthority?.toBase58() || null;
    const freezeAuthority = mintData.freezeAuthority?.toBase58() || null;
    
    const vc2Authorities = {
      vc_id: 'VC:2.AUTHORITIES',
      observed: {
        mintAuthority,
        freezeAuthority,
        transferFeeConfigAuthority: feeConfigAuthority,
        withdrawWithheldAuthority: withdrawAuthority,
      },
      expected: {
        mintAuthority: deployerPubkey.toBase58(),
        freezeAuthority: null,
        transferFeeConfigAuthority: deployerPubkey.toBase58(),
        withdrawWithheldAuthority: deployerPubkey.toBase58(),
      },
      passed: 
        mintAuthority === deployerPubkey.toBase58() &&
        freezeAuthority === null &&
        feeConfigAuthority === deployerPubkey.toBase58() &&
        withdrawAuthority === deployerPubkey.toBase58(),
      checked_at: new Date().toISOString(),
      notes: 'All authorities should be set to deployer wallet (temporary)',
    };
    
    fs.writeFileSync(
      path.join(SHARED_ARTIFACTS_PATH, 'verification/vc2-authorities.json'),
      JSON.stringify(vc2Authorities, null, 2)
    );
    console.log(`✅ VC:2.AUTHORITIES: ${vc2Authorities.passed ? 'PASSED' : 'FAILED'}`);
    
    // Summary
    console.log('\n📊 Verification Summary:');
    console.log('========================');
    const allPassed = 
      vc2NoUnsupportedExt.passed && 
      vc2FeeRate.passed && 
      vc2Authorities.passed;
    
    console.log(`VC:2.NO_UNSUPPORTED_EXT: ${vc2NoUnsupportedExt.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`VC:2.FEE_RATE: ${vc2FeeRate.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`VC:2.AUTHORITIES: ${vc2Authorities.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('');
    
    if (allPassed) {
      console.log('🎉 All Phase 2 verification contracts PASSED!');
      console.log('✅ Ready to proceed to Phase 3');
    } else {
      console.log('❌ Some verification contracts FAILED');
      console.log('🛑 Cannot proceed to Phase 3 until all verifications pass');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Error during verification:', error);
    process.exit(1);
  }
}

// Run verifications
runPhase2Verifications().catch(console.error);