import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getTransferFeeConfig
} from '@solana/spl-token';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import { ConfigManager } from './config-manager';

async function updateFeeConfig() {
  const configManager = new ConfigManager('./minimal-config.json');
  const config = await configManager.getFullConfig();
  const connection = new Connection(config.network.rpc_url, 'confirmed');
  
  // Load keeper keypair
  const keeperKp = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync('./phase4b-keeper/phase4b-keeper-keypair.json', 'utf-8')))
  );
  
  const mintPubkey = new PublicKey(config.token.mint_address);
  const vaultPda = new PublicKey(config.pdas.vault_pda);
  const vaultProgramId = new PublicKey(config.programs.vault_program_id);
  
  console.log('=== Update Transfer Fee Configuration ===');
  console.log('Mint:', mintPubkey.toBase58());
  console.log('Vault PDA (Authority):', vaultPda.toBase58());
  console.log('Keeper:', keeperKp.publicKey.toBase58());
  
  try {
    // Get current mint info
    const mintInfo = await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const transferFeeConfig = getTransferFeeConfig(mintInfo);
    
    if (!transferFeeConfig) {
      throw new Error('No transfer fee config found');
    }
    
    console.log('\nCurrent Configuration:');
    console.log('Transfer Fee Authority:', transferFeeConfig.transferFeeConfigAuthority?.toBase58());
    console.log('Current Older Fee:', transferFeeConfig.olderTransferFee.transferFeeBasisPoints / 100, '%');
    console.log('Current Older Maximum:', Number(transferFeeConfig.olderTransferFee.maximumFee) / 1e9, 'MIKO');
    console.log('Current Newer Fee:', transferFeeConfig.newerTransferFee.transferFeeBasisPoints / 100, '%');
    console.log('Current Newer Maximum:', Number(transferFeeConfig.newerTransferFee.maximumFee) / 1e9, 'MIKO');
    
    // Check current epoch
    const epochInfo = await connection.getEpochInfo();
    console.log('\nCurrent Epoch:', epochInfo.epoch);
    console.log('Newer Fee Epoch:', transferFeeConfig.newerTransferFee.epoch.toString());
    
    const isNewerActive = epochInfo.epoch >= Number(transferFeeConfig.newerTransferFee.epoch);
    console.log('Active Fee Configuration:', isNewerActive ? 'Newer' : 'Older');
    
    // Verify the authority is the vault PDA
    if (!transferFeeConfig.transferFeeConfigAuthority?.equals(vaultPda)) {
      throw new Error('Vault PDA is not the transfer fee authority');
    }
    
    console.log('\n✅ Authority verified');
    
    // Load vault IDL
    const vaultIdl = JSON.parse(fs.readFileSync('./phase4b-vault-idl.json', 'utf-8'));
    
    // Create anchor provider and program
    const provider = new AnchorProvider(
      connection,
      new Wallet(keeperKp),
      { commitment: 'confirmed' }
    );
    
    // Override IDL address to match deployed program
    vaultIdl.address = vaultProgramId.toBase58();
    const vaultProgram = new Program(vaultIdl, provider);
    
    // Check if fee is already finalized
    const vaultState = await (vaultProgram.account as any).vaultState.fetch(vaultPda);
    if (vaultState.feeFinalized) {
      console.log('\n⚠️  Fee is already finalized. No updates are allowed.');
      return;
    }
    
    console.log('\nNew Configuration:');
    console.log('Fee Rate: 5% (500 basis points)');
    console.log('Maximum Fee: UNLIMITED');
    
    // Build the update_transfer_fee instruction
    const tx = await vaultProgram.methods
      .updateTransferFee(500) // 5% = 500 basis points
      .accounts({
        vault: vaultPda,
        keeper: keeperKp.publicKey,
        tokenMint: mintPubkey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .transaction();
    
    // Send and confirm transaction
    console.log('\nSending transaction...');
    const signature = await provider.sendAndConfirm(tx, [keeperKp], {
      commitment: 'confirmed',
      skipPreflight: false,
    });
    
    console.log('Transaction sent:', signature);
    console.log('\n✅ Transfer fee configuration updated successfully!');
    console.log('The vault program has set the fee to 5% with UNLIMITED maximum (u64::MAX)');
    
    // Verify the update
    console.log('\nVerifying update...');
    const updatedMint = await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const updatedConfig = getTransferFeeConfig(updatedMint);
    
    if (updatedConfig) {
      console.log('\nUpdated Configuration:');
      console.log('Newer Transfer Fee:');
      console.log('  Epoch:', updatedConfig.newerTransferFee.epoch.toString());
      console.log('  Fee Rate:', updatedConfig.newerTransferFee.transferFeeBasisPoints / 100, '%');
      console.log('  Maximum Fee:', updatedConfig.newerTransferFee.maximumFee.toString());
      
      const MAX_U64 = BigInt('18446744073709551615');
      if (updatedConfig.newerTransferFee.maximumFee.toString() === MAX_U64.toString()) {
        console.log('\n✅ SUCCESS: Maximum fee cap has been removed!');
        console.log('Transfers will now be charged the full 5% fee with no upper limit.');
      } else {
        console.log('\nMaximum fee in MIKO:', Number(updatedConfig.newerTransferFee.maximumFee) / 1e9);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

updateFeeConfig().catch(console.error);