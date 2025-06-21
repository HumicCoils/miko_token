import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import {
    TOKEN_2022_PROGRAM_ID,
    getAssociatedTokenAddress,
    getAccount,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const ABSOLUTE_VAULT_PROGRAM_ID = new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt");

// Load token configuration
const tokenConfigPath = path.join(__dirname, '..', 'config', 'miko-token.json');
const tokenConfig = JSON.parse(fs.readFileSync(tokenConfigPath, 'utf-8'));
const MIKO_TOKEN_MINT = new PublicKey(tokenConfig.mint);
const DECIMALS = tokenConfig.decimals;

// Mock price for testing (assuming $0.001 per MIKO)
const MIKO_PRICE_USD = 0.001;
const MIN_USD_THRESHOLD = 100;
const MIN_TOKEN_THRESHOLD = MIN_USD_THRESHOLD / MIKO_PRICE_USD; // 100,000 tokens

async function testHolderRegistry() {
    console.log("Testing MIKO token holder registry...\n");
    
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
    const [taxConfigPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("tax_config")],
        ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    const [holderRegistryPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("holder_registry"), Buffer.from([0])], // chunk 0
        ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    const [rewardExclusionsPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("reward_exclusions")],
        ABSOLUTE_VAULT_PROGRAM_ID
    );
    
    console.log("Authority:", deployerKeypair.publicKey.toBase58());
    console.log("Holder Registry PDA (chunk 0):", holderRegistryPDA.toBase58());
    console.log("Min USD threshold:", MIN_USD_THRESHOLD);
    console.log("Min token threshold:", MIN_TOKEN_THRESHOLD.toLocaleString(), "MIKO");
    console.log("Mock MIKO price:", `$${MIKO_PRICE_USD}\n`);
    
    // Get all test holders and their balances
    const testHolders = [
        { file: 'test-holder-1.json', name: 'Holder 1' },
        { file: 'test-holder-2.json', name: 'Holder 2' },
        { file: 'test-holder-3.json', name: 'Holder 3' },
    ];
    
    const holderData: Array<{ address: PublicKey, balance: number, valueUSD: number, eligible: boolean }> = [];
    
    console.log("=== Current Holder Balances ===");
    
    for (const holder of testHolders) {
        const wallet = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(holder.file, 'utf-8')))
        );
        
        const tokenAccount = await getAssociatedTokenAddress(
            MIKO_TOKEN_MINT,
            wallet.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID
        );
        
        try {
            const account = await getAccount(
                connection,
                tokenAccount,
                'confirmed',
                TOKEN_2022_PROGRAM_ID
            );
            
            const balance = Number(account.amount) / (10 ** DECIMALS);
            const valueUSD = balance * MIKO_PRICE_USD;
            const eligible = valueUSD >= MIN_USD_THRESHOLD;
            
            holderData.push({
                address: wallet.publicKey,
                balance,
                valueUSD,
                eligible
            });
            
            console.log(`${holder.name} (${wallet.publicKey.toBase58().slice(0, 8)}...):`);
            console.log(`  Balance: ${balance.toLocaleString()} MIKO`);
            console.log(`  Value: $${valueUSD.toFixed(2)}`);
            console.log(`  Eligible: ${eligible ? '✅ Yes' : '❌ No'}`);
        } catch (e) {
            console.log(`${holder.name}: No token account`);
        }
    }
    
    // Get eligible holders for registry update
    const eligibleHolders = holderData
        .filter(h => h.eligible)
        .map(h => h.address);
    
    console.log(`\n=== Updating Holder Registry ===`);
    console.log(`Eligible holders: ${eligibleHolders.length}`);
    
    try {
        // Update holder registry
        const tx = await program.methods
            .updateHolderRegistry(
                0, // chunk_id
                0, // start_index
                100, // batch_size
                new anchor.BN(MIN_TOKEN_THRESHOLD * (10 ** DECIMALS)) // min_holder_threshold
            )
            .accounts({
                authority: deployerKeypair.publicKey,
                taxConfig: taxConfigPDA,
                holderRegistry: holderRegistryPDA,
                rewardExclusions: rewardExclusionsPDA,
                systemProgram: anchor.web3.SystemProgram.programId,
                token2022Program: TOKEN_2022_PROGRAM_ID,
            })
            .remainingAccounts(
                eligibleHolders.map(holder => ({
                    pubkey: holder,
                    isWritable: false,
                    isSigner: false,
                }))
            )
            .rpc();
        
        console.log("✅ Holder registry updated successfully!");
        console.log("Transaction:", tx);
        
        // Fetch and display registry
        const holderRegistry = await program.account.holderRegistry.fetch(holderRegistryPDA) as any;
        
        console.log("\n=== Holder Registry Contents ===");
        console.log(`Chunk ID: ${holderRegistry.chunkId}`);
        console.log(`Total eligible holders: ${holderRegistry.eligibleHolders.length}`);
        console.log(`Last update: ${new Date(holderRegistry.lastUpdate.toNumber() * 1000).toLocaleString()}`);
        
        // Calculate share distribution
        const totalBalance = holderRegistry.balances.reduce((sum: any, bal: any) => {
            return sum.add(bal);
        }, new anchor.BN(0));
        
        console.log("\nHolder shares:");
        holderRegistry.eligibleHolders.forEach((holder: PublicKey, index: number) => {
            const balance = holderRegistry.balances[index];
            const sharePercent = (balance.toNumber() / totalBalance.toNumber()) * 100;
            
            const holderInfo = holderData.find(h => h.address.equals(holder));
            console.log(`  ${holder.toBase58().slice(0, 8)}... : ${sharePercent.toFixed(2)}% (${holderInfo?.balance.toLocaleString() || '?'} MIKO)`);
        });
        
        // Test exclusions
        console.log("\n=== Testing Exclusions ===");
        
        // Fetch reward exclusions
        const rewardExclusions = await program.account.rewardExclusions.fetch(rewardExclusionsPDA) as any;
        console.log(`Reward exclusions: ${rewardExclusions.excludedAddresses.length} addresses`);
        
        // Check if any test holders are excluded
        for (const holder of holderData) {
            const isExcluded = rewardExclusions.excludedAddresses.some((excluded: PublicKey) => 
                excluded.equals(holder.address)
            );
            
            const inRegistry = holderRegistry.eligibleHolders.some((registered: PublicKey) => 
                registered.equals(holder.address)
            );
            
            if (isExcluded && inRegistry) {
                console.log(`❌ ERROR: ${holder.address.toBase58().slice(0, 8)}... is both excluded and in registry!`);
            } else if (holder.eligible && !inRegistry && !isExcluded) {
                console.log(`❌ ERROR: ${holder.address.toBase58().slice(0, 8)}... is eligible but not in registry!`);
            } else if (!holder.eligible && inRegistry) {
                console.log(`❌ ERROR: ${holder.address.toBase58().slice(0, 8)}... is not eligible but in registry!`);
            }
        }
        
        console.log("\n✅ Holder registry test complete!");
        
    } catch (error: any) {
        console.error("❌ Error updating holder registry:", error.message);
        if (error.logs) {
            console.error("Program logs:", error.logs);
        }
    }
}

// Run the script
testHolderRegistry().catch(console.error);