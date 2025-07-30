import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { getConfigManager } from './config-manager';

const execAsync = promisify(exec);

/**
 * Deploy Anchor programs to the network
 */
async function deployPrograms() {
  console.log('=== Deploy Programs ===\n');
  
  const configManager = getConfigManager();
  const network = configManager.getNetwork();
  const rpcUrl = configManager.getRpcUrl();
  
  console.log(`Network: ${network.toUpperCase()}`);
  console.log(`RPC: ${rpcUrl}\n`);
  
  // Load keypairs
  const deployerPath = path.join(__dirname, '..', 'keypairs', 'deployer-keypair.json');
  const vaultProgramPath = path.join(__dirname, '..', 'keypairs', 'vault-program-keypair.json');
  const smartDialProgramPath = path.join(__dirname, '..', 'keypairs', 'smart-dial-program-keypair.json');
  
  // Deploy Vault Program
  console.log('1. Deploying Vault Program...');
  try {
    const vaultDeployCmd = `anchor deploy \
      --program-name absolute_vault \
      --program-keypair ${vaultProgramPath} \
      --provider.cluster ${network} \
      --provider.wallet ${deployerPath}`;
    
    console.log('Command:', vaultDeployCmd);
    const { stdout: vaultOut } = await execAsync(vaultDeployCmd, {
      cwd: path.join(__dirname, '..')
    });
    
    console.log(vaultOut);
    console.log('✅ Vault program deployed!\n');
    
    // Extract signature from output
    const vaultSigMatch = vaultOut.match(/Program Id: ([A-Za-z0-9]+)/);
    if (vaultSigMatch) {
      configManager.updateDeploymentState({
        vault_deployment_signature: vaultSigMatch[1]
      });
    }
  } catch (error: any) {
    console.error('❌ Failed to deploy vault program:', error.message);
    throw error;
  }
  
  // Deploy Smart Dial Program
  console.log('2. Deploying Smart Dial Program...');
  try {
    const dialDeployCmd = `anchor deploy \
      --program-name smart_dial \
      --program-keypair ${smartDialProgramPath} \
      --provider.cluster ${network} \
      --provider.wallet ${deployerPath}`;
    
    console.log('Command:', dialDeployCmd);
    const { stdout: dialOut } = await execAsync(dialDeployCmd, {
      cwd: path.join(__dirname, '..')
    });
    
    console.log(dialOut);
    console.log('✅ Smart Dial program deployed!\n');
    
    // Extract signature from output
    const dialSigMatch = dialOut.match(/Program Id: ([A-Za-z0-9]+)/);
    if (dialSigMatch) {
      configManager.updateDeploymentState({
        smart_dial_deployment_signature: dialSigMatch[1]
      });
    }
  } catch (error: any) {
    console.error('❌ Failed to deploy smart dial program:', error.message);
    throw error;
  }
  
  console.log('✅ All programs deployed successfully!');
  console.log('\n📋 Deployed Programs:');
  console.log('- Vault Program:', configManager.getVaultProgramId().toBase58());
  console.log('- Smart Dial Program:', configManager.getSmartDialProgramId().toBase58());
  
  console.log('\nNext steps:');
  console.log('1. Initialize Vault program (npm run initialize-vault)');
  console.log('2. Initialize Smart Dial program (npm run initialize-smart-dial)');
  
  return {
    vaultProgramId: configManager.getVaultProgramId(),
    smartDialProgramId: configManager.getSmartDialProgramId()
  };
}

// Run if called directly
if (require.main === module) {
  deployPrograms()
    .then(() => {
      console.log('\n✅ Success!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Error:', err);
      process.exit(1);
    });
}