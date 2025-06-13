const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Program, AnchorProvider } = require('@coral-xyz/anchor');
const fs = require('fs');

async function testSetup() {
    console.log('Testing keeper bot setup...\n');
    
    // Test environment variables
    console.log('Environment variables:');
    console.log('- RPC_URL:', process.env.RPC_URL || 'https://api.devnet.solana.com');
    console.log('- NODE_ENV:', process.env.NODE_ENV || 'not set');
    console.log('- TEST_MODE:', process.env.TEST_MODE || 'not set');
    
    // Test connection
    const connection = new Connection(process.env.RPC_URL || 'https://api.devnet.solana.com');
    try {
        const version = await connection.getVersion();
        console.log('\n✅ Connected to Solana:', version);
    } catch (error) {
        console.error('\n❌ Failed to connect to Solana:', error.message);
    }
    
    // Test program IDs
    console.log('\nProgram IDs:');
    console.log('- Absolute Vault:', process.env.ABSOLUTE_VAULT_PROGRAM_ID || 'not set');
    console.log('- Smart Dial:', process.env.SMART_DIAL_PROGRAM_ID || 'not set');
    console.log('- MIKO Token:', process.env.MIKO_TOKEN_MINT || 'not set');
    
    // Test keeper bot keypair
    try {
        const keyBytes = Buffer.from(process.env.KEEPER_BOT_KEY || '', 'base64');
        const keypair = Keypair.fromSecretKey(keyBytes);
        console.log('\n✅ Keeper bot wallet:', keypair.publicKey.toString());
        
        // Check balance
        const balance = await connection.getBalance(keypair.publicKey);
        console.log('- Balance:', balance / 1e9, 'SOL');
    } catch (error) {
        console.error('\n❌ Failed to load keeper bot keypair:', error.message);
    }
    
    // Check if programs are deployed
    if (process.env.ABSOLUTE_VAULT_PROGRAM_ID) {
        try {
            const programInfo = await connection.getAccountInfo(
                new PublicKey(process.env.ABSOLUTE_VAULT_PROGRAM_ID)
            );
            console.log('\n✅ Absolute Vault program deployed:', programInfo.owner.toString());
        } catch (error) {
            console.error('\n❌ Absolute Vault program not found');
        }
    }
    
    if (process.env.SMART_DIAL_PROGRAM_ID) {
        try {
            const programInfo = await connection.getAccountInfo(
                new PublicKey(process.env.SMART_DIAL_PROGRAM_ID)
            );
            console.log('✅ Smart Dial program deployed:', programInfo.owner.toString());
        } catch (error) {
            console.error('❌ Smart Dial program not found');
        }
    }
    
    // Check token mint
    if (process.env.MIKO_TOKEN_MINT) {
        try {
            const mintInfo = await connection.getAccountInfo(
                new PublicKey(process.env.MIKO_TOKEN_MINT)
            );
            console.log('✅ MIKO token mint exists:', mintInfo.owner.toString());
        } catch (error) {
            console.error('❌ MIKO token mint not found');
        }
    }
    
    console.log('\nTest mode settings:');
    console.log('- Will use mocked prices:', process.env.NODE_ENV === 'development' || process.env.TEST_MODE === 'true');
    console.log('- Will simulate swaps:', process.env.NODE_ENV === 'development' || process.env.TEST_MODE === 'true');
}

// Load environment variables manually
const envPath = './keeper-bot/.env';
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
            process.env[match[1].trim()] = match[2].trim();
        }
    });
}

testSetup().catch(console.error);