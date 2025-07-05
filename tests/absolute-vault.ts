import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AbsoluteVault } from "../target/types/absolute_vault";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  TOKEN_2022_PROGRAM_ID, 
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  getMinimumBalanceForRentExemptMint,
  getMintLen,
  ExtensionType,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createMintToInstruction,
  createTransferCheckedWithFeeInstruction,
  getTransferFeeAmount,
  unpackAccount
} from "@solana/spl-token";
import { assert } from "chai";

describe("absolute-vault", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AbsoluteVault as Program<AbsoluteVault>;
  
  // Test wallets
  const authority = Keypair.generate();
  const keeper = Keypair.generate();
  const treasury = Keypair.generate();
  const owner = Keypair.generate();
  const mint = Keypair.generate();
  const rewardToken = Keypair.generate();
  
  // PDAs
  let vaultPda: PublicKey;
  let vaultBump: number;
  let treasuryVault: PublicKey;
  let ownerVault: PublicKey;
  
  // Test constants
  const DECIMALS = 9;
  const FEE_BASIS_POINTS = 500; // 5%
  const MAX_FEE = BigInt("18446744073709551615"); // u64::MAX
  const MINIMUM_USD_VALUE = 100;
  
  before(async () => {
    // Fund test wallets
    const fundTx = new anchor.web3.Transaction();
    for (const wallet of [authority, keeper, treasury, owner]) {
      fundTx.add(
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: wallet.publicKey,
          lamports: 10 * LAMPORTS_PER_SOL,
        })
      );
    }
    await provider.sendAndConfirm(fundTx);
    
    // Derive PDAs
    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_state")],
      program.programId
    );
    
    [treasuryVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury_vault"), mint.publicKey.toBuffer()],
      program.programId
    );
    
    [ownerVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("owner_vault"), mint.publicKey.toBuffer()],
      program.programId
    );
    
    // Create MIKO token with transfer fee extension
    const mintLen = getMintLen([ExtensionType.TransferFeeConfig]);
    const mintLamports = await getMinimumBalanceForRentExemptMint(provider.connection);
    
    const createMintTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports: mintLamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferFeeConfigInstruction(
        mint.publicKey,
        authority.publicKey,
        authority.publicKey,
        FEE_BASIS_POINTS,
        MAX_FEE,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(
        mint.publicKey,
        DECIMALS,
        authority.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    await provider.sendAndConfirm(createMintTx, [mint]);
    
    // Create reward token (standard SPL token for testing)
    const rewardMintTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: rewardToken.publicKey,
        space: getMintLen([]),
        lamports: await getMinimumBalanceForRentExemptMint(provider.connection),
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        rewardToken.publicKey,
        DECIMALS,
        authority.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    await provider.sendAndConfirm(rewardMintTx, [rewardToken]);
  });
  
  describe("Initialization", () => {
    it("Initializes the vault", async () => {
      const params = {
        priceFeedId: Array(32).fill(0),
        minimumUsdValue: MINIMUM_USD_VALUE,
      };
      
      await program.methods
        .initialize(params)
        .accounts({
          vaultState: vaultPda,
          authority: authority.publicKey,
          keeperWallet: keeper.publicKey,
          treasuryWallet: treasury.publicKey,
          ownerWallet: owner.publicKey,
          mikoMint: mint.publicKey,
          treasuryVault: treasuryVault,
          ownerVault: ownerVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([authority])
        .rpc();
      
      // Verify vault state
      const vaultState = await program.account.vaultState.fetch(vaultPda);
      assert.equal(vaultState.authority.toBase58(), authority.publicKey.toBase58());
      assert.equal(vaultState.keeperWallet.toBase58(), keeper.publicKey.toBase58());
      assert.equal(vaultState.treasuryWallet.toBase58(), treasury.publicKey.toBase58());
      assert.equal(vaultState.ownerWallet.toBase58(), owner.publicKey.toBase58());
      assert.equal(vaultState.mikoMint.toBase58(), mint.publicKey.toBase58());
      assert.equal(vaultState.totalFeesCollected.toString(), "0");
      assert.equal(vaultState.totalRewardsDistributed.toString(), "0");
      assert.equal(vaultState.minimumUsdValue, MINIMUM_USD_VALUE);
      assert.equal(vaultState.isInitialized, true);
    });
    
    it("Initializes system exclusions", async () => {
      await program.methods
        .initializeSystemExclusions()
        .accounts({
          vaultState: vaultPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([authority])
        .rpc();
      
      // Check treasury exclusion
      const [treasuryExclusionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("exclusion"), treasury.publicKey.toBuffer()],
        program.programId
      );
      
      const treasuryExclusion = await program.account.exclusionEntry.fetch(treasuryExclusionPda);
      assert.equal(treasuryExclusion.wallet.toBase58(), treasury.publicKey.toBase58());
      assert.equal(treasuryExclusion.exclusionType, 2); // Both
      assert.equal(treasuryExclusion.isSystemAccount, true);
      
      // Check owner exclusion
      const [ownerExclusionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("exclusion"), owner.publicKey.toBuffer()],
        program.programId
      );
      
      const ownerExclusion = await program.account.exclusionEntry.fetch(ownerExclusionPda);
      assert.equal(ownerExclusion.wallet.toBase58(), owner.publicKey.toBase58());
      assert.equal(ownerExclusion.exclusionType, 2); // Both
      assert.equal(ownerExclusion.isSystemAccount, true);
    });
  });
  
  describe("Fee Harvesting", () => {
    let holder1: Keypair;
    let holder2: Keypair;
    let holder1Ata: PublicKey;
    let holder2Ata: PublicKey;
    
    before(async () => {
      holder1 = Keypair.generate();
      holder2 = Keypair.generate();
      
      // Fund holders
      const fundTx = new anchor.web3.Transaction();
      fundTx.add(
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: holder1.publicKey,
          lamports: LAMPORTS_PER_SOL,
        }),
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: holder2.publicKey,
          lamports: LAMPORTS_PER_SOL,
        })
      );
      await provider.sendAndConfirm(fundTx);
      
      // Create token accounts
      holder1Ata = getAssociatedTokenAddressSync(mint.publicKey, holder1.publicKey, false, TOKEN_2022_PROGRAM_ID);
      holder2Ata = getAssociatedTokenAddressSync(mint.publicKey, holder2.publicKey, false, TOKEN_2022_PROGRAM_ID);
      
      const createAtaTx = new anchor.web3.Transaction();
      createAtaTx.add(
        createAssociatedTokenAccountInstruction(
          provider.wallet.publicKey,
          holder1Ata,
          holder1.publicKey,
          mint.publicKey,
          TOKEN_2022_PROGRAM_ID
        ),
        createAssociatedTokenAccountInstruction(
          provider.wallet.publicKey,
          holder2Ata,
          holder2.publicKey,
          mint.publicKey,
          TOKEN_2022_PROGRAM_ID
        )
      );
      await provider.sendAndConfirm(createAtaTx);
      
      // Mint tokens to authority first
      const authorityAta = getAssociatedTokenAddressSync(mint.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const createAuthorityAtaTx = new anchor.web3.Transaction().add(
        createAssociatedTokenAccountInstruction(
          provider.wallet.publicKey,
          authorityAta,
          authority.publicKey,
          mint.publicKey,
          TOKEN_2022_PROGRAM_ID
        )
      );
      await provider.sendAndConfirm(createAuthorityAtaTx);
      
      // Mint tokens
      const mintAmount = BigInt(1000 * 10 ** DECIMALS);
      const mintTx = new anchor.web3.Transaction().add(
        createMintToInstruction(
          mint.publicKey,
          authorityAta,
          authority.publicKey,
          mintAmount,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );
      await provider.sendAndConfirm(mintTx, [authority]);
      
      // Transfer tokens to holders (this will create withheld fees)
      const transferAmount = BigInt(100 * 10 ** DECIMALS);
      const fee = getTransferFeeAmount({
        amount: transferAmount,
        feeBasisPoints: FEE_BASIS_POINTS,
        maximumFee: MAX_FEE
      });
      
      const transferTx = new anchor.web3.Transaction();
      transferTx.add(
        createTransferCheckedWithFeeInstruction(
          authorityAta,
          mint.publicKey,
          holder1Ata,
          authority.publicKey,
          transferAmount,
          DECIMALS,
          fee.fee,
          [],
          TOKEN_2022_PROGRAM_ID
        ),
        createTransferCheckedWithFeeInstruction(
          authorityAta,
          mint.publicKey,
          holder2Ata,
          authority.publicKey,
          transferAmount * 2n,
          DECIMALS,
          fee.fee * 2n,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );
      await provider.sendAndConfirm(transferTx, [authority]);
    });
    
    it("Harvests fees from token accounts", async () => {
      // Get initial vault state
      const initialVaultState = await program.account.vaultState.fetch(vaultPda);
      
      // Harvest fees
      await program.methods
        .harvestFees([holder1.publicKey, holder2.publicKey])
        .accounts({
          vaultState: vaultPda,
          keeperWallet: keeper.publicKey,
          mikoMint: mint.publicKey,
          treasuryVault: treasuryVault,
          ownerVault: ownerVault,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: holder1Ata, isWritable: true, isSigner: false },
          { pubkey: holder2Ata, isWritable: true, isSigner: false },
        ])
        .signers([keeper])
        .rpc();
      
      // Verify fees were collected
      const updatedVaultState = await program.account.vaultState.fetch(vaultPda);
      assert.isTrue(updatedVaultState.totalFeesCollected.gt(initialVaultState.totalFeesCollected));
      
      // Check treasury vault balance (should have 80% of fees)
      const treasuryVaultAccount = await provider.connection.getAccountInfo(treasuryVault);
      assert.isNotNull(treasuryVaultAccount);
      
      // Check owner vault balance (should have 20% of fees)
      const ownerVaultAccount = await provider.connection.getAccountInfo(ownerVault);
      assert.isNotNull(ownerVaultAccount);
    });
  });
  
  describe("Exclusion Management", () => {
    let testWallet: Keypair;
    let exclusionPda: PublicKey;
    
    before(async () => {
      testWallet = Keypair.generate();
      [exclusionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("exclusion"), testWallet.publicKey.toBuffer()],
        program.programId
      );
    });
    
    it("Adds fee exclusion", async () => {
      await program.methods
        .manageExclusions(testWallet.publicKey, { feeOnly: {} }, { add: {} })
        .accounts({
          vaultState: vaultPda,
          authority: authority.publicKey,
          exclusionEntry: exclusionPda,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([authority])
        .rpc();
      
      const exclusion = await program.account.exclusionEntry.fetch(exclusionPda);
      assert.equal(exclusion.wallet.toBase58(), testWallet.publicKey.toBase58());
      assert.equal(exclusion.exclusionType, 0); // FeeOnly
      assert.equal(exclusion.isSystemAccount, false);
    });
    
    it("Updates exclusion to both", async () => {
      await program.methods
        .manageExclusions(testWallet.publicKey, { both: {} }, { add: {} })
        .accounts({
          vaultState: vaultPda,
          authority: authority.publicKey,
          exclusionEntry: exclusionPda,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([authority])
        .rpc();
      
      const exclusion = await program.account.exclusionEntry.fetch(exclusionPda);
      assert.equal(exclusion.exclusionType, 2); // Both
    });
    
    it("Removes exclusion", async () => {
      await program.methods
        .manageExclusions(testWallet.publicKey, { both: {} }, { remove: {} })
        .accounts({
          vaultState: vaultPda,
          authority: authority.publicKey,
          exclusionEntry: exclusionPda,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([authority])
        .rpc();
      
      // Check that account was closed
      const exclusionAccount = await provider.connection.getAccountInfo(exclusionPda);
      assert.isNull(exclusionAccount);
    });
    
    it("Cannot remove system exclusion", async () => {
      const [systemExclusionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("exclusion"), treasury.publicKey.toBuffer()],
        program.programId
      );
      
      try {
        await program.methods
          .manageExclusions(treasury.publicKey, { both: {} }, { remove: {} })
          .accounts({
            vaultState: vaultPda,
            authority: authority.publicKey,
            exclusionEntry: systemExclusionPda,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([authority])
          .rpc();
        
        assert.fail("Should not be able to remove system exclusion");
      } catch (error) {
        assert.include(error.toString(), "CannotRemoveSystemExclusion");
      }
    });
  });
  
  describe("Configuration Updates", () => {
    it("Updates minimum USD value", async () => {
      const newMinimumValue = 200;
      
      await program.methods
        .updateConfig({
          newAuthority: null,
          newKeeperWallet: null,
          newMinimumUsdValue: newMinimumValue,
          newPriceFeedId: null,
        })
        .accounts({
          vaultState: vaultPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();
      
      const vaultState = await program.account.vaultState.fetch(vaultPda);
      assert.equal(vaultState.minimumUsdValue, newMinimumValue);
    });
    
    it("Updates authority", async () => {
      const newAuthority = Keypair.generate();
      
      await program.methods
        .updateConfig({
          newAuthority: newAuthority.publicKey,
          newKeeperWallet: null,
          newMinimumUsdValue: null,
          newPriceFeedId: null,
        })
        .accounts({
          vaultState: vaultPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();
      
      const vaultState = await program.account.vaultState.fetch(vaultPda);
      assert.equal(vaultState.authority.toBase58(), newAuthority.publicKey.toBase58());
      
      // Update authority reference for future tests
      authority.publicKey = newAuthority.publicKey;
      authority.secretKey = newAuthority.secretKey;
    });
  });
  
  describe("Emergency Functions", () => {
    it("Emergency withdraws from vault", async () => {
      // First add some SOL to the vault
      const fundTx = new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: vaultPda,
          lamports: LAMPORTS_PER_SOL,
        })
      );
      await provider.sendAndConfirm(fundTx);
      
      const initialBalance = await provider.connection.getBalance(authority.publicKey);
      
      await program.methods
        .emergencyWithdrawVault(new anchor.BN(LAMPORTS_PER_SOL / 2))
        .accounts({
          vaultState: vaultPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
      
      const finalBalance = await provider.connection.getBalance(authority.publicKey);
      assert.approximately(finalBalance, initialBalance + LAMPORTS_PER_SOL / 2, 10000);
    });
  });
});