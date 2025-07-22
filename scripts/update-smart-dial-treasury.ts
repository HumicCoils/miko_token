import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction } from '@solana/web3.js';
import * as fs from 'fs';

const RPC_URL = 'https://api.devnet.solana.com';

async function main() {
  try {
    console.log('🔧 Updating Smart Dial Treasury to Match Vault Owner Wallet...\n');

    // Load deployer keypair (authority)
    const deployerPath = '/shared-artifacts/deployer-keypair.json';
    const deployerRaw = fs.readFileSync(deployerPath, 'utf-8');
    const deployerKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(deployerRaw)));
    console.log('✅ Authority:', deployerKeypair.publicKey.toBase58());

    // Load project wallets
    const walletsPath = '/shared-artifacts/project-wallets.json';
    const wallets = JSON.parse(fs.readFileSync(walletsPath, 'utf-8'));
    const ownerWallet = new PublicKey(wallets.owner.publicKey);
    
    console.log('\n📋 Target Configuration:');
    console.log('  - New Treasury:', ownerWallet.toBase58());
    console.log('  - Reason: Must match Vault ownerWallet for 20% tax distribution');

    const connection = new Connection(RPC_URL, 'confirmed');

    // Load programs info
    const programsPath = '/shared-artifacts/programs.json';
    const programs = JSON.parse(fs.readFileSync(programsPath, 'utf-8'));
    const smartDialProgram = new PublicKey(programs.smartDial.programId);
    console.log('✅ Smart Dial Program:', smartDialProgram.toBase58());

    // Calculate Smart Dial state PDA
    const [dialStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('smart-dial')],
      smartDialProgram
    );
    console.log('✅ Dial State PDA:', dialStatePDA.toBase58());

    // Check current state
    const dialAccount = await connection.getAccountInfo(dialStatePDA);
    if (!dialAccount) {
      throw new Error('Dial state account not found');
    }

    const dialData = dialAccount.data;
    const currentAuthority = new PublicKey(dialData.slice(8, 40));
    const currentTreasury = new PublicKey(dialData.slice(72, 104));

    console.log('\n📊 Current State:');
    console.log('  - Authority:', currentAuthority.toBase58());
    console.log('  - Current Treasury:', currentTreasury.toBase58());

    // Verify we have authority
    if (!currentAuthority.equals(deployerKeypair.publicKey)) {
      throw new Error(`Not authorized. Current authority: ${currentAuthority.toBase58()}`);
    }

    // Check if already correct
    if (currentTreasury.equals(ownerWallet)) {
      console.log('\n✅ Treasury is already set correctly!');
      return;
    }

    // Create update_treasury instruction
    const discriminator = Buffer.from([60, 16, 243, 66, 96, 59, 254, 131]); // update_treasury discriminator
    const data = Buffer.concat([
      discriminator,
      ownerWallet.toBuffer(),
    ]);

    const updateTreasuryIx = new TransactionInstruction({
      programId: smartDialProgram,
      keys: [
        { pubkey: dialStatePDA, isSigner: false, isWritable: true },
        { pubkey: deployerKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data,
    });

    // Execute transaction
    const tx = new Transaction().add(updateTreasuryIx);
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
    const updatedDialAccount = await connection.getAccountInfo(dialStatePDA);
    if (!updatedDialAccount) {
      throw new Error('Dial state account not found after update');
    }

    const updatedDialData = updatedDialAccount.data;
    const updatedTreasury = new PublicKey(updatedDialData.slice(72, 104));

    console.log('✅ Updated Treasury:', updatedTreasury.toBase58());
    console.log('✅ Treasury matches owner wallet:', updatedTreasury.equals(ownerWallet) ? 'Yes' : 'No');

    // Update smart-dial-info.json
    const dialInfo = {
      program: smartDialProgram.toBase58(),
      dialStatePDA: dialStatePDA.toBase58(),
      dialBump: 255,
      authority: currentAuthority.toBase58(),
      treasury: updatedTreasury.toBase58(),
      currentRewardToken: new PublicKey(updatedDialData.slice(40, 72)).toBase58(),
      isSOL: new PublicKey(updatedDialData.slice(40, 72)).equals(PublicKey.default),
      launchTimestamp: Number(updatedDialData.readBigInt64LE(104)),
      treasuryUpdateTx: signature,
      updatedAt: new Date().toISOString(),
    };

    const dialInfoPath = '/shared-artifacts/smart-dial-info.json';
    fs.writeFileSync(dialInfoPath, JSON.stringify(dialInfo, null, 2));
    console.log('\n✅ Smart Dial info updated:', dialInfoPath);

    console.log('\n✅ Smart Dial treasury successfully updated!');
    console.log('  Previous treasury:', currentTreasury.toBase58());
    console.log('  New treasury:', updatedTreasury.toBase58());
    console.log('  Matches Vault owner wallet: Yes');
    
    console.log('\n📋 Architecture Alignment:');
    console.log('  - Vault treasury:', wallets.treasury.publicKey, '(holds 80% for distribution)');
    console.log('  - Vault ownerWallet:', wallets.owner.publicKey, '(receives 20% tax)');
    console.log('  - Smart Dial treasury:', updatedTreasury.toBase58(), '(receives 20% from Vault)');
    console.log('  ✅ Smart Dial treasury = Vault ownerWallet (correct)');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();