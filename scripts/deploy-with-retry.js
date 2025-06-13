const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function deployProgram(programPath, programId, maxRetries = 10) {
    console.log(`Deploying ${programPath} to ${programId}`);
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            console.log(`Attempt ${i + 1}/${maxRetries}`);
            
            // Try to deploy
            const { stdout, stderr } = await execAsync(
                `solana program deploy ${programPath} --program-id ${programId} --max-sign-attempts 1`,
                { maxBuffer: 1024 * 1024 * 10 }
            );
            
            console.log('Deployment successful!');
            console.log(stdout);
            return true;
            
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error.message);
            
            // Extract buffer address from error message
            const bufferMatch = error.message.match(/solana program close (\w+)/);
            if (bufferMatch) {
                const bufferAddress = bufferMatch[1];
                console.log(`Closing failed buffer: ${bufferAddress}`);
                
                try {
                    await execAsync(`solana program close ${bufferAddress}`);
                    console.log('Buffer closed, recovered SOL');
                } catch (closeError) {
                    console.error('Failed to close buffer:', closeError.message);
                }
            }
            
            // Wait before retry
            if (i < maxRetries - 1) {
                console.log(`Waiting 5 seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
    
    return false;
}

async function main() {
    // Deploy absolute vault
    const absoluteVaultSuccess = await deployProgram(
        '/home/humiccoils/git/miko_token/target/deploy/absolute_vault.so',
        '/home/humiccoils/git/miko_token/target/deploy/absolute_vault_v2-keypair.json'
    );
    
    if (!absoluteVaultSuccess) {
        console.error('Failed to deploy Absolute Vault after all retries');
        process.exit(1);
    }
    
    // Deploy smart dial
    const smartDialSuccess = await deployProgram(
        '/home/humiccoils/git/miko_token/target/deploy/smart_dial.so',
        '/home/humiccoils/git/miko_token/target/deploy/smart_dial_v2-keypair.json'
    );
    
    if (!smartDialSuccess) {
        console.error('Failed to deploy Smart Dial after all retries');
        process.exit(1);
    }
    
    console.log('\n✅ Both programs deployed successfully!');
    console.log('Absolute Vault: 355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt');
    console.log('Smart Dial: EVyEZNWveJ8nwVBiFSK2QFLReQKdLocko2nEBXDuQiVg');
}

main().catch(console.error);