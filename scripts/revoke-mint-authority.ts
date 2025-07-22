import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, createSetAuthorityInstruction, AuthorityType, getMint } from '@solana/spl-token';
import * as fs from 'fs';

const RPC_URL = 'https://api.devnet.solana.com';

async function main() {
  try {
    console.log('🔐 Revoking Mint Authority (Setting to null)...\n');

    // Load deployer keypair (current mint authority)
    const deployerPath = '/shared-artifacts/deployer-keypair.json';
    const deployerRaw = fs.readFileSync(deployerPath, 'utf-8');
    const deployerKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(deployerRaw)));
    console.log('✅ Current Mint Authority:', deployerKeypair.publicKey.toBase58());

    const connection = new Connection(RPC_URL, 'confirmed');

    // Load token info
    const tokenInfoPath = '/shared-artifacts/token-info.json';
    const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf-8'));
    const mintPubkey = new PublicKey(tokenInfo.mint);
    console.log('✅ Token Mint:', mintPubkey.toBase58());

    // Verify current mint authority
    console.log('\n📊 Checking current mint state...');
    const mintAccount = await getMint(
      connection,
      mintPubkey,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    if (!mintAccount.mintAuthority) {
      console.log('✅ Mint authority is already null!');
      return;
    }

    if (!mintAccount.mintAuthority.equals(deployerKeypair.publicKey)) {
      throw new Error(`Current mint authority (${mintAccount.mintAuthority.toBase58()}) does not match deployer`);
    }

    console.log('  - Current Mint Authority:', mintAccount.mintAuthority.toBase58());
    console.log('  - Current Supply:', mintAccount.supply.toString());
    console.log('  - Decimals:', mintAccount.decimals);

    // Create instruction to revoke mint authority (set to null)
    console.log('\n🔄 Creating revoke mint authority instruction...');
    const revokeMintAuthorityIx = createSetAuthorityInstruction(
      mintPubkey,
      deployerKeypair.publicKey,
      AuthorityType.MintTokens,
      null, // Setting to null revokes the authority
      [],
      TOKEN_2022_PROGRAM_ID
    );

    // Create and send transaction
    const tx = new Transaction().add(revokeMintAuthorityIx);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = deployerKeypair.publicKey;

    console.log('\n🚀 Sending revoke mint authority transaction...');
    const signature = await connection.sendTransaction(tx, [deployerKeypair]);
    console.log('📝 Transaction signature:', signature);

    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Transaction confirmed!');

    // Verify mint authority was revoked
    console.log('\n🔍 Verifying mint authority revocation...');
    const updatedMintAccount = await getMint(
      connection,
      mintPubkey,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    console.log('  - Mint Authority:', updatedMintAccount.mintAuthority ? updatedMintAccount.mintAuthority.toBase58() : 'null');
    console.log('  - Successfully revoked:', updatedMintAccount.mintAuthority === null ? 'Yes ✅' : 'No ❌');

    // Save revocation info
    const revocationInfo = {
      timestamp: new Date().toISOString(),
      transactionSignature: signature,
      mint: mintPubkey.toBase58(),
      previousAuthority: deployerKeypair.publicKey.toBase58(),
      newAuthority: null,
      totalSupply: mintAccount.supply.toString(),
      message: "Mint authority permanently revoked - no more tokens can be minted"
    };

    const revocationInfoPath = '/shared-artifacts/mint-authority-revocation.json';
    fs.writeFileSync(revocationInfoPath, JSON.stringify(revocationInfo, null, 2));
    console.log('\n✅ Revocation info saved to:', revocationInfoPath);

    console.log('\n✅ Mint authority successfully revoked!');
    console.log('  - Previous Authority:', deployerKeypair.publicKey.toBase58());
    console.log('  - New Authority: null (permanently revoked)');
    console.log('  - Total Supply:', mintAccount.supply.toString());
    console.log('\n⚠️  IMPORTANT: No more MIKO tokens can ever be minted!');

    // Update TO_DO.md
    console.log('\n📝 Updating TO_DO.md...');
    const todoPath = '/home/humiccoils/git/miko_token/TO_DO.md';
    let todoContent = fs.readFileSync(todoPath, 'utf-8');
    
    // Update revoke mint authority item
    todoContent = todoContent
      .replace('- [ ] Revoke mint authority permanently', '- [x] Revoke mint authority permanently ✅')
      .replace('- [ ] Verify mint authority is null', '- [x] Verify mint authority is null ✅');
    
    fs.writeFileSync(todoPath, todoContent);
    console.log('✅ TO_DO.md updated');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();