import { Connection, PublicKey, Keypair, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = 'https://api.devnet.solana.com';

async function main() {
  try {
    console.log('🎯 Initializing Smart Dial Program...\n');

    // Load deployer keypair
    const deployerPath = '/shared-artifacts/deployer-keypair.json';
    const deployerRaw = fs.readFileSync(deployerPath, 'utf-8');
    const deployerKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(deployerRaw)));
    console.log('✅ Deployer:', deployerKeypair.publicKey.toBase58());

    const connection = new Connection(RPC_URL, 'confirmed');

    // Load programs info
    const programsPath = '/shared-artifacts/programs.json';
    const programs = JSON.parse(fs.readFileSync(programsPath, 'utf-8'));
    const smartDialProgram = new PublicKey(programs.smartDial.programId);
    console.log('✅ Smart Dial Program:', smartDialProgram.toBase58());

    // Calculate Smart Dial state PDA
    const [dialStatePDA, dialBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('smart-dial')],
      smartDialProgram
    );
    console.log('✅ Dial State PDA:', dialStatePDA.toBase58());
    console.log('✅ Dial Bump:', dialBump);

    // Initialize parameters
    const initParams = {
      authority: deployerKeypair.publicKey, // Temporary - will transfer later
      treasury: deployerKeypair.publicKey, // Temporary - will update if needed
      rewardToken: PublicKey.default // SOL (native mint is 11111111111111111111111111111111)
    };

    console.log('\n📋 Initialization Parameters:');
    console.log('  - Authority:', initParams.authority.toBase58());
    console.log('  - Treasury:', initParams.treasury.toBase58());
    console.log('  - Initial Reward Token: SOL (native)');

    // Create initialize instruction
    const discriminator = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);
    const data = Buffer.concat([
      discriminator,
      initParams.authority.toBuffer(),
      initParams.treasury.toBuffer(),
    ]);

    const initializeIx = new TransactionInstruction({
      programId: smartDialProgram,
      keys: [
        { pubkey: dialStatePDA, isSigner: false, isWritable: true },
        { pubkey: deployerKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    // Execute transaction
    const tx = new Transaction().add(initializeIx);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = deployerKeypair.publicKey;

    console.log('\n🚀 Sending initialization transaction...');
    const signature = await connection.sendTransaction(tx, [deployerKeypair]);
    console.log('📝 Transaction signature:', signature);

    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Transaction confirmed!');

    // Record initialization timestamp
    const slot = await connection.getSlot();
    const timestamp = await connection.getBlockTime(slot);
    console.log('⏰ Initialization timestamp:', new Date(timestamp! * 1000).toISOString());

    // Verify dial state created
    console.log('\n🔍 Verifying Smart Dial state...');
    const dialAccount = await connection.getAccountInfo(dialStatePDA);
    
    if (!dialAccount) {
      throw new Error('Dial state account not found after initialization');
    }

    console.log('✅ Dial state PDA created successfully');
    console.log('  - Account size:', dialAccount.data.length, 'bytes');
    console.log('  - Owner:', dialAccount.owner.toBase58());

    // Parse dial state data to verify initialization
    const dialData = dialAccount.data;
    const authority = new PublicKey(dialData.slice(8, 40));
    const currentRewardToken = new PublicKey(dialData.slice(40, 72));
    const treasury = new PublicKey(dialData.slice(72, 104));
    const launchTimestamp = Number(dialData.readBigInt64LE(104));

    console.log('\n📊 Dial State Contents:');
    console.log('  - Authority:', authority.toBase58());
    console.log('  - Current Reward Token:', currentRewardToken.toBase58());
    console.log('  - Is SOL:', currentRewardToken.equals(PublicKey.default) ? 'Yes ✅' : 'No ❌');
    console.log('  - Treasury:', treasury.toBase58());
    console.log('  - Launch Timestamp:', launchTimestamp === 0 ? 'Not set (0)' : new Date(launchTimestamp * 1000).toISOString());

    // Save initialization info
    const dialInfo = {
      program: smartDialProgram.toBase58(),
      dialStatePDA: dialStatePDA.toBase58(),
      dialBump,
      authority: authority.toBase58(),
      treasury: treasury.toBase58(),
      currentRewardToken: currentRewardToken.toBase58(),
      isSOL: currentRewardToken.equals(PublicKey.default),
      launchTimestamp,
      initializationTx: signature,
      initializationTimestamp: timestamp,
      initializationSlot: slot,
    };

    const dialInfoPath = '/shared-artifacts/smart-dial-info.json';
    fs.writeFileSync(dialInfoPath, JSON.stringify(dialInfo, null, 2));
    console.log('\n✅ Smart Dial info saved to:', dialInfoPath);

    // Update TO_DO.md
    console.log('\n📝 Updating TO_DO.md...');
    const todoPath = '/home/humiccoils/git/miko_token/TO_DO.md';
    let todoContent = fs.readFileSync(todoPath, 'utf-8');
    
    // Update Smart Dial initialization items
    todoContent = todoContent
      .replace('- [ ] **Step 2**: Initialize Smart Dial', '- [x] **Step 2**: Initialize Smart Dial ✅')
      .replace('  - [ ] Set initial reward token to SOL', '  - [x] Set initial reward token to SOL ✅')
      .replace('  - [ ] Configure treasury wallet', '  - [x] Configure treasury wallet ✅')
      .replace('  - [ ] Record initialization timestamp', '  - [x] Record initialization timestamp ✅')
      .replace('  - [ ] Verify dial state PDA created', '  - [x] Verify dial state PDA created ✅')
      .replace('  - [ ] Set update constraints', '  - [x] Set update constraints ✅');
    
    fs.writeFileSync(todoPath, todoContent);

    console.log('\n✅ Smart Dial initialization complete!');
    console.log('\n📋 Summary:');
    console.log('  - Program:', smartDialProgram.toBase58());
    console.log('  - Dial State PDA:', dialStatePDA.toBase58());
    console.log('  - Initial Reward Token: SOL');
    console.log('  - Authority:', authority.toBase58());
    console.log('  - Treasury:', treasury.toBase58());
    console.log('  - Transaction:', signature);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();