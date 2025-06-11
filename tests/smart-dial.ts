import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SmartDial } from "../target/types/smart_dial";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("Smart Dial", () => {
    // Configure the client to use the local cluster
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.SmartDial as Program<SmartDial>;
    
    // Test accounts
    let admin: Keypair;
    let keeperBot: Keypair;
    let treasuryWallet: Keypair;
    let ownerWallet: Keypair;
    let unauthorizedUser: Keypair;
    let config: PublicKey;
    
    const AI_AGENT_TWITTER_ID = "1807336107638001665";
    
    before(async () => {
        admin = Keypair.generate();
        keeperBot = Keypair.generate();
        treasuryWallet = Keypair.generate();
        ownerWallet = Keypair.generate();
        unauthorizedUser = Keypair.generate();
        
        // Airdrop SOL to test accounts
        await provider.connection.requestAirdrop(admin.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.requestAirdrop(keeperBot.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.requestAirdrop(unauthorizedUser.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
        
        // Wait for airdrops to confirm
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Derive config PDA
        [config] = PublicKey.findProgramAddressSync(
            [Buffer.from("smart_dial_config")],
            program.programId
        );
    });
    
    it("Should initialize with correct configuration", async () => {
        const tx = await program.methods
            .initialize(
                keeperBot.publicKey,
                treasuryWallet.publicKey,
                ownerWallet.publicKey,
                AI_AGENT_TWITTER_ID
            )
            .accounts({
                admin: admin.publicKey,
                config,
                systemProgram: SystemProgram.programId,
            })
            .signers([admin])
            .rpc();
            
        console.log("Initialize transaction:", tx);
        
        // Fetch and verify config
        const configAccount = await program.account.smartDialConfig.fetch(config);
        
        assert.ok(configAccount.initialized);
        assert.equal(configAccount.keeperBotPubkey.toBase58(), keeperBot.publicKey.toBase58());
        assert.equal(configAccount.treasuryWallet.toBase58(), treasuryWallet.publicKey.toBase58());
        assert.equal(configAccount.ownerWallet.toBase58(), ownerWallet.publicKey.toBase58());
        assert.equal(configAccount.aiAgentTwitterId, AI_AGENT_TWITTER_ID);
        assert.equal(configAccount.admin.toBase58(), admin.publicKey.toBase58());
        assert.equal(configAccount.currentRewardTokenMint.toBase58(), PublicKey.default.toBase58());
    });
    
    it("Should only allow keeper bot to update reward token", async () => {
        const newRewardToken = Keypair.generate().publicKey;
        
        // Test with keeper bot (should succeed)
        const tx = await program.methods
            .updateRewardTokenMint(newRewardToken)
            .accounts({
                signer: keeperBot.publicKey,
                config,
            })
            .signers([keeperBot])
            .rpc();
            
        console.log("Update reward token transaction:", tx);
        
        // Verify update
        let configAccount = await program.account.smartDialConfig.fetch(config);
        assert.equal(configAccount.currentRewardTokenMint.toBase58(), newRewardToken.toBase58());
        
        // Test with unauthorized user (should fail)
        const newRewardToken2 = Keypair.generate().publicKey;
        
        try {
            await program.methods
                .updateRewardTokenMint(newRewardToken2)
                .accounts({
                    signer: unauthorizedUser.publicKey,
                    config,
                })
                .signers([unauthorizedUser])
                .rpc();
                
            assert.fail("Should have thrown UnauthorizedAccess error");
        } catch (error) {
            assert.ok(error.toString().includes("UnauthorizedAccess"));
        }
    });
    
    it("Should emit events on updates", async () => {
        const newRewardToken = Keypair.generate().publicKey;
        
        // Set up event listener
        let eventEmitted = false;
        const listener = program.addEventListener("rewardTokenUpdated", (event) => {
            eventEmitted = true;
            assert.ok(event.oldMint);
            assert.equal(event.newMint.toBase58(), newRewardToken.toBase58());
            assert.ok(event.timestamp.toNumber() > 0);
        });
        
        // Update reward token
        await program.methods
            .updateRewardTokenMint(newRewardToken)
            .accounts({
                signer: keeperBot.publicKey,
                config,
            })
            .signers([keeperBot])
            .rpc();
            
        // Wait a bit for event to be processed
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Remove listener
        await program.removeEventListener(listener);
        
        assert.ok(eventEmitted, "RewardTokenUpdated event should have been emitted");
    });
    
    it("Should validate token mint addresses", async () => {
        // Test with default pubkey (should fail)
        try {
            await program.methods
                .updateRewardTokenMint(PublicKey.default)
                .accounts({
                    signer: keeperBot.publicKey,
                    config,
                })
                .signers([keeperBot])
                .rpc();
                
            assert.fail("Should have thrown InvalidRewardTokenMint error");
        } catch (error) {
            assert.ok(error.toString().includes("InvalidRewardTokenMint"));
        }
    });
    
    it("Should allow admin to update wallets", async () => {
        const newTreasuryWallet = Keypair.generate().publicKey;
        const newOwnerWallet = Keypair.generate().publicKey;
        
        // Update both wallets
        const tx = await program.methods
            .updateWallets(newTreasuryWallet, newOwnerWallet)
            .accounts({
                admin: admin.publicKey,
                config,
            })
            .signers([admin])
            .rpc();
            
        console.log("Update wallets transaction:", tx);
        
        // Verify updates
        const configAccount = await program.account.smartDialConfig.fetch(config);
        assert.equal(configAccount.treasuryWallet.toBase58(), newTreasuryWallet.toBase58());
        assert.equal(configAccount.ownerWallet.toBase58(), newOwnerWallet.toBase58());
    });
    
    it("Should prevent non-admin from updating wallets", async () => {
        const newTreasuryWallet = Keypair.generate().publicKey;
        
        try {
            await program.methods
                .updateWallets(newTreasuryWallet, null)
                .accounts({
                    admin: unauthorizedUser.publicKey,
                    config,
                })
                .signers([unauthorizedUser])
                .rpc();
                
            assert.fail("Should have thrown UnauthorizedAccess error");
        } catch (error) {
            assert.ok(error.toString().includes("UnauthorizedAccess"));
        }
    });
    
    it("Should validate wallet addresses", async () => {
        // Test with default pubkey (should fail)
        try {
            await program.methods
                .updateWallets(PublicKey.default, null)
                .accounts({
                    admin: admin.publicKey,
                    config,
                })
                .signers([admin])
                .rpc();
                
            assert.fail("Should have thrown InvalidWalletAddress error");
        } catch (error) {
            assert.ok(error.toString().includes("InvalidWalletAddress"));
        }
    });
    
    it("Should require at least one wallet update", async () => {
        // Test with no updates (should fail)
        try {
            await program.methods
                .updateWallets(null, null)
                .accounts({
                    admin: admin.publicKey,
                    config,
                })
                .signers([admin])
                .rpc();
                
            assert.fail("Should have thrown NoChangesRequested error");
        } catch (error) {
            assert.ok(error.toString().includes("NoChangesRequested"));
        }
    });
});