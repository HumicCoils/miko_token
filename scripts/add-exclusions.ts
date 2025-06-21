import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import * as fs from 'fs';
import * as path from 'path';

const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt");

// Load token configuration
const tokenConfigPath = path.join(__dirname, '..', 'config', 'miko-token.json');
const tokenConfig = JSON.parse(fs.readFileSync(tokenConfigPath, 'utf-8'));
const MIKO_TOKEN_MINT = new PublicKey(tokenConfig.mint);
const TAX_HOLDING_PDA = new PublicKey(tokenConfig.taxHoldingPda);

async function addExclusions() {
    console.log("Adding exclusions for MIKO token system...\n");
    
    // Setup connection
    const connection = new Connection("https://api.devnet.solana.com", 'confirmed');
    
    // Load deployer wallet
    const deployerPath = path.join(process.env.HOME!, '.config/solana/deployer-test.json');
    const deployerKeypair = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(deployerPath, 'utf-8')))
    );
    
    // Create provider
    const provider = new AnchorProvider(
        connection,
        new anchor.Wallet(deployerKeypair),
        { commitment: 'confirmed' }
    );
    anchor.setProvider(provider);
    
    // Load IDL
    const idlPath = path.join(__dirname, '..', 'target/idl/absolute_vault.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    
    // Create program
    const program = new Program(idl, ABSOLUTE_VAULT_PROGRAM_ID, provider);
    
    // Derive PDAs
    const [rewardExclusionsPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("reward_exclusions")],
        ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    const [taxExemptionsPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("tax_exemptions")],
        ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    // Load treasury wallet address
    const treasuryKeypair = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync('treasury-wallet.json', 'utf-8')))
    );
    const treasuryAddress = treasuryKeypair.publicKey;
    
    console.log("Authority:", deployerKeypair.publicKey.toBase58());
    console.log("Reward Exclusions PDA:", rewardExclusionsPDA.toBase58());
    console.log("Tax Exemptions PDA:", taxExemptionsPDA.toBase58());
    
    // Addresses to exclude from rewards
    const rewardExclusions = [
        { address: MIKO_TOKEN_MINT, name: "MIKO Token Mint" },
        { address: TAX_HOLDING_PDA, name: "Tax Holding PDA" },
        { address: treasuryAddress, name: "Treasury Wallet" },
    ];
    
    // Addresses to exempt from tax
    const taxExemptions = [
        { address: treasuryAddress, name: "Treasury Wallet" },
        { address: TAX_HOLDING_PDA, name: "Tax Holding PDA" },
    ];
    
    // Add reward exclusions
    console.log("\n--- Adding Reward Exclusions ---");
    for (const exclusion of rewardExclusions) {
        try {
            console.log(`\nExcluding ${exclusion.name}: ${exclusion.address.toBase58()}`);
            
            const tx = await program.methods
                .addRewardExclusion(exclusion.address)
                .accounts({
                    authority: deployerKeypair.publicKey,
                    rewardExclusions: rewardExclusionsPDA,
                })
                .rpc();
            
            console.log(`✅ Successfully excluded from rewards`);
            console.log(`Transaction: ${tx}`);
        } catch (error: any) {
            if (error.toString().includes("AlreadyExcluded")) {
                console.log(`✅ Already excluded from rewards`);
            } else {
                console.error(`❌ Error:`, error.message);
            }
        }
    }
    
    // Add tax exemptions
    console.log("\n--- Adding Tax Exemptions ---");
    for (const exemption of taxExemptions) {
        try {
            console.log(`\nExempting ${exemption.name}: ${exemption.address.toBase58()}`);
            
            const tx = await program.methods
                .addTaxExemption(exemption.address)
                .accounts({
                    authority: deployerKeypair.publicKey,
                    taxExemptions: taxExemptionsPDA,
                })
                .rpc();
            
            console.log(`✅ Successfully exempted from tax`);
            console.log(`Transaction: ${tx}`);
        } catch (error: any) {
            if (error.toString().includes("AlreadyExempt")) {
                console.log(`✅ Already exempted from tax`);
            } else {
                console.error(`❌ Error:`, error.message);
            }
        }
    }
    
    // Fetch and display current exclusions
    console.log("\n--- Current Exclusions Summary ---");
    
    try {
        const rewardExclusionsList = await program.account.rewardExclusions.fetch(rewardExclusionsPDA) as any;
        console.log(`\nReward exclusions (${rewardExclusionsList.excludedAddresses.length} addresses):`);
        rewardExclusionsList.excludedAddresses.forEach((addr: PublicKey, i: number) => {
            console.log(`  ${i + 1}. ${addr.toBase58()}`);
        });
    } catch (e) {
        console.log("Could not fetch reward exclusions");
    }
    
    try {
        const taxExemptionsList = await program.account.taxExemptions.fetch(taxExemptionsPDA) as any;
        console.log(`\nTax exemptions (${taxExemptionsList.exemptAddresses.length} addresses):`);
        taxExemptionsList.exemptAddresses.forEach((addr: PublicKey, i: number) => {
            console.log(`  ${i + 1}. ${addr.toBase58()}`);
        });
    } catch (e) {
        console.log("Could not fetch tax exemptions");
    }
    
    console.log("\n✅ Exclusions setup complete!");
}

// Run the script
addExclusions().catch(console.error);