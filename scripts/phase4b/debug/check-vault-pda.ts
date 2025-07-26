import { PublicKey } from '@solana/web3.js';
import { ConfigManager } from '../config-manager';

async function checkVaultPda() {
  // Use ConfigManager to get auto-derived configuration
  const configManager = new ConfigManager('./minimal-config.json');
  const config = await configManager.getFullConfig();

  const vaultProgram = new PublicKey(config.programs.vault_program_id);
  const mikoToken = new PublicKey(config.token.mint_address);

  console.log('Vault Program:', vaultProgram.toBase58());
  console.log('MIKO Token:', mikoToken.toBase58());

  // Calculate Vault PDA
  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), mikoToken.toBuffer()],
    vaultProgram
  );

  console.log('\nVault PDA:', vaultPda.toBase58());
  console.log('Vault Bump:', vaultBump);
  console.log('\nConfigManager Vault PDA:', config.pdas.vault_pda);
  console.log('Match:', vaultPda.toBase58() === config.pdas.vault_pda);
}

checkVaultPda().catch(console.error);