import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
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
    
    // Extract program ID and signature from output
    const vaultIdMatch = vaultOut.match(/Program Id: ([A-Za-z0-9]+)/);
    const vaultSigMatch = vaultOut.match(/Signature: ([A-Za-z0-9]+)/);
    
    if (vaultIdMatch && vaultSigMatch) {
      configManager.updateDeploymentState({
        vault_program_id: vaultIdMatch[1],
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
    
    // Extract program ID and signature from output
    const dialIdMatch = dialOut.match(/Program Id: ([A-Za-z0-9]+)/);
    const dialSigMatch = dialOut.match(/Signature: ([A-Za-z0-9]+)/);
    
    if (dialIdMatch && dialSigMatch) {
      configManager.updateDeploymentState({
        smart_dial_program_id: dialIdMatch[1],
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
  
  // Update or create IDL files with deployed addresses
  console.log('\n3. Updating IDL files with deployed addresses...');
  try {
    const idlDir = path.join(__dirname, '../idl');
    if (!fs.existsSync(idlDir)) {
      fs.mkdirSync(idlDir, { recursive: true });
    }
    
    // Update Vault IDL
    const vaultIdlPath = path.join(idlDir, 'absolute_vault.json');
    const vaultTargetIdlPath = path.join(__dirname, '../target/idl/absolute_vault.json');
    let vaultIdl;
    
    if (fs.existsSync(vaultIdlPath)) {
      // Update existing IDL
      vaultIdl = JSON.parse(fs.readFileSync(vaultIdlPath, 'utf8'));
      console.log('Updating existing Vault IDL address...');
    } else if (fs.existsSync(vaultTargetIdlPath)) {
      // Copy from target
      vaultIdl = JSON.parse(fs.readFileSync(vaultTargetIdlPath, 'utf8'));
      console.log('Creating Vault IDL from target...');
    } else {
      console.warn('⚠️  Vault IDL not found in target/idl/');
      vaultIdl = null;
    }
    
    if (vaultIdl) {
      vaultIdl.address = configManager.getVaultProgramId().toBase58();
      fs.writeFileSync(vaultIdlPath, JSON.stringify(vaultIdl, null, 2));
      console.log('✅ Vault IDL saved with address:', vaultIdl.address);
    }
    
    // Update Smart Dial IDL
    const dialIdlPath = path.join(idlDir, 'smart_dial.json');
    const dialTargetIdlPath = path.join(__dirname, '../target/idl/smart_dial.json');
    let dialIdl;
    
    if (fs.existsSync(dialIdlPath)) {
      // Update existing IDL
      dialIdl = JSON.parse(fs.readFileSync(dialIdlPath, 'utf8'));
      console.log('Updating existing Smart Dial IDL address...');
    } else if (fs.existsSync(dialTargetIdlPath)) {
      // Copy from target
      dialIdl = JSON.parse(fs.readFileSync(dialTargetIdlPath, 'utf8'));
      console.log('Creating Smart Dial IDL from target...');
    } else {
      console.warn('⚠️  Smart Dial IDL not found in target/idl/');
      dialIdl = null;
    }
    
    if (dialIdl) {
      dialIdl.address = configManager.getSmartDialProgramId().toBase58();
      fs.writeFileSync(dialIdlPath, JSON.stringify(dialIdl, null, 2));
      console.log('✅ Smart Dial IDL saved with address:', dialIdl.address);
    }
    
  } catch (error: any) {
    console.warn('⚠️  IDL update failed:', error.message);
    console.log('You can manually update IDL addresses later');
  }
  
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