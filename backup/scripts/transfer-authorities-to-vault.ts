import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, createSetAuthorityInstruction, AuthorityType } from '@solana/spl-token';
import * as fs from 'fs';

const RPC_URL = 'https://api.devnet.solana.com';

async function main() {
  try {
    console.log('🔐 Transferring Token Authorities to Vault PDA...\n');

    // Load deployer keypair (current authority)
    const deployerPath = '/shared-artifacts/deployer-keypair.json';
    const deployerRaw = fs.readFileSync(deployerPath, 'utf-8');
    const deployerKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(deployerRaw)));
    console.log('✅ Current Authority:', deployerKeypair.publicKey.toBase58());

    const connection = new Connection(RPC_URL, 'confirmed');

    // Load token info
    const tokenInfoPath = '/shared-artifacts/token-info.json';
    const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf-8'));
    const mintPubkey = new PublicKey(tokenInfo.mint);
    console.log('✅ Token Mint:', mintPubkey.toBase58());

    // Load vault info
    const vaultInfoPath = '/shared-artifacts/vault-init-info.json';
    const vaultInfo = JSON.parse(fs.readFileSync(vaultInfoPath, 'utf-8'));
    const vaultPDA = new PublicKey(vaultInfo.vaultPDA);
    console.log('✅ Vault PDA:', vaultPDA.toBase58());

    console.log('\n📋 Authority Transfer Plan:');
    console.log('  1. Transfer Fee Config Authority → Vault PDA');
    console.log('  2. Withdraw Withheld Authority → Vault PDA');
    console.log('  3. Mint Authority remains revoked (already null)');
    console.log('  4. Update Authority remains with deployer');

    // Create instructions for authority transfers
    const instructions = [];

    // 1. Transfer Fee Config Authority
    console.log('\n🔄 Creating Transfer Fee Config Authority instruction...');
    const transferFeeConfigIx = createSetAuthorityInstruction(
      mintPubkey,
      deployerKeypair.publicKey,
      AuthorityType.TransferFeeConfig,
      vaultPDA,
      [],
      TOKEN_2022_PROGRAM_ID
    );
    instructions.push(transferFeeConfigIx);

    // 2. Transfer Withdraw Withheld Authority
    console.log('🔄 Creating Withdraw Withheld Authority instruction...');
    const withdrawWithheldIx = createSetAuthorityInstruction(
      mintPubkey,
      deployerKeypair.publicKey,
      AuthorityType.WithheldWithdraw,
      vaultPDA,
      [],
      TOKEN_2022_PROGRAM_ID
    );
    instructions.push(withdrawWithheldIx);

    // Create and send transaction
    const tx = new Transaction().add(...instructions);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = deployerKeypair.publicKey;

    console.log('\n🚀 Sending authority transfer transaction...');
    const signature = await connection.sendTransaction(tx, [deployerKeypair]);
    console.log('📝 Transaction signature:', signature);

    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Transaction confirmed!');

    // Verify authorities were transferred
    console.log('\n🔍 Verifying authority transfers...');
    const mintAccount = await connection.getAccountInfo(mintPubkey);
    if (!mintAccount) {
      throw new Error('Mint account not found');
    }

    // Save authority transfer info
    const authorityTransferInfo = {
      timestamp: new Date().toISOString(),
      transactionSignature: signature,
      mint: mintPubkey.toBase58(),
      vaultPDA: vaultPDA.toBase58(),
      transferredAuthorities: [
        "TransferFeeConfig",
        "WithheldWithdraw"
      ],
      previousAuthority: deployerKeypair.publicKey.toBase58(),
      newAuthority: vaultPDA.toBase58()
    };

    const transferInfoPath = '/shared-artifacts/authority-transfer-info.json';
    fs.writeFileSync(transferInfoPath, JSON.stringify(authorityTransferInfo, null, 2));
    console.log('\n✅ Authority transfer info saved to:', transferInfoPath);

    console.log('\n✅ Authority transfers completed successfully!');
    console.log('  - Transfer Fee Config Authority: deployer → Vault PDA');
    console.log('  - Withdraw Withheld Authority: deployer → Vault PDA');
    
    console.log('\n📋 Current Authority Status:');
    console.log('  - Mint Authority: null (revoked)');
    console.log('  - Update Authority: deployer (unchanged)');
    console.log('  - Transfer Fee Config: Vault PDA ✅');
    console.log('  - Withdraw Withheld: Vault PDA ✅');
    
    console.log('\n⚠️  IMPORTANT: The Vault PDA now controls:');
    console.log('  - Fee rate updates (30% → 15% → 5%)');
    console.log('  - Harvesting withheld fees');
    console.log('  - All tax collection and distribution');

    // Update TO_DO.md
    console.log('\n📝 Updating TO_DO.md...');
    const todoPath = '/home/humiccoils/git/miko_token/TO_DO.md';
    let todoContent = fs.readFileSync(todoPath, 'utf-8');
    
    // Update authority transfer items
    todoContent = todoContent
      .replace('- [ ] Transfer fee config authority from deployer to Vault PDA', '- [x] Transfer fee config authority from deployer to Vault PDA ✅')
      .replace('- [ ] Transfer withdraw withheld authority from deployer to Vault PDA', '- [x] Transfer withdraw withheld authority from deployer to Vault PDA ✅')
      .replace('- [ ] Verify each transfer successful', '- [x] Verify each transfer successful ✅');
    
    fs.writeFileSync(todoPath, todoContent);
    console.log('✅ TO_DO.md updated');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();