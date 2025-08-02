import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getTransferFeeAmount,
  unpackAccount
} from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { getConfigManager } from './config-manager';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Withdraw withheld fees from deployment pool vault using emergency_withdraw_withheld
 */
async function withdrawPoolFees() {
  console.log('=== Withdraw Pool Fees from Deployment Pool ===\n');
  
  const configManager = getConfigManager();
  const connection = configManager.getConnection();
  const network = configManager.getNetwork();
  
  console.log(`Network: ${network.toUpperCase()}`);
  console.log(`RPC: ${configManager.getRpcUrl()}\n`);
  
  // Load deployer (admin) keypair
  const deployer = configManager.loadKeypair('deployer');
  const tokenMint = configManager.getTokenMint();
  const vaultProgramId = configManager.getVaultProgramId();
  const vaultPda = configManager.getVaultPda();
  
  console.log('Admin:', deployer.publicKey.toBase58());
  console.log('Token Mint:', tokenMint.toBase58());
  console.log('Vault PDA:', vaultPda.toBase58());
  
  // Get deployment pool info
  const deploymentState = configManager.getDeploymentState();
  if (!deploymentState.pool_id) {
    throw new Error('No deployment pool found in state!');
  }
  
  const poolId = new PublicKey(deploymentState.pool_id);
  console.log('Pool ID:', poolId.toBase58());
  
  // Get pool vault addresses from deployment state
  if (!deploymentState.pool_info || !deploymentState.pool_info.vaultA || !deploymentState.pool_info.vaultB) {
    throw new Error('Vault addresses not found in deployment state!');
  }
  
  const vaultA = new PublicKey(deploymentState.pool_info.vaultA);
  const vaultB = new PublicKey(deploymentState.pool_info.vaultB);
  
  console.log('\nChecking pool vaults...');
  console.log('Vault A:', vaultA.toBase58());
  console.log('Vault B:', vaultB.toBase58());
  
  // Find MIKO vault
  let mikoVault: PublicKey | null = null;
  let withheldAmount = BigInt(0);
  
  // Check vaultA
  try {
    // Get raw account info
    const vaultAInfo = await connection.getAccountInfo(vaultA);
    if (vaultAInfo && vaultAInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      // Unpack the account to access extensions
      const unpackedAccount = unpackAccount(vaultA, vaultAInfo, TOKEN_2022_PROGRAM_ID);
      
      if (unpackedAccount.mint.equals(tokenMint)) {
        mikoVault = vaultA;
        
        // Get transfer fee amount using the proper helper function
        const transferFeeAmount = getTransferFeeAmount(unpackedAccount);
        if (transferFeeAmount) {
          withheldAmount = transferFeeAmount.withheldAmount;
          console.log('VaultA withheld amount:', Number(withheldAmount) / 1e9, 'MIKO');
        }
      }
    }
  } catch (e) {
    console.log('Error checking vaultA:', e);
  }
  
  // Check vaultB if needed
  if (!mikoVault) {
    try {
      // Get raw account info
      const vaultBInfo = await connection.getAccountInfo(vaultB);
      if (vaultBInfo && vaultBInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
        // Unpack the account to access extensions
        const unpackedAccount = unpackAccount(vaultB, vaultBInfo, TOKEN_2022_PROGRAM_ID);
        
        if (unpackedAccount.mint.equals(tokenMint)) {
          mikoVault = vaultB;
          
          // Get transfer fee amount using the proper helper function
          const transferFeeAmount = getTransferFeeAmount(unpackedAccount);
          if (transferFeeAmount) {
            withheldAmount = transferFeeAmount.withheldAmount;
            console.log('VaultB withheld amount:', Number(withheldAmount) / 1e9, 'MIKO');
          }
        }
      }
    } catch (e) {
      console.log('Error checking vaultB:', e);
    }
  }
  
  if (!mikoVault) {
    throw new Error('MIKO vault not found in pool!');
  }
  
  console.log('\nMIKO Vault:', mikoVault.toBase58());
  console.log('Withheld Fees:', Number(withheldAmount) / 1e9, 'MIKO');
  
  if (withheldAmount === BigInt(0)) {
    console.log('\n✅ No withheld fees to withdraw');
    return;
  }
  
  // Initialize Anchor
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(deployer),
    { commitment: configManager.getCommitment() }
  );
  
  // Load IDL from local file
  const idlPath = path.join(__dirname, '..', 'idl', 'absolute_vault.json');
  const idlString = fs.readFileSync(idlPath, 'utf8');
  const idl = JSON.parse(idlString);
  
  const program = new anchor.Program(idl, provider);
  
  // Get or create deployer's MIKO ATA
  const deployerAta = await getAssociatedTokenAddress(
    tokenMint,
    deployer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  
  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    })
  );
  
  const priorityFee = configManager.getPriorityFee();
  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFee.microLamports,
    })
  );
  
  // Check if ATA exists
  const ataInfo = await connection.getAccountInfo(deployerAta);
  if (!ataInfo) {
    console.log('Creating deployer ATA...');
    tx.add(
      createAssociatedTokenAccountInstruction(
        deployer.publicKey,
        deployerAta,
        deployer.publicKey,
        tokenMint,
        TOKEN_2022_PROGRAM_ID
      )
    );
  }
  
  // Step 1: Harvest fees from pool vault to mint (permissionless)
  console.log('\n1. Harvesting fees from pool vault to mint...');
  
  const harvestIx = new TransactionInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    keys: [
      { pubkey: tokenMint, isSigner: false, isWritable: true },
      { pubkey: mikoVault, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([26, 4]) // [TokenInstruction.TransferFeeExtension, TransferFeeInstruction.HarvestWithheldTokensToMint]
  });
  
  tx.add(harvestIx);
  
  // Send harvest transaction (anyone can do this)
  const harvestSig = await sendAndConfirmTransaction(
    connection,
    tx,
    [deployer],
    { commitment: 'confirmed' }
  );
  
  console.log('✅ Harvested to mint! Signature:', harvestSig);
  
  // Step 2: Withdraw from mint to deployer
  console.log('\n2. Withdrawing fees from mint...');
  
  // Load keeper keypair (needed for withdraw_fees_from_mint)
  const keeperPath = path.join(__dirname, '../keypairs/keeper-keypair.json');
  const keeperData = JSON.parse(fs.readFileSync(keeperPath, 'utf8'));
  const keeper = Keypair.fromSecretKey(Uint8Array.from(keeperData));
  
  // Get vault's token account
  const vaultAta = await getAssociatedTokenAddress(
    tokenMint,
    vaultPda,
    true,
    TOKEN_2022_PROGRAM_ID
  );
  
  // Create new transaction for withdraw
  const withdrawTx = new Transaction();
  withdrawTx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
  );
  withdrawTx.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee.microLamports })
  );
  
  // First withdraw to vault
  const vaultWithdrawIx = await program.methods
    .withdrawFeesFromMint()
    .accounts({
      vault: vaultPda,
      keeperAuthority: keeper.publicKey,
      tokenMint: tokenMint,
      vaultTokenAccount: vaultAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
  
  withdrawTx.add(vaultWithdrawIx);
  
  // Then transfer from vault to deployer
  const transferIx = await program.methods
    .emergencyWithdrawVault(new BN(withheldAmount.toString()))
    .accounts({
      vault: vaultPda,
      authority: deployer.publicKey,
      vaultTokenAccount: vaultAta,
      destinationTokenAccount: deployerAta,
      tokenMint: tokenMint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
  
  withdrawTx.add(transferIx);
  
  const sig = await sendAndConfirmTransaction(
    connection,
    withdrawTx,
    [keeper, deployer],
    { commitment: 'confirmed' }
  );
  
  console.log('\n✅ Withheld fees withdrawn!');
  console.log('Signature:', sig);
  console.log('Amount:', Number(withheldAmount) / 1e9, 'MIKO');
  console.log('Recipient:', deployerAta.toBase58());
  
  // Verify the withdrawal
  const finalVaultInfo = await connection.getAccountInfo(mikoVault);
  let finalWithheld = BigInt(0);
  
  if (finalVaultInfo) {
    const finalUnpackedAccount = unpackAccount(mikoVault, finalVaultInfo, TOKEN_2022_PROGRAM_ID);
    const finalTransferFeeAmount = getTransferFeeAmount(finalUnpackedAccount);
    if (finalTransferFeeAmount) {
      finalWithheld = finalTransferFeeAmount.withheldAmount;
    }
  }
  
  console.log('\nVerification:');
  console.log('Final withheld in vault:', Number(finalWithheld) / 1e9, 'MIKO');
  
  const deployerBalance = await getAccount(
    connection,
    deployerAta,
    'confirmed',
    TOKEN_2022_PROGRAM_ID
  );
  console.log('Deployer balance:', Number(deployerBalance.amount) / 1e9, 'MIKO');
}

// Run if called directly
if (require.main === module) {
  withdrawPoolFees()
    .then(() => {
      console.log('\n✅ Success!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Error:', err);
      process.exit(1);
    });
}

export { withdrawPoolFees };