const { 
  Connection, 
  Keypair, 
  PublicKey,
  SystemProgram,
} = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet, BN } = require('@coral-xyz/anchor');
const fs = require('fs');
const dotenv = require('dotenv');

// Load test environment
dotenv.config({ path: '../.env.test' });

async function updateHolders() {
  console.log('Updating holder registry...');
  
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
  
  // Load keeper wallet
  const keeperKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('../keeper-bot-wallet.json', 'utf-8')))
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
  
  const absoluteVault = new Program(
    absoluteVaultIdl,
    ABSOLUTE_VAULT_PROGRAM,
    provider
  );
  
  try {
    // Get tax config
    const [taxConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("tax_config")],
      ABSOLUTE_VAULT_PROGRAM
    );
    
    // Get holder registry PDA
    const [holderRegistry] = PublicKey.findProgramAddressSync(
      [Buffer.from("holder_registry")],
      ABSOLUTE_VAULT_PROGRAM
    );
    
    // Initialize the registry if needed
    try {
      await absoluteVault.account.holderRegistry.fetch(holderRegistry);
      console.log('Holder registry already exists');
    } catch {
      console.log('Creating holder registry...');
      const initTx = await absoluteVault.methods
        .initializeRegistry()
        .accounts({
          keeperBot: keeperKeypair.publicKey,
          taxConfig,
          holderRegistry,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log('Registry initialized:', initTx);
    }
    
    // Load test holders
    const holders = [];
    for (let i = 1; i <= 3; i++) {
      const walletFile = `../test-holder-${i}.json`;
      if (fs.existsSync(walletFile)) {
        const keypair = Keypair.fromSecretKey(
          Uint8Array.from(JSON.parse(fs.readFileSync(walletFile, 'utf-8')))
        );
        holders.push(keypair.publicKey);
        console.log(`Holder ${i}: ${keypair.publicKey.toBase58()}`);
      }
    }
    
    // Only add holders 1 and 2 (they have > 100k MIKO)
    const eligibleHolders = [holders[0], holders[1]]; // Holder 3 has < 100k
    
    // Update the holder registry
    console.log('\nUpdating holder registry with eligible holders...');
    // For now, pass empty balances array - in production, we'd fetch actual balances
    const balances = eligibleHolders.map(() => new BN(0));
    
    const updateTx = await absoluteVault.methods
      .updateHolderRegistry(eligibleHolders, balances)
      .accounts({
        keeperBot: keeperKeypair.publicKey,
        taxConfig,
        holderRegistry,
      })
      .rpc();
    
    console.log('Holders updated:', updateTx);
    
    // Fetch and verify
    const registryData = await absoluteVault.account.holderRegistry.fetch(holderRegistry);
    console.log('\nCurrent holder registry:');
    console.log('Total holders:', registryData.holders.length);
    registryData.holders.forEach((holder, i) => {
      console.log(`  ${i + 1}. ${holder.toBase58()}`);
    });
    
  } catch (error) {
    console.error('Update failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
  }
}

updateHolders().catch(console.error);