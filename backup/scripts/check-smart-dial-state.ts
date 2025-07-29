import { Connection, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';

const RPC_URL = 'https://api.devnet.solana.com';

async function main() {
  try {
    console.log('🔍 Checking Smart Dial state...\n');

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

    // Check if dial state exists
    const dialAccount = await connection.getAccountInfo(dialStatePDA);
    
    if (!dialAccount) {
      console.log('❌ Dial state account not found - NOT INITIALIZED');
      return;
    }

    console.log('✅ Dial state PDA exists');
    console.log('  - Account size:', dialAccount.data.length, 'bytes');
    console.log('  - Owner:', dialAccount.owner.toBase58());
    console.log('  - Lamports:', dialAccount.lamports);

    // Parse dial state data
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

    // Save current state info
    const dialInfo = {
      program: smartDialProgram.toBase58(),
      dialStatePDA: dialStatePDA.toBase58(),
      dialBump,
      authority: authority.toBase58(),
      treasury: treasury.toBase58(),
      currentRewardToken: currentRewardToken.toBase58(),
      isSOL: currentRewardToken.equals(PublicKey.default),
      launchTimestamp,
      alreadyInitialized: true,
    };

    const dialInfoPath = '/shared-artifacts/smart-dial-info.json';
    fs.writeFileSync(dialInfoPath, JSON.stringify(dialInfo, null, 2));
    console.log('\n✅ Smart Dial info saved to:', dialInfoPath);

    console.log('\n✅ Smart Dial is already initialized!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();