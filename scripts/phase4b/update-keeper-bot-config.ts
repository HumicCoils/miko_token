import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';

const FORK_URL = 'http://127.0.0.1:8899';

async function updateKeeperBotConfig() {
  const connection = new Connection(FORK_URL, 'confirmed');
  
  // Load configurations
  const config = JSON.parse(fs.readFileSync('phase4b-config.json', 'utf-8'));
  const initInfo = JSON.parse(fs.readFileSync('phase4b-init-info.json', 'utf-8'));
  const walletInfo = JSON.parse(fs.readFileSync('phase4b-wallet-recovery.json', 'utf-8'));
  const vaultIdl = JSON.parse(fs.readFileSync('phase4b-vault-idl.json', 'utf-8'));
  
  // Load deployer
  const deployerData = JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  // Create provider
  const wallet = new NodeWallet(deployer);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const vaultProgram = new Program(vaultIdl, provider);
  
  // Get current vault state
  const vaultPda = new PublicKey(initInfo.vault.pda);
  const vaultState = await (vaultProgram.account as any).vaultState.fetch(vaultPda);
  
  console.log('Current Vault Configuration:');
  console.log('- Treasury:', vaultState.treasury.toBase58());
  console.log('- Owner Wallet:', vaultState.ownerWallet.toBase58());
  console.log('- Keeper Authority:', vaultState.keeperAuthority.toBase58());
  
  // Create enhanced keeper bot config
  const keeperBotConfig = {
    network: "mainnet-fork",
    rpcUrl: "http://127.0.0.1:8899",
    programs: {
      vault: config.programs.vault,
      smartDial: config.programs.smartDial
    },
    pdas: {
      vault: initInfo.vault.pda,
      smartDial: initInfo.smartDial.pda
    },
    mikoToken: config.mikoToken,
    wallets: {
      deployer: config.deployer,
      treasury: vaultState.treasury.toBase58(),
      ownerWallet: vaultState.ownerWallet.toBase58(),
      keeperAuthority: vaultState.keeperAuthority.toBase58(),
      keeper: walletInfo.wallets.keeper.publicKey
    },
    keeperKeypair: "phase4b-keeper-keypair.json",
    harvestThreshold: 500000,
    distributionEngineVersion: "v2",
    features: {
      rollover: true,
      emergencyWithdraw: true,
      autoFeeUpdate: true
    },
    external: {
      raydiumClmm: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
      jupiterV6: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
      pythSolPrice: "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"
    }
  };
  
  // Save updated config
  fs.writeFileSync('keeper-bot-config-phase4b.json', JSON.stringify(keeperBotConfig, null, 2));
  
  console.log('\n✓ Keeper bot configuration updated!');
  console.log('  Saved to: keeper-bot-config-phase4b.json');
  console.log('\nNote: Keeper authority is still deployer due to architectural constraint.');
  console.log('      The keeper wallet is available for future use.');
}

updateKeeperBotConfig().catch(console.error);