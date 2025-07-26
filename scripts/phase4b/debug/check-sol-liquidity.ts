import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ConfigManager } from '../config-manager';

async function checkSolLiquidity() {
  const configManager = new ConfigManager('../minimal-config.json');
  const config = await configManager.getFullConfig();
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  
  console.log('=== Analyzing SOL/WSOL in Liquidity Additions ===\n');
  
  const transactions = [
    { sig: '5D2Va2UrXXpacQoTUdgmVnaXgz8zxM1TG4L4zCTi8vCB2wG8GNb6yj7xMz4ADamSg3mw9RFbHJSqiwSHRELRUzhM', expected: '0.5 SOL + 45M MIKO' },
    { sig: '5Ahq9TvwGnvbRDR8PHWRA8JsqG2xceN3jLLdt5tBkTkSoYd9J5qL9iVqXhdQomc2V9ERCuzus9GzHivjLSu2p2w3', expected: '2.5 SOL + 225M MIKO' },
    { sig: '4ZT1Bx5nwbmYbTfCSu9VSQJik3wJK3M1C7HAbaD6UwNo7mp62tCQ1M3mAxWAsWXtHdx1MvZdEWBh2BgNiisXoAWX', expected: '7 SOL + 630M MIKO' },
  ];
  
  for (const { sig, expected } of transactions) {
    console.log(`\n=== Transaction: ${expected} ===`);
    console.log(`Signature: ${sig}`);
    
    const tx = await connection.getParsedTransaction(sig, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx || !tx.meta) continue;
    
    // Check SOL balance changes
    console.log('\nSOL Balance Changes:');
    const accountKeys = tx.transaction.message.accountKeys;
    
    for (let i = 0; i < accountKeys.length; i++) {
      const preBalance = tx.meta.preBalances[i];
      const postBalance = tx.meta.postBalances[i];
      const change = postBalance - preBalance;
      
      if (change !== 0) {
        const account = accountKeys[i].pubkey.toBase58();
        console.log(`\nAccount: ${account}`);
        console.log(`Change: ${change / LAMPORTS_PER_SOL} SOL`);
        console.log(`Balance: ${preBalance / LAMPORTS_PER_SOL} → ${postBalance / LAMPORTS_PER_SOL} SOL`);
        
        // Check if this is deployer
        if (account === 'CDTSFkBB1TuRw7WFZj4ZQpagwBhw5iURjC13kS6hEgSc') {
          console.log('*** DEPLOYER ACCOUNT ***');
        }
        
        // Check if this is pool account
        if (account === 'Ato64e2AkmeoUTv93nCbcKJtmZkypZ9xesBpwbCyvUp7') {
          console.log('*** POOL ACCOUNT ***');
        }
      }
    }
    
    // Check token balances for WSOL
    console.log('\nToken Balance Changes (including WSOL):');
    if (tx.meta.postTokenBalances && tx.meta.preTokenBalances) {
      for (let i = 0; i < tx.meta.postTokenBalances.length; i++) {
        const pre = tx.meta.preTokenBalances[i];
        const post = tx.meta.postTokenBalances[i];
        
        if (pre && post) {
          const preAmount = Number(pre.uiTokenAmount.amount);
          const postAmount = Number(post.uiTokenAmount.amount);
          const change = postAmount - preAmount;
          
          if (change !== 0) {
            console.log(`\nToken Account ${i}:`);
            console.log(`Mint: ${post.mint}`);
            console.log(`Owner: ${post.owner}`);
            
            // Check if this is WSOL
            if (post.mint === 'So11111111111111111111111111111111111111112') {
              console.log('*** WSOL ***');
              console.log(`Change: ${change / LAMPORTS_PER_SOL} WSOL`);
            } else {
              console.log(`Change: ${change / 1e9} tokens`);
            }
          }
        }
      }
    }
    
    // Check logs for pool information
    console.log('\nPool-related logs:');
    tx.meta.logMessages?.forEach(log => {
      if (log.includes('vault') || log.includes('liquidity') || log.includes('amount')) {
        console.log(log);
      }
    });
  }
}

checkSolLiquidity().catch(console.error);