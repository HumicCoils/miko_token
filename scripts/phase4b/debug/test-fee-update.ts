import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { FeeUpdateImpl } from './phase4b-keeper/modules/fee-update-impl';
import * as fs from 'fs';
import { createLogger } from '../../keeper-bot/src/utils/logger';
import { ConfigManager } from './config-manager';

const logger = createLogger('TestFeeUpdate');

async function testFeeUpdate() {
  try {
    // Use ConfigManager to get auto-derived configuration
    const configManager = new ConfigManager('./minimal-config.json');
    const config = await configManager.getFullConfig();
    
    const phase4bVaultIdl = JSON.parse(fs.readFileSync('phase4b-vault-idl.json', 'utf-8'));

    // Create connection
    const connection = new Connection(config.network.rpc_url, 'confirmed');

    // Load deployer keypair (acts as keeper)
    const deployerData = JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8'));
    const keeper = Keypair.fromSecretKey(new Uint8Array(deployerData));

    logger.info('Test Fee Update Configuration:');
    logger.info(`- Vault Program: ${config.programs.vault_program_id}`);
    logger.info(`- MIKO Token: ${config.token.mint_address}`);
    logger.info(`- Vault PDA: ${config.pdas.vault_pda}`);
    logger.info(`- Keeper: ${keeper.publicKey.toBase58()}`);

    // Create fee update implementation
    const feeUpdateImpl = new FeeUpdateImpl(
      connection,
      new PublicKey(config.programs.vault_program_id),
      phase4bVaultIdl,
      new PublicKey(config.token.mint_address),
      new PublicKey(config.pdas.vault_pda),
      keeper
    );

    // Get current vault state
    logger.info('\nFetching current vault state...');
    const vaultState = await feeUpdateImpl.getVaultState();
    
    if (!vaultState) {
      logger.error('Failed to fetch vault state');
      return;
    }

    logger.info(`- Launch timestamp: ${new Date(vaultState.launchTimestamp * 1000).toISOString()}`);
    logger.info(`- Fee finalized: ${vaultState.feeFinalized}`);

    // Calculate elapsed time
    const currentTime = Math.floor(Date.now() / 1000);
    const elapsed = currentTime - vaultState.launchTimestamp;
    logger.info(`- Time elapsed since launch: ${elapsed} seconds (${Math.floor(elapsed / 60)} minutes)`);

    // Calculate expected fee
    const expectedFee = feeUpdateImpl.calculateExpectedFee(vaultState.launchTimestamp, currentTime);
    logger.info(`- Expected fee rate: ${expectedFee / 100}%`);

    if (vaultState.feeFinalized) {
      logger.info('\nFee is already finalized at 5%. No updates possible.');
      return;
    }

    // Check if fee update is needed
    let targetFee: number | null = null;
    if (elapsed < 300) {
      logger.info('\nLess than 5 minutes elapsed. Fee should remain at 30%.');
      targetFee = 3000;
    } else if (elapsed >= 300 && elapsed < 600) {
      logger.info('\n5-10 minutes elapsed. Fee should be 15%.');
      targetFee = 1500;
    } else {
      logger.info('\nMore than 10 minutes elapsed. Fee should be 5% (finalized).');
      targetFee = 500;
    }

    // Ask for confirmation
    logger.info(`\nReady to update fee to ${targetFee / 100}%?`);
    logger.info('Press Enter to continue or Ctrl+C to cancel...');
    
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });

    // Execute fee update
    logger.info(`\nUpdating fee to ${targetFee / 100}%...`);
    const result = await feeUpdateImpl.updateTransferFee(targetFee);

    if (result.success) {
      logger.info(`✅ Fee update successful!`);
      logger.info(`   Transaction: ${result.txSignature}`);
      logger.info(`   View on explorer: https://explorer.solana.com/tx/${result.txSignature}?cluster=custom&customUrl=http://127.0.0.1:8899`);
    } else {
      logger.error(`❌ Fee update failed: ${result.error}`);
    }

  } catch (error) {
    logger.error('Test failed:', error);
  }

  process.exit(0);
}

// Enable stdin for user input
process.stdin.setRawMode(true);
process.stdin.resume();

testFeeUpdate();