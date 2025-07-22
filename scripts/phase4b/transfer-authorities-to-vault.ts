import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID, 
  setAuthority, 
  AuthorityType,
  getMint
} from '@solana/spl-token';
import * as fs from 'fs';

const FORK_URL = 'http://127.0.0.1:8899';

// Load configurations
const config = JSON.parse(fs.readFileSync('phase4b-config.json', 'utf-8'));
const initInfo = JSON.parse(fs.readFileSync('phase4b-init-info.json', 'utf-8'));

async function transferAuthoritiesToVault() {
  const connection = new Connection(FORK_URL, 'confirmed');
  
  // Load deployer
  const deployerData = JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8'));
  const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));
  
  const mintPubkey = new PublicKey(config.mikoToken);
  const vaultPda = new PublicKey(initInfo.vault.pda);
  
  console.log('Transferring token authorities to Vault PDA...');
  console.log('MIKO Token:', mintPubkey.toBase58());
  console.log('Current Authority:', deployer.publicKey.toBase58());
  console.log('Vault PDA:', vaultPda.toBase58());
  
  // Get current mint info
  const mintInfo = await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
  
  console.log('\nCurrent Token Authorities:');
  console.log('- Mint Authority:', mintInfo.mintAuthority?.toBase58() || 'null');
  console.log('- Freeze Authority:', mintInfo.freezeAuthority?.toBase58() || 'null');
  
  // Transfer authorities (Phase 3 transferred Transfer Fee Config and Withdraw Withheld)
  try {
    // 1. Transfer Transfer Fee Config Authority
    console.log('\nTransferring Transfer Fee Config Authority...');
    const transferFeeConfigSig = await setAuthority(
      connection,
      deployer,
      mintPubkey,
      deployer,
      AuthorityType.TransferFeeConfig,
      vaultPda,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log('✓ Transfer Fee Config Authority transferred! Tx:', transferFeeConfigSig);
    
    // 2. Transfer Withdraw Withheld Authority
    console.log('\nTransferring Withdraw Withheld Authority...');
    const withdrawWithheldSig = await setAuthority(
      connection,
      deployer,
      mintPubkey,
      deployer,
      AuthorityType.WithheldWithdraw,
      vaultPda,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log('✓ Withdraw Withheld Authority transferred! Tx:', withdrawWithheldSig);
    
    // Save authority transfer info
    const transferInfo = {
      timestamp: new Date().toISOString(),
      token: mintPubkey.toBase58(),
      vaultPda: vaultPda.toBase58(),
      transfers: {
        transferFeeConfig: {
          from: deployer.publicKey.toBase58(),
          to: vaultPda.toBase58(),
          signature: transferFeeConfigSig,
        },
        withdrawWithheld: {
          from: deployer.publicKey.toBase58(),
          to: vaultPda.toBase58(),
          signature: withdrawWithheldSig,
        },
      },
    };
    
    fs.writeFileSync('phase4b-authority-transfer-info.json', JSON.stringify(transferInfo, null, 2));
    console.log('\nAuthority transfer info saved to phase4b-authority-transfer-info.json');
    
  } catch (error) {
    console.error('Failed to transfer authorities:', error);
  }
}

transferAuthoritiesToVault().catch(console.error);