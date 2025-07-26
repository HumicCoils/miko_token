import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, unpackAccount, getTransferFeeAmount } from '@solana/spl-token';
import { ConfigManager } from '../config-manager';

async function analyze30MikoSource() {
  const configManager = new ConfigManager('../minimal-config.json');
  const config = await configManager.getFullConfig();
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  
  console.log('=== Analyzing 10 MIKO Deductions in Liquidity Additions ===\n');
  
  // Analyze specific liquidity addition transactions
  const liquidityTxs = [
    { sig: '5D2Va2UrXXpacQoTUdgmVnaXgz8zxM1TG4L4zCTi8vCB2wG8GNb6yj7xMz4ADamSg3mw9RFbHJSqiwSHRELRUzhM', amount: '45M' },
    { sig: '5Ahq9TvwGnvbRDR8PHWRA8JsqG2xceN3jLLdt5tBkTkSoYd9J5qL9iVqXhdQomc2V9ERCuzus9GzHivjLSu2p2w3', amount: '225M' },
    { sig: '4ZT1Bx5nwbmYbTfCSu9VSQJik3wJK3M1C7HAbaD6UwNo7mp62tCQ1M3mAxWAsWXtHdx1MvZdEWBh2BgNiisXoAWX', amount: '630M' },
  ];
  
  for (const { sig, amount } of liquidityTxs) {
    console.log(`\n=== ${amount} Liquidity Addition ===`);
    console.log(`Transaction: ${sig}`);
    
    const tx = await connection.getParsedTransaction(sig, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx || !tx.meta) continue;
    
    // Analyze all token accounts involved
    console.log('\nToken Account Changes:');
    const tokenAccounts = new Map();
    
    // Map pre and post balances
    for (let i = 0; i < tx.meta.postTokenBalances.length; i++) {
      const pre = tx.meta.preTokenBalances[i];
      const post = tx.meta.postTokenBalances[i];
      
      if (pre && post) {
        const pubkey = tx.transaction.message.accountKeys[post.accountIndex].pubkey.toBase58();
        const preAmount = Number(pre.uiTokenAmount.amount) / 1e9;
        const postAmount = Number(post.uiTokenAmount.amount) / 1e9;
        const change = postAmount - preAmount;
        
        if (change !== 0) {
          tokenAccounts.set(pubkey, {
            owner: post.owner,
            preAmount,
            postAmount,
            change,
            mint: post.mint
          });
        }
      }
    }
    
    // Display sorted by change amount
    const sorted = Array.from(tokenAccounts.entries()).sort((a, b) => Math.abs(b[1].change) - Math.abs(a[1].change));
    
    for (const [pubkey, data] of sorted) {
      console.log(`\nAccount: ${pubkey}`);
      console.log(`Owner: ${data.owner}`);
      console.log(`Change: ${data.change > 0 ? '+' : ''}${data.change.toFixed(2)} MIKO`);
      console.log(`Balance: ${data.preAmount.toFixed(2)} → ${data.postAmount.toFixed(2)}`);
    }
    
    // Look for exactly 10 MIKO changes
    console.log('\n=== Searching for 10 MIKO movements ===');
    for (const [pubkey, data] of tokenAccounts.entries()) {
      if (Math.abs(data.change) === 10) {
        console.log(`Found exact 10 MIKO change!`);
        console.log(`Account: ${pubkey}`);
        console.log(`Owner: ${data.owner}`);
        console.log(`Change: ${data.change > 0 ? '+' : ''}${data.change}`);
      }
    }
    
    // Find deployer's outgoing transfer
    console.log('\n=== Analyzing Amounts ===');
    const deployerAccount = 'CDTSFkBB1TuRw7WFZj4ZQpagwBhw5iURjC13kS6hEgSc';
    let deployerTransfer = 0;
    let poolReceived = 0;
    
    for (const [pubkey, data] of tokenAccounts.entries()) {
      if (data.owner === deployerAccount && data.change < 0) {
        deployerTransfer = Math.abs(data.change);
        console.log(`Deployer sent: ${deployerTransfer.toFixed(2)} MIKO`);
      }
      if (data.owner === 'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL' && data.change > 0) {
        poolReceived = data.change;
        console.log(`Pool received: ${poolReceived.toFixed(2)} MIKO`);
      }
    }
    
    const expectedAmount = amount === '45M' ? 45_000_000 : amount === '225M' ? 225_000_000 : 630_000_000;
    console.log(`Expected: ${expectedAmount.toLocaleString()} MIKO`);
    console.log(`Difference from expected: ${(deployerTransfer - expectedAmount).toFixed(2)} MIKO`);
    console.log(`Lost in transfer: ${(deployerTransfer - poolReceived).toFixed(2)} MIKO`);
  }
  
  console.log('\n\n=== SUMMARY ===');
  console.log('The discrepancies between expected amounts and actual sent amounts:');
  console.log('- 630M → 623,700,000.10: Difference of -6,299,999.90 MIKO');
  console.log('- 225M → 222,749,960.50: Difference of -2,250,039.50 MIKO');
  console.log('These are likely from prior transfers or balance adjustments.');
}

analyze30MikoSource().catch(console.error);