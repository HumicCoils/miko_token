import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction } from '@solana/web3.js';
import * as fs from 'fs';
import BN from 'bn.js';

const RPC_URL = 'https://api.devnet.solana.com';

async function main() {
  try {
    console.log('🔧 Updating Vault Configuration to Correct Wallets...\n');

    // Load deployer keypair (authority)
    const deployerPath = '/shared-artifacts/deployer-keypair.json';
    const deployerRaw = fs.readFileSync(deployerPath, 'utf-8');
    const deployerKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(deployerRaw)));
    console.log('✅ Authority:', deployerKeypair.publicKey.toBase58());

    // Load project wallets
    const walletsPath = '/shared-artifacts/project-wallets.json';
    const wallets = JSON.parse(fs.readFileSync(walletsPath, 'utf-8'));
    
    const newTreasury = new PublicKey(wallets.treasury.publicKey);
    const newOwnerWallet = new PublicKey(wallets.owner.publicKey);
    
    console.log('\n📋 New Configuration:');
    console.log('  - New Treasury:', newTreasury.toBase58());
    console.log('  - New Owner Wallet:', newOwnerWallet.toBase58());
    console.log('  - Keeper Authority: CANNOT BE CHANGED (stuck as deployer)');

    const connection = new Connection(RPC_URL, 'confirmed');

    // Load vault info
    const vaultInfoPath = '/shared-artifacts/vault-init-info.json';
    const vaultInfo = JSON.parse(fs.readFileSync(vaultInfoPath, 'utf-8'));
    const vaultPDA = new PublicKey(vaultInfo.vaultPDA);
    const vaultProgram = new PublicKey(vaultInfo.vaultProgram);
    
    console.log('\n✅ Vault PDA:', vaultPDA.toBase58());
    console.log('✅ Vault Program:', vaultProgram.toBase58());

    // Check current vault state
    const vaultAccount = await connection.getAccountInfo(vaultPDA);
    if (!vaultAccount) {
      throw new Error('Vault account not found');
    }

    // Parse current state (basic parsing)
    const vaultData = vaultAccount.data;
    const currentAuthority = new PublicKey(vaultData.slice(8, 40));
    const currentTreasury = new PublicKey(vaultData.slice(40, 72));
    const currentOwnerWallet = new PublicKey(vaultData.slice(72, 104));
    
    console.log('\n📊 Current Vault State:');
    console.log('  - Authority:', currentAuthority.toBase58());
    console.log('  - Treasury:', currentTreasury.toBase58());
    console.log('  - Owner Wallet:', currentOwnerWallet.toBase58());

    // Verify we have authority
    if (!currentAuthority.equals(deployerKeypair.publicKey)) {
      throw new Error(`Not authorized. Current authority: ${currentAuthority.toBase58()}`);
    }

    // Create update_config instruction
    const discriminator = Buffer.from([29, 158, 252, 191, 10, 83, 219, 99]); // update_config discriminator
    
    // Encode Option<Pubkey> - 1 byte for Some(1) + 32 bytes for pubkey
    const encodeSomePublicKey = (pubkey: PublicKey) => {
      const buffer = Buffer.alloc(33);
      buffer.writeUInt8(1, 0); // Some variant
      pubkey.toBuffer().copy(buffer, 1);
      return buffer;
    };
    
    // Encode Option<u64> - 1 byte for None(0)
    const encodeNone = () => Buffer.from([0]);
    
    const data = Buffer.concat([
      discriminator,
      encodeSomePublicKey(newTreasury),       // new_treasury: Some(pubkey)
      encodeSomePublicKey(newOwnerWallet),    // new_owner_wallet: Some(pubkey)
      encodeNone(),                           // new_min_hold_amount: None
      encodeNone(),                           // new_harvest_threshold: None
    ]);

    const updateConfigIx = new TransactionInstruction({
      programId: vaultProgram,
      keys: [
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: deployerKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data,
    });

    // Execute transaction
    const tx = new Transaction().add(updateConfigIx);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = deployerKeypair.publicKey;

    console.log('\n🚀 Sending update transaction...');
    const signature = await connection.sendTransaction(tx, [deployerKeypair]);
    console.log('📝 Transaction signature:', signature);

    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Transaction confirmed!');

    // Verify update
    console.log('\n🔍 Verifying update...');
    const updatedVaultAccount = await connection.getAccountInfo(vaultPDA);
    if (!updatedVaultAccount) {
      throw new Error('Vault account not found after update');
    }

    const updatedVaultData = updatedVaultAccount.data;
    const updatedTreasury = new PublicKey(updatedVaultData.slice(40, 72));
    const updatedOwnerWallet = new PublicKey(updatedVaultData.slice(72, 104));

    console.log('✅ Updated Treasury:', updatedTreasury.toBase58());
    console.log('✅ Updated Owner Wallet:', updatedOwnerWallet.toBase58());
    
    console.log('\n🔍 Verification:');
    console.log('  - Treasury matches new:', updatedTreasury.equals(newTreasury) ? 'Yes ✅' : 'No ❌');
    console.log('  - Owner wallet matches new:', updatedOwnerWallet.equals(newOwnerWallet) ? 'Yes ✅' : 'No ❌');

    // Update vault-init-info.json
    vaultInfo.configUpdateTx = signature;
    vaultInfo.updatedConfig = {
      treasury: updatedTreasury.toBase58(),
      ownerWallet: updatedOwnerWallet.toBase58(),
      updatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(vaultInfoPath, JSON.stringify(vaultInfo, null, 2));
    console.log('\n✅ Vault info updated:', vaultInfoPath);

    console.log('\n✅ Vault configuration successfully updated!');
    console.log('  Treasury:', currentTreasury.toBase58(), '→', updatedTreasury.toBase58());
    console.log('  Owner Wallet:', currentOwnerWallet.toBase58(), '→', updatedOwnerWallet.toBase58());

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();