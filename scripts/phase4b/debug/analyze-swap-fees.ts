import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getTransferFeeAmount, unpackAccount } from '@solana/spl-token';
import { ConfigManager } from '../config-manager';

async function analyzeSwapFees() {
  const configManager = new ConfigManager('../minimal-config.json');
  const config = await configManager.getFullConfig();
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  
  console.log('=== Analyzing Successful Swap Fees ===\n');
  
  // Successful swap transactions from the log
  const swapTxs = [
    '4VVisDeVPC6xAfz1...', // Wallet 17: SOL_TO_MIKO
    '5SRnUzaZTK2Hzqag...', // Wallet 7: SOL_TO_MIKO  
    '4ZQyEBaVFYfmWFY2...', // Wallet 17: MIKO_TO_SOL
    '3azz1SzMygXkbPSV...'  // Wallet 17: MIKO_TO_SOL
  ];
  
  // Search for full transaction signatures
  const recentSigs = await connection.getSignaturesForAddress(
    new PublicKey(config.pool.pool_id!),
    { limit: 200 }
  );
  
  console.log(`Found ${recentSigs.length} recent pool transactions`);
  
  // Find matching transactions
  for (const shortSig of swapTxs) {
    const prefix = shortSig.replace('...', '');
    const fullSig = recentSigs.find(s => s.signature.startsWith(prefix));
    
    if (fullSig) {
      console.log(`\n=== Analyzing ${prefix}... ===`);
      console.log(`Full signature: ${fullSig.signature}`);
      
      const tx = await connection.getParsedTransaction(fullSig.signature, {
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx || !tx.meta) continue;
      
      // Analyze all instructions
      let totalMikoTransferred = 0;
      let totalFeeCharged = 0;
      
      console.log('\nAll Instructions:');
      tx.transaction.message.instructions.forEach((inst, idx) => {
        if ('parsed' in inst && inst.parsed) {
          console.log(`${idx}. ${inst.parsed.type} (${inst.programId.toBase58().substring(0, 8)}...)`);
          if (inst.parsed.type === 'transferChecked' || inst.parsed.type === 'transfer') {
            console.log(`   Info:`, JSON.stringify(inst.parsed.info, null, 2));
          }
        } else {
          console.log(`${idx}. Unknown instruction (${inst.programId.toBase58().substring(0, 8)}...)`);
        }
      });
      
      // Check balance changes
      if (tx.meta.postTokenBalances && tx.meta.preTokenBalances) {
        console.log('\nBalance Changes:');
        for (let i = 0; i < tx.meta.postTokenBalances.length; i++) {
          const pre = tx.meta.preTokenBalances[i];
          const post = tx.meta.postTokenBalances[i];
          
          if (pre && post && pre.mint === post.mint && pre.mint === config.token.mint_address) {
            const preAmount = Number(pre.uiTokenAmount.amount);
            const postAmount = Number(post.uiTokenAmount.amount);
            const change = postAmount - preAmount;
            
            if (change !== 0) {
              const account = tx.transaction.message.accountKeys[post.accountIndex].pubkey.toBase58();
              console.log(`\n${account}:`);
              console.log(`  Change: ${(change / 1e9).toFixed(4)} MIKO`);
              console.log(`  Balance: ${(preAmount / 1e9).toFixed(2)} → ${(postAmount / 1e9).toFixed(2)}`);
              
              // Check if this is the pool vault
              if (account === 'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL') {
                console.log('  *** POOL VAULT ***');
              }
            }
          }
        }
      }
      
      // Check logs for swap and fee info
      console.log('\nSwap and Fee logs:');
      tx.meta.logMessages?.forEach(log => {
        if (log.includes('swap') || log.includes('Swap') || 
            log.includes('fee') || log.includes('Fee') || 
            log.includes('withheld') || log.includes('amount')) {
          console.log(log);
        }
      });
      
      // Calculate actual fee from balance changes
      console.log('\n=== Fee Analysis ===');
      let userBalanceChange = 0;
      let poolBalanceChange = 0;
      
      if (tx.meta.postTokenBalances && tx.meta.preTokenBalances) {
        for (let i = 0; i < tx.meta.postTokenBalances.length; i++) {
          const pre = tx.meta.preTokenBalances[i];
          const post = tx.meta.postTokenBalances[i];
          
          if (pre && post && pre.mint === post.mint && pre.mint === config.token.mint_address) {
            const account = tx.transaction.message.accountKeys[post.accountIndex].pubkey.toBase58();
            const change = Number(post.uiTokenAmount.amount) - Number(pre.uiTokenAmount.amount);
            
            if (account === 'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL') {
              poolBalanceChange = change;
            } else if (change < 0) {
              // User sending MIKO
              userBalanceChange = change;
            }
          }
        }
      }
      
      if (userBalanceChange < 0 && poolBalanceChange > 0) {
        const sent = Math.abs(userBalanceChange);
        const received = poolBalanceChange;
        const feeAmount = sent - received;
        const feePercent = (feeAmount / sent) * 100;
        
        console.log(`User sent: ${(sent / 1e9).toFixed(4)} MIKO`);
        console.log(`Pool received: ${(received / 1e9).toFixed(4)} MIKO`);
        console.log(`Fee deducted: ${(feeAmount / 1e9).toFixed(4)} MIKO (${feePercent.toFixed(2)}%)`);
        console.log(`Expected 5% fee: ${(sent * 0.05 / 1e9).toFixed(4)} MIKO`);
      }
    }
  }
  
  // Check accumulated fees on specific accounts
  console.log('\n\n=== Checking Accumulated Fees on Key Accounts ===');
  
  const keyAccounts = [
    { address: 'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL', name: 'Pool Vault' },
    { address: '4iv5YGiHRCZp36Zg38Eiua5YWHq7Hy1kBDM4D5ocdXYD', name: 'Test Wallet 1' },
    { address: 'J8oVTGH72HcfhdsUumh44SorU7J6gVgKMzA2suz3erto', name: 'Test Wallet 2' },
    { address: 'DV5UT9XDqoX32Citn5CACetfut18rgrAgZM5jatvm5g5', name: 'Wallet 17' }
  ];
  
  for (const { address, name } of keyAccounts) {
    try {
      const accountInfo = await connection.getAccountInfo(new PublicKey(address));
      if (!accountInfo) continue;
      
      const tokenAccount = unpackAccount(new PublicKey(address), accountInfo, TOKEN_2022_PROGRAM_ID);
      const transferFeeAmount = getTransferFeeAmount(tokenAccount);
      
      if (transferFeeAmount) {
        const withheld = Number(transferFeeAmount.withheldAmount);
        const balance = Number(tokenAccount.amount);
        
        console.log(`\n${name} (${address}):`);
        console.log(`  Balance: ${(balance / 1e9).toFixed(2)} MIKO`);
        console.log(`  Withheld fees: ${(withheld / 1e9).toFixed(2)} MIKO`);
      }
    } catch (e) {
      // Not a token account or other error
    }
  }
}

analyzeSwapFees().catch(console.error);