import { Connection, PublicKey } from '@solana/web3.js';

// Raydium CPMM error codes
const CPMM_ERRORS: { [key: number]: string } = {
  3000: 'InvalidAccountOwner',
  3001: 'InvalidAuthority',
  3002: 'InvalidInput',
  3003: 'MathOverflow',
  3004: 'CreatePoolFeeNotEnough',
  3005: 'InsufficientLiquidity',
  3006: 'InvalidAccountData',
  3007: 'InvalidPoolStatus',
  3008: 'InvalidLockingAccount',
  3009: 'LockedAccount',
  3010: 'InvalidRewardIndex',
  3011: 'InvalidMintDecimals',
  3012: 'InvalidAccountBump',
  3013: 'InvalidProgramId',
  3014: 'InvalidRewardAccount',
  3015: 'InvalidRewardOwner',
  3016: 'InvalidRewardTokenMint',
  3017: 'InvalidPositionNftMint',
  3018: 'InvalidPositionNftNumber',
  3019: 'PositionIsNFT',
  3020: 'InvalidPositionOwner',
  3021: 'InvalidProtocolPosition',
  3022: 'InvalidProtocolAuthority',
  3023: 'NotAllowed',
  3024: 'InvalidAmountSpecified',
  3025: 'InvalidPositionAccount',
  3026: 'SwapTokenPairIdentical',
  3027: 'SwapAmountSpecifiedZero',
  3028: 'InvalidConfigAccount',
  3029: 'InvalidFeeRate',
  3030: 'NotApproved',
  3031: 'InvalidTimestamp',
  3032: 'InvalidRemainingAccountsLen',
  3033: 'InvalidRemainingAccounts',
  3034: 'InvalidTransferFeeConfig',
  3035: 'InvalidTransferHookAccount',
  3036: 'InvalidMintAccount',
  3037: 'InvalidFeeOwner',
};

console.log('Raydium CPMM Error Code 3012:');
console.log(`Error: ${CPMM_ERRORS[3012] || 'Unknown error'}`);
console.log('\nDescription: This error typically occurs when a PDA (Program Derived Address) bump seed is invalid.');
console.log('Common causes:');
console.log('1. The derived addresses are not matching expected values');
console.log('2. The config account or pool account derivation is incorrect');
console.log('3. Token mint ordering is incorrect (Token A should have a lower pubkey value than Token B)');

// Check mint ordering
async function checkMintOrdering() {
  const mikoMint = new PublicKey('516g7A8D1UCuQf1MiFpk9wjzszjTXyC1iuyXR5AEJg7L');
  const solMint = new PublicKey('So11111111111111111111111111111111111111112');
  
  console.log('\nChecking mint ordering:');
  console.log('MIKO mint:', mikoMint.toBase58());
  console.log('SOL mint:', solMint.toBase58());
  
  const mikoBytes = mikoMint.toBytes();
  const solBytes = solMint.toBytes();
  
  let comparison = 0;
  for (let i = 0; i < 32; i++) {
    if (mikoBytes[i] < solBytes[i]) {
      comparison = -1;
      break;
    } else if (mikoBytes[i] > solBytes[i]) {
      comparison = 1;
      break;
    }
  }
  
  if (comparison < 0) {
    console.log('\n✅ MIKO < SOL - Correct ordering (MIKO is Token A, SOL is Token B)');
  } else if (comparison > 0) {
    console.log('\n❌ MIKO > SOL - INCORRECT ordering! Should swap positions');
    console.log('Token A should be SOL, Token B should be MIKO');
  } else {
    console.log('\n??? Mints are equal (this should never happen)');
  }
}

checkMintOrdering().catch(console.error);