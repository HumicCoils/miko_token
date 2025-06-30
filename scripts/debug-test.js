const { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const { 
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedWithFeeInstruction,
  getAssociatedTokenAddress,
} = require('@solana/spl-token');

console.log('Testing basic function call...');

try {
  // Test with dummy values
  const source = new PublicKey('11111111111111111111111111111111');
  const mint = new PublicKey('11111111111111111111111111111111');
  const dest = new PublicKey('11111111111111111111111111111111');
  const owner = new PublicKey('11111111111111111111111111111111');
  
  console.log('Creating instruction with amount as number...');
  const ix1 = createTransferCheckedWithFeeInstruction(
    source,
    mint,
    dest,
    owner,
    1000000, // number
    9,
    500,
    [],
    TOKEN_2022_PROGRAM_ID
  );
  console.log('Success with number!');
  
  // Try with Buffer
  console.log('Creating instruction with amount as Buffer...');
  const amount = Buffer.alloc(8);
  amount.writeBigUInt64LE(BigInt(1000000));
  
  const ix2 = createTransferCheckedWithFeeInstruction(
    source,
    mint,
    dest,
    owner,
    amount,
    9,
    500,
    [],
    TOKEN_2022_PROGRAM_ID
  );
  console.log('Success with Buffer!');
  
} catch (e) {
  console.error('Error:', e.message);
  console.error(e.stack);
}

console.log('\nChecking spl-token version...');
const pkg = require('@solana/spl-token/package.json');
console.log('Version:', pkg.version);