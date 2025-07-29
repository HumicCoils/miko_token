import { Connection, PublicKey } from '@solana/web3.js';
import { ConfigManager } from '../config-manager';

async function checkPoolHistory() {
  const configManager = new ConfigManager('../minimal-config.json');
  const config = await configManager.getFullConfig();
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  
  const poolId = new PublicKey(config.pool.pool_id!);
  const poolTokenAccount = new PublicKey('GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL');
  
  console.log('=== Checking Pool Transaction History ===');
  console.log('Pool:', poolId.toBase58());
  console.log('Pool Token Account:', poolTokenAccount.toBase58());
  
  // Get recent signatures for the pool
  const signatures = await connection.getSignaturesForAddress(poolId, { limit: 100 });
  console.log(`\nFound ${signatures.length} recent transactions for pool`);
  
  // Get recent signatures for pool token account  
  const tokenAccountSigs = await connection.getSignaturesForAddress(poolTokenAccount, { limit: 50 });
  console.log(`Found ${tokenAccountSigs.length} recent transactions for pool token account`);
  
  // Check each transaction
  console.log('\n=== Recent Pool Token Account Transactions ===');
  for (let i = 0; i < Math.min(10, tokenAccountSigs.length); i++) {
    const sig = tokenAccountSigs[i];
    try {
      const tx = await connection.getParsedTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });
      
      if (!tx) continue;
      
      console.log(`\nTx ${i + 1}: ${sig.signature}`);
      console.log(`Slot: ${sig.slot}, Time: ${new Date(sig.blockTime! * 1000).toISOString()}`);
      console.log(`Status: ${sig.err ? 'Failed' : 'Success'}`);
      
      // Look for transfer instructions
      for (const inst of tx.transaction.message.instructions) {
        if ('parsed' in inst && inst.parsed) {
          if (inst.parsed.type === 'transfer' || inst.parsed.type === 'transferChecked') {
            const amount = Number(inst.parsed.info.tokenAmount?.amount || inst.parsed.info.amount) / 1e9;
            console.log(`  Transfer: ${amount} MIKO`);
            console.log(`    From: ${inst.parsed.info.source}`);
            console.log(`    To: ${inst.parsed.info.destination}`);
            
            // Check if pool token account is involved
            if (inst.parsed.info.destination === 'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL') {
              console.log(`    *** TO POOL TOKEN ACCOUNT ***`);
              console.log(`    5% fee would be: ${(amount * 0.05).toFixed(2)} MIKO`);
            }
          }
        }
      }
      
      // Check token balance changes
      if (tx.meta?.preTokenBalances && tx.meta?.postTokenBalances) {
        console.log('  Token balance changes:');
        for (let i = 0; i < tx.meta.postTokenBalances.length; i++) {
          const pre = tx.meta.preTokenBalances[i];
          const post = tx.meta.postTokenBalances[i];
          if (pre && post && pre.uiTokenAmount.amount !== post.uiTokenAmount.amount) {
            const change = (Number(post.uiTokenAmount.amount) - Number(pre.uiTokenAmount.amount)) / 1e9;
            console.log(`    Account ${i}: ${change > 0 ? '+' : ''}${change.toFixed(2)} MIKO`);
          }
        }
      }
      
      // Check logs for swap info
      if (tx.meta?.logMessages) {
        const swapLogs = tx.meta.logMessages.filter(log => 
          log.includes('swap') || log.includes('Swap') || log.includes('amount')
        );
        if (swapLogs.length > 0) {
          console.log('  Swap logs:', swapLogs);
        }
      }
    } catch (e) {
      console.log(`  Error parsing tx: ${e}`);
    }
  }
  
  // Get pool account info
  console.log('\n=== Pool Account State ===');
  const poolAccount = await connection.getAccountInfo(poolId);
  if (poolAccount) {
    console.log(`Pool account size: ${poolAccount.data.length} bytes`);
    console.log(`Owner: ${poolAccount.owner.toBase58()}`);
  }
  
  // Check test wallet activity
  console.log('\n=== Checking Test Wallet Activity ===');
  const testWallet1 = new PublicKey('D6C7nUPV1ySv6f4nyjV8svRywkUCwfAUKv2v8eLQ4LFz');
  const wallet1Sigs = await connection.getSignaturesForAddress(testWallet1, { limit: 10 });
  console.log(`Test wallet 1 transactions: ${wallet1Sigs.length}`);
  
  if (wallet1Sigs.length > 0) {
    const firstTx = await connection.getParsedTransaction(wallet1Sigs[0].signature, {
      maxSupportedTransactionVersion: 0
    });
    if (firstTx?.meta?.logMessages) {
      console.log('First tx logs:', firstTx.meta.logMessages.slice(0, 5));
    }
  }
}

checkPoolHistory().catch(console.error);