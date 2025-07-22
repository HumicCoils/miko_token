import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getMint, getTransferFeeConfig } from '@solana/spl-token';
import * as fs from 'fs';

const RPC_URL = 'https://api.devnet.solana.com';

async function main() {
  try {
    console.log('🔍 VC:3.AUTH_SYNC - Verifying Authority Synchronization...\n');
    console.log('Using standard SPL Token library - same as wallets/DEXs\n');

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

    // Get mint account using standard SPL Token function with TOKEN_2022_PROGRAM_ID
    console.log('\n📊 Fetching mint account using getMint() with TOKEN_2022_PROGRAM_ID...');
    const mintAccount = await getMint(
      connection,
      mintPubkey,
      undefined, // commitment
      TOKEN_2022_PROGRAM_ID
    );

    console.log('\n📋 Base Mint Authorities:');
    console.log('  - Mint Authority:', mintAccount.mintAuthority ? mintAccount.mintAuthority.toBase58() : 'null');
    console.log('  - Freeze Authority:', mintAccount.freezeAuthority ? mintAccount.freezeAuthority.toBase58() : 'null');

    // Get transfer fee config from the mint account
    console.log('\n📊 Getting transfer fee config...');
    const transferFeeConfig = getTransferFeeConfig(mintAccount);
    
    if (!transferFeeConfig) {
      throw new Error('Transfer fee config not found on mint - mint does not have transfer fee extension');
    }

    console.log('\n📋 Transfer Fee Extension Authorities:');
    console.log('  - Transfer Fee Config Authority:', transferFeeConfig.transferFeeConfigAuthority ? transferFeeConfig.transferFeeConfigAuthority.toBase58() : 'null');
    console.log('  - Withdraw Withheld Authority:', transferFeeConfig.withdrawWithheldAuthority ? transferFeeConfig.withdrawWithheldAuthority.toBase58() : 'null');
    console.log('  - Withheld Amount:', transferFeeConfig.withheldAmount.toString());

    // Perform verification
    console.log('\n🔍 Verification Results:');
    const mintAuthorityCorrect = mintAccount.mintAuthority === null;
    const freezeAuthorityCorrect = mintAccount.freezeAuthority === null;
    const transferFeeConfigCorrect = transferFeeConfig.transferFeeConfigAuthority !== null && 
                                    transferFeeConfig.transferFeeConfigAuthority.equals(vaultPDA);
    const withdrawWithheldCorrect = transferFeeConfig.withdrawWithheldAuthority !== null && 
                                   transferFeeConfig.withdrawWithheldAuthority.equals(vaultPDA);

    console.log('  - Mint Authority is null:', mintAuthorityCorrect ? 'Yes ✅' : 'No ❌');
    console.log('  - Freeze Authority is null:', freezeAuthorityCorrect ? 'Yes ✅' : 'No ❌');
    console.log('  - Transfer Fee Config = Vault PDA:', transferFeeConfigCorrect ? 'Yes ✅' : 'No ❌');
    console.log('  - Withdraw Withheld = Vault PDA:', withdrawWithheldCorrect ? 'Yes ✅' : 'No ❌');

    const allAuthoritiesCorrect = mintAuthorityCorrect && freezeAuthorityCorrect && 
                                  transferFeeConfigCorrect && withdrawWithheldCorrect;

    console.log('\n📊 Summary:');
    console.log('  All authorities correctly configured:', allAuthoritiesCorrect ? 'Yes ✅' : 'No ❌');

    // Save verification result
    const verificationResult = {
      vcName: "VC:3.AUTH_SYNC",
      timestamp: new Date().toISOString(),
      mint: mintPubkey.toBase58(),
      vaultPDA: vaultPDA.toBase58(),
      authorities: {
        mintAuthority: mintAccount.mintAuthority ? mintAccount.mintAuthority.toBase58() : null,
        freezeAuthority: mintAccount.freezeAuthority ? mintAccount.freezeAuthority.toBase58() : null,
        transferFeeConfigAuthority: transferFeeConfig.transferFeeConfigAuthority ? transferFeeConfig.transferFeeConfigAuthority.toBase58() : null,
        withdrawWithheldAuthority: transferFeeConfig.withdrawWithheldAuthority ? transferFeeConfig.withdrawWithheldAuthority.toBase58() : null
      },
      transferFeeConfig: {
        transferFeeBasisPoints: transferFeeConfig.newerTransferFee.transferFeeBasisPoints,
        maximumFee: transferFeeConfig.newerTransferFee.maximumFee.toString(),
        withheldAmount: transferFeeConfig.withheldAmount.toString()
      },
      verification: {
        mintAuthorityNull: mintAuthorityCorrect,
        freezeAuthorityNull: freezeAuthorityCorrect,
        transferFeeConfigIsVaultPDA: transferFeeConfigCorrect,
        withdrawWithheldIsVaultPDA: withdrawWithheldCorrect
      },
      passed: allAuthoritiesCorrect
    };

    const verificationPath = '/shared-artifacts/verification/vc3-auth-sync.json';
    fs.mkdirSync('/shared-artifacts/verification', { recursive: true });
    fs.writeFileSync(verificationPath, JSON.stringify(verificationResult, null, 2));
    
    console.log('\n✅ Verification result saved to:', verificationPath);
    
    if (allAuthoritiesCorrect) {
      console.log('\n✅ VC:3.AUTH_SYNC PASSED!');
      console.log('All token authorities are correctly synchronized with Vault PDA.');
      console.log('Token will work properly with all wallets and DEXs.');
    } else {
      console.log('\n❌ VC:3.AUTH_SYNC FAILED!');
      console.log('Some authorities are not correctly set. Please check the details above.');
      console.log('Token may not work properly with wallets and DEXs.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    
    // Save failed verification
    const failedResult = {
      vcName: "VC:3.AUTH_SYNC",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      passed: false
    };
    
    const verificationPath = '/shared-artifacts/verification/vc3-auth-sync.json';
    fs.mkdirSync('/shared-artifacts/verification', { recursive: true });
    fs.writeFileSync(verificationPath, JSON.stringify(failedResult, null, 2));
    
    process.exit(1);
  }
}

main();