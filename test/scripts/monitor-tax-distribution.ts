import { 
  Connection, 
  PublicKey,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import * as fs from 'fs';

async function monitorTaxDistribution() {
  console.log('[TEST MODE] Monitoring tax collection and distribution...');
  
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load token info
  const tokenInfo = JSON.parse(fs.readFileSync('./test-token-info.json', 'utf-8'));
  const mintPubkey = new PublicKey(tokenInfo.mint);
  
  // Load program IDs from env
  const ABSOLUTE_VAULT_PROGRAM = new PublicKey(process.env.ABSOLUTE_VAULT_PROGRAM || 'AVau1tVPk2k8uNzxQJbCqZUWhFbmcDQ4ejZvvYPfxJZG');
  
  // Get PDAs
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('tax_config')],
    ABSOLUTE_VAULT_PROGRAM
  );
  
  const [holderRegistryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('holder_registry'), Buffer.from([0])],
    ABSOLUTE_VAULT_PROGRAM
  );
  
  console.log('\nProgram PDAs:');
  console.log('Config:', configPda.toBase58());
  console.log('Holder Registry:', holderRegistryPda.toBase58());
  
  // Monitor function
  const monitor = async () => {
    console.log('\n' + '='.repeat(60));
    console.log(new Date().toLocaleString());
    console.log('='.repeat(60));
    
    try {
      // Get config
      const configData = await connection.getAccountInfo(configPda);
      if (configData) {
        console.log('\n[Tax Config]');
        console.log('Account exists, size:', configData.data.length);
      }
      
      // Get holder registry
      const registryData = await connection.getAccountInfo(holderRegistryPda);
      if (registryData) {
        console.log('\n[Holder Registry]');
        console.log('Account exists, size:', registryData.data.length);
      }
      
      // Check treasury balance
      const treasuryWallet = new PublicKey(process.env.TREASURY_WALLET || '11111111111111111111111111111111');
      const treasuryAta = await getAssociatedTokenAddress(
        mintPubkey,
        treasuryWallet,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      try {
        const treasuryBalance = await connection.getTokenAccountBalance(treasuryAta);
        console.log('\n[Treasury Balance]');
        console.log(`${treasuryBalance.value.uiAmount} MIKO`);
        console.log('(4% of all taxes collected)');
      } catch (e) {
        console.log('\n[Treasury Balance]');
        console.log('No treasury ATA found yet');
      }
      
      // Check owner balance
      const ownerWallet = new PublicKey(process.env.OWNER_WALLET || '11111111111111111111111111111111');
      const ownerAta = await getAssociatedTokenAddress(
        mintPubkey,
        ownerWallet,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      try {
        const ownerBalance = await connection.getTokenAccountBalance(ownerAta);
        console.log('\n[Owner Balance]');
        console.log(`${ownerBalance.value.uiAmount} MIKO`);
        console.log('(1% of all taxes collected)');
      } catch (e) {
        console.log('\n[Owner Balance]');
        console.log('No owner ATA found yet');
      }
      
      // Check test holder balances
      const testHolders = ['test-holder-1', 'test-holder-2', 'test-holder-3'];
      console.log('\n[Test Holder Balances]');
      
      for (const holderName of testHolders) {
        const walletFile = `./${holderName}.json`;
        if (fs.existsSync(walletFile)) {
          const holderData = JSON.parse(fs.readFileSync(walletFile, 'utf-8'));
          const holderPubkey = PublicKey.decode(Buffer.from(holderData.slice(32, 64)));
          
          const holderAta = await getAssociatedTokenAddress(
            mintPubkey,
            holderPubkey,
            false,
            TOKEN_2022_PROGRAM_ID
          );
          
          try {
            const balance = await connection.getTokenAccountBalance(holderAta);
            const isEligible = balance.value.uiAmount >= 100000;
            console.log(`${holderName}: ${balance.value.uiAmount} MIKO ${isEligible ? '✓ (eligible)' : '✗ (below threshold)'}`);
          } catch (e) {
            console.log(`${holderName}: No ATA found`);
          }
        }
      }
      
      // Check for recent transactions
      console.log('\n[Recent Program Activity]');
      const signatures = await connection.getSignaturesForAddress(
        ABSOLUTE_VAULT_PROGRAM,
        { limit: 5 }
      );
      
      if (signatures.length > 0) {
        console.log(`Found ${signatures.length} recent transactions:`);
        for (const sig of signatures) {
          const date = new Date(sig.blockTime! * 1000).toLocaleString();
          console.log(`- ${sig.signature.slice(0, 20)}... (${date})`);
        }
      } else {
        console.log('No recent transactions found');
      }
      
    } catch (error) {
      console.error('Monitor error:', error);
    }
  };
  
  // Run once immediately
  await monitor();
  
  // Then run every 30 seconds
  console.log('\n[TEST MODE] Monitoring every 30 seconds...');
  console.log('[TEST MODE] Press Ctrl+C to stop');
  
  setInterval(monitor, 30000);
}

monitorTaxDistribution().catch(console.error);