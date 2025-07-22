import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import * as fs from 'fs';

const RPC_URL = 'https://api.devnet.solana.com';

async function main() {
  try {
    console.log('💰 Checking Token Distribution Status...\n');

    const connection = new Connection(RPC_URL, 'confirmed');

    // Load token info
    const tokenInfoPath = '/shared-artifacts/token-info.json';
    const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf-8'));
    const mintPubkey = new PublicKey(tokenInfo.mint);
    const totalSupply = BigInt(tokenInfo.totalSupply) * BigInt(Math.pow(10, tokenInfo.decimals));
    
    console.log('📊 Token Information:');
    console.log('  - Mint:', mintPubkey.toBase58());
    console.log('  - Total Supply:', (Number(totalSupply) / Math.pow(10, tokenInfo.decimals)).toLocaleString(), 'MIKO');
    console.log('  - Decimals:', tokenInfo.decimals);

    // Load deployer keypair
    const deployerPath = '/shared-artifacts/deployer-keypair.json';
    const deployerRaw = fs.readFileSync(deployerPath, 'utf-8');
    const deployerKeypair = JSON.parse(deployerRaw);
    const deployerPubkey = new PublicKey(deployerKeypair.slice(32));
    console.log('\n👤 Deployer Wallet:', deployerPubkey.toBase58());

    // Get deployer ATA
    const deployerATA = await getAssociatedTokenAddress(
      mintPubkey,
      deployerPubkey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Get deployer balance
    const deployerAccount = await getAccount(connection, deployerATA, undefined, TOKEN_2022_PROGRAM_ID);
    const deployerBalance = BigInt(deployerAccount.amount);
    const deployerBalanceFormatted = Number(deployerBalance) / Math.pow(10, tokenInfo.decimals);

    console.log('\n💼 Current Deployer Token Balance:');
    console.log('  - Amount:', deployerBalanceFormatted.toLocaleString(), 'MIKO');
    console.log('  - Percentage of supply:', ((Number(deployerBalance) / Number(totalSupply)) * 100).toFixed(2) + '%');

    // Calculate allocations (90% LP, 10% deployer retention)
    const lpAllocation = (Number(totalSupply) * 0.9) / Math.pow(10, tokenInfo.decimals);
    const deployerRetention = (Number(totalSupply) * 0.1) / Math.pow(10, tokenInfo.decimals);

    console.log('\n📈 Planned Token Allocation:');
    console.log('  - Liquidity Pool (90%):', lpAllocation.toLocaleString(), 'MIKO');
    console.log('  - Deployer Retention (10%):', deployerRetention.toLocaleString(), 'MIKO');
    console.log('  - Team Allocation: 0 MIKO (None)');
    console.log('  - Marketing Allocation: 0 MIKO (None)');

    // Check if any tokens have been distributed
    const tokensDistributed = totalSupply - deployerBalance;
    const tokensDistributedFormatted = Number(tokensDistributed) / Math.pow(10, tokenInfo.decimals);
    
    console.log('\n📊 Current Status:');
    console.log('  - Tokens in deployer wallet:', deployerBalanceFormatted.toLocaleString(), 'MIKO');
    console.log('  - Tokens distributed:', tokensDistributedFormatted.toLocaleString(), 'MIKO');
    console.log('  - Distribution percentage:', ((Number(tokensDistributed) / Number(totalSupply)) * 100).toFixed(4) + '%');

    // Save distribution status
    const distributionStatus = {
      timestamp: new Date().toISOString(),
      totalSupply: totalSupply.toString(),
      totalSupplyFormatted: (Number(totalSupply) / Math.pow(10, tokenInfo.decimals)).toLocaleString() + ' MIKO',
      deployerWallet: deployerPubkey.toBase58(),
      currentBalance: {
        amount: deployerBalance.toString(),
        formatted: deployerBalanceFormatted.toLocaleString() + ' MIKO',
        percentage: ((Number(deployerBalance) / Number(totalSupply)) * 100).toFixed(2) + '%'
      },
      plannedAllocation: {
        liquidityPool: {
          amount: (Number(totalSupply) * 0.9).toString(),
          formatted: lpAllocation.toLocaleString() + ' MIKO',
          percentage: '90%'
        },
        deployerRetention: {
          amount: (Number(totalSupply) * 0.1).toString(),
          formatted: deployerRetention.toLocaleString() + ' MIKO',
          percentage: '10%'
        },
        team: {
          amount: '0',
          formatted: '0 MIKO',
          percentage: '0%'
        },
        marketing: {
          amount: '0',
          formatted: '0 MIKO',
          percentage: '0%'
        }
      },
      tokensDistributed: {
        amount: tokensDistributed.toString(),
        formatted: tokensDistributedFormatted.toLocaleString() + ' MIKO',
        percentage: ((Number(tokensDistributed) / Number(totalSupply)) * 100).toFixed(4) + '%',
        note: 'Small amount distributed due to VC:3.TRANSFER_TEST'
      },
      readyForLaunch: {
        hasMinimumBalance: Number(deployerBalance) > Number(totalSupply) * 0.95,
        status: Number(deployerBalance) > Number(totalSupply) * 0.95 ? 'Ready' : 'Need to consolidate tokens'
      },
      notes: [
        '90% of total supply will be invested in liquidity pool',
        '10% will be retained by deployer',
        'No team or marketing allocations',
        'Currently ~100 MIKO distributed for testing purposes'
      ]
    };

    const distributionPath = '/shared-artifacts/token-distribution-status.json';
    fs.writeFileSync(distributionPath, JSON.stringify(distributionStatus, null, 2));
    console.log('\n✅ Distribution status saved to:', distributionPath);

    // Check if ready for launch
    const isReadyForLaunch = Number(deployerBalance) > Number(totalSupply) * 0.95; // Has at least 95% of supply
    console.log('\n🚀 Launch Readiness:');
    console.log('  - Sufficient tokens in deployer:', isReadyForLaunch ? 'Yes ✅' : 'No ❌');
    console.log('  - Status:', isReadyForLaunch ? 'Ready for launch' : 'Need to consolidate tokens');
    
    if (isReadyForLaunch) {
      console.log('\n✅ Token distribution is ready:');
      console.log('  - Deployer holds ~100% of supply');
      console.log('  - 90% will be used for liquidity pool at launch');
      console.log('  - 10% will be retained by deployer');
      console.log('  - No additional distributions needed');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();