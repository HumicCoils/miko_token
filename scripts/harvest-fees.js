const { 
  Connection, 
  Keypair, 
  PublicKey,
  SystemProgram,
} = require('@solana/web3.js');
const { 
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  getMint,
} = require('@solana/spl-token');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const fs = require('fs');
const dotenv = require('dotenv');

// Load test environment
dotenv.config({ path: '../.env.test' });

async function harvestFees() {
  console.log('Harvesting accumulated transfer fees...');
  
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
  
  // Load wallets
  const keeperKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../keeper-bot-wallet.json', 'utf-8')))
  );
  
  const treasuryKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../treasury-wallet.json', 'utf-8')))
  );
  
  const ownerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../owner-wallet.json', 'utf-8')))
  );
  
  console.log('Keeper wallet:', keeperKeypair.publicKey.toBase58());
  
  // Setup provider
  const provider = new AnchorProvider(
    connection,
    new Wallet(keeperKeypair),
    { commitment: 'confirmed' }
  );
  
  // Import IDL
  const absoluteVaultIdl = JSON.parse(
    fs.readFileSync('../target/idl/absolute_vault.json', 'utf-8')
  );
  
  const ABSOLUTE_VAULT_PROGRAM = new PublicKey(process.env.ABSOLUTE_VAULT_PROGRAM);
  const MIKO_TOKEN_MINT = new PublicKey(process.env.MIKO_TOKEN_MINT);
  
  const absoluteVault = new Program(
    absoluteVaultIdl,
    ABSOLUTE_VAULT_PROGRAM,
    provider
  );
  
  try {
    // Get mint info to check withheld amounts
    const mintInfo = await getMint(connection, MIKO_TOKEN_MINT, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('\nChecking for withheld fees...');
    
    // Get all token accounts that might have withheld fees
    const sourceAccounts = [];
    
    // Add test holder accounts
    for (let i = 1; i <= 3; i++) {
      const walletFile = `../test-holder-${i}.json`;
      if (fs.existsSync(walletFile)) {
        const keypair = Keypair.fromSecretKey(
          Uint8Array.from(JSON.parse(fs.readFileSync(walletFile, 'utf-8')))
        );
        const ata = await getAssociatedTokenAddress(
          MIKO_TOKEN_MINT,
          keypair.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID
        );
        sourceAccounts.push(ata);
      }
    }
    
    // Add treasury account
    const treasuryAta = await getAssociatedTokenAddress(
      MIKO_TOKEN_MINT,
      treasuryKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    sourceAccounts.push(treasuryAta);
    
    console.log(`Found ${sourceAccounts.length} accounts to check for withheld fees`);
    
    // Get PDAs
    const [taxConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("tax_config")],
      ABSOLUTE_VAULT_PROGRAM
    );
    
    const [vaultAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), MIKO_TOKEN_MINT.toBytes()],
      ABSOLUTE_VAULT_PROGRAM
    );
    
    const [withdrawAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("withdraw_authority")],
      ABSOLUTE_VAULT_PROGRAM
    );
    
    // Get owner and treasury token accounts
    const ownerAta = await getAssociatedTokenAddress(
      MIKO_TOKEN_MINT,
      ownerKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    // Check balances before
    console.log('\nBalances before harvest:');
    try {
      const vaultInfo = await getAccount(connection, vaultAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
      console.log('Vault balance:', Number(vaultInfo.amount) / Math.pow(10, 9), 'MIKO');
    } catch {
      console.log('Vault account not yet created');
    }
    
    let ownerBalance = 0;
    try {
      const ownerInfo = await getAccount(connection, ownerAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
      ownerBalance = Number(ownerInfo.amount);
      console.log('Owner balance:', ownerBalance / Math.pow(10, 9), 'MIKO');
    } catch {
      console.log('Owner account does not exist yet');
    }
    
    const treasuryInfo = await getAccount(connection, treasuryAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const treasuryBalance = Number(treasuryInfo.amount);
    console.log('Treasury balance:', treasuryBalance / Math.pow(10, 9), 'MIKO');
    
    // Harvest and collect fees
    console.log('\nHarvesting fees from token accounts...');
    
    const harvestTx = await absoluteVault.methods
      .harvestAndCollectFees(sourceAccounts)
      .accounts({
        authority: keeperKeypair.publicKey,
        taxConfig,
        mikoTokenMint: MIKO_TOKEN_MINT,
        vaultAccount,
        ownerWallet: ownerAta,
        treasuryWallet: treasuryAta,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    
    console.log('Harvest transaction:', harvestTx);
    
    // Check balances after
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\nBalances after harvest:');
    const vaultInfoAfter = await getAccount(connection, vaultAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('Vault balance:', Number(vaultInfoAfter.amount) / Math.pow(10, 9), 'MIKO');
    
    const ownerInfoAfter = await getAccount(connection, ownerAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('Owner balance:', Number(ownerInfoAfter.amount) / Math.pow(10, 9), 'MIKO');
    
    const treasuryInfoAfter = await getAccount(connection, treasuryAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    console.log('Treasury balance:', Number(treasuryInfoAfter.amount) / Math.pow(10, 9), 'MIKO');
    
    // Calculate distributions
    const ownerReceived = (Number(ownerInfoAfter.amount) - ownerBalance) / Math.pow(10, 9);
    const treasuryReceived = (Number(treasuryInfoAfter.amount) - treasuryBalance) / Math.pow(10, 9);
    
    console.log('\nFee distribution:');
    console.log('Owner received:', ownerReceived, 'MIKO (1% of fees)');
    console.log('Treasury received:', treasuryReceived, 'MIKO (4% of fees)');
    console.log('Total fees collected:', ownerReceived + treasuryReceived, 'MIKO');
    
  } catch (error) {
    console.error('Harvest failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      if (error.logs) {
        console.error('Logs:', error.logs);
      }
    }
  }
}

harvestFees().catch(console.error);