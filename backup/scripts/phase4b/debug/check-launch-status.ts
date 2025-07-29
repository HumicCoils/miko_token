import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider } from '@coral-xyz/anchor';
import vaultIdl from '../phase4b-vault-idl.json';

const VAULT_PROGRAM_ID = new PublicKey('9qPiWoJJdas55cMZqa8d62tVHP9hbYX6NwT34qbHe9pt');
const MIKO_TOKEN = new PublicKey('EkgPtCLLsbWxhdYrCpqWej2ULoytu6QcygpnyFeiT4Gs');

async function checkLaunchStatus() {
    const connection = new Connection('http://localhost:8899', 'confirmed');
    
    // Calculate Vault PDA
    const [vaultPda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), MIKO_TOKEN.toBuffer()],
        VAULT_PROGRAM_ID
    );
    
    console.log('Vault PDA:', vaultPda.toBase58());
    
    // Create provider
    const provider = new AnchorProvider(
        connection,
        {} as any,
        { commitment: 'confirmed' }
    );
    
    // Set the IDL address to the deployed program
    (vaultIdl as any).address = VAULT_PROGRAM_ID.toBase58();
    const program = new anchor.Program(vaultIdl as any, provider);
    
    try {
        // Fetch vault state
        const vaultState = await (program.account as any).vaultState.fetch(vaultPda);
        
        console.log('\nVault State:');
        console.log('Raw state keys:', Object.keys(vaultState));
        console.log('Token Mint:', vaultState.tokenMint.toBase58());
        console.log('Authority:', vaultState.authority.toBase58());
        const launchTime = vaultState.launchTimestamp ? vaultState.launchTimestamp.toNumber() : 0;
        console.log('Launch Time:', launchTime > 0 ? new Date(launchTime * 1000).toISOString() : 'NOT SET');
        console.log('Launch Time (Unix):', launchTime);
        console.log('Current Fee BPS:', vaultState.currentFeeBps || 'undefined');
        console.log('Total Fees Collected:', vaultState.totalFeesCollected?.toString() || '0');
        console.log('Total Rewards Distributed:', vaultState.totalRewardsDistributed?.toString() || '0');
        
        // Check if launch has happened
        const currentTime = Math.floor(Date.now() / 1000);
        const timeSinceLaunch = currentTime - launchTime;
        
        if (launchTime === 0) {
            console.log('\n⚠️ Launch time NOT set yet!');
        } else {
            console.log(`\n✅ Launch time set! Time since launch: ${timeSinceLaunch}s`);
            
            // Calculate expected fee based on time
            let expectedFee;
            if (timeSinceLaunch < 300) {
                expectedFee = 3000; // 30%
            } else if (timeSinceLaunch < 600) {
                expectedFee = 1500; // 15%
            } else {
                expectedFee = 500; // 5%
            }
            
            console.log(`Expected fee: ${expectedFee / 100}% (${expectedFee} bps)`);
            console.log(`Actual fee: ${vaultState.currentFeeBps / 100}% (${vaultState.currentFeeBps} bps)`);
        }
        
        // Check launch execution log
        const fs = require('fs');
        const launchLog = '../launch-execution.log';
        if (fs.existsSync(launchLog)) {
            console.log('\n📋 Launch Execution Log:');
            const logContent = fs.readFileSync(launchLog, 'utf8');
            const lines = logContent.trim().split('\n');
            lines.forEach((line: string) => {
                const entry = JSON.parse(line);
                console.log(`- ${entry.stage}: ${entry.mikoAdded / 1e6}M MIKO + ${entry.solAdded} SOL @ ${new Date(entry.timestamp).toLocaleTimeString()}`);
            });
            
            // Pool info from log
            const bootstrap = JSON.parse(lines[0]);
            console.log(`\n🏊 Pool ID: ${bootstrap.poolId}`);
        }
        
    } catch (error) {
        console.error('Error fetching vault state:', error);
    }
}

checkLaunchStatus().catch(console.error);