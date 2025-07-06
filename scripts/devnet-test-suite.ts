import { 
    Connection, 
    Keypair, 
    PublicKey, 
    SystemProgram,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
    LAMPORTS_PER_SOL
} from '@solana/web3.js';
import {
    TOKEN_2022_PROGRAM_ID,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    getAccount,
    transferChecked,
    getTransferFeeConfig,
    getMint,
    mintTo
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import { BN } from '@coral-xyz/anchor';
import { createHash } from 'crypto';

// Constants
const VAULT_PROGRAM_ID = new PublicKey('DHzZjjPoRmbYvTsXE3Je1JW2M4qgkKsqsuTz3uKHh4qJ');
// Using Dev-Token for testing (has mint authority retained)
const MIKO_TOKEN_MINT = new PublicKey('PBbVBUPWMzC2LVu4Qb51qJfpp6XfGjY5nCGJhoUWYUf');
// Using existing vault (vault can only be initialized once per program)
const VAULT_PDA = new PublicKey('2udd79GB6eGPLZ11cBeSsKiDZnq3Zdksxx91kir5CJaf');

// Helper to calculate instruction discriminator
function getDiscriminator(instructionName: string): Buffer {
    const preimage = `global:${instructionName}`;
    const hash = createHash('sha256').update(preimage).digest();
    return hash.slice(0, 8);
}

// Load wallet helper
function loadWallet(filePath: string): Keypair {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(data));
}

class DevnetTester {
    connection: Connection;
    authority: Keypair;
    keeper: Keypair;
    treasury: Keypair;
    owner: Keypair;

    constructor() {
        this.connection = new Connection('https://api.devnet.solana.com', 'confirmed');
        this.authority = loadWallet('../owner-wallet.json');
        this.keeper = loadWallet('../keeper-bot-wallet.json');
        this.treasury = loadWallet('../treasury-wallet.json');
        this.owner = this.authority; // Same as authority in current setup
    }

    async testFeeHarvesting() {
        console.log('🧪 Testing Fee Harvesting...\n');

        try {
            // Create test holders
            const holder1 = Keypair.generate();
            const holder2 = Keypair.generate();

            // Fund holders
            console.log('Funding test holders...');
            await this.fundWallet(holder1.publicKey, 0.1);
            await this.fundWallet(holder2.publicKey, 0.1);

            // Create token accounts
            const holder1Ata = await this.createTokenAccount(holder1.publicKey, holder1);
            const holder2Ata = await this.createTokenAccount(holder2.publicKey, holder2);

            // Mint tokens to authority first
            const authorityAta = await this.getOrCreateTokenAccount(this.authority.publicKey, this.authority);
            
            // Note: Actual minting requires mint authority which is revoked
            console.log('Note: Using existing tokens from authority wallet');

            // Check authority balance
            const authorityAccount = await getAccount(
                this.connection,
                authorityAta,
                'confirmed',
                TOKEN_2022_PROGRAM_ID
            );
            console.log(`Authority balance: ${Number(authorityAccount.amount) / 10**9} MIKO`);

            if (authorityAccount.amount < 300_000_000_000n) {
                console.log('⚠️  Authority wallet needs more MIKO tokens for testing');
                console.log('Please transfer some MIKO tokens to the authority wallet first');
                return;
            }

            // Transfer tokens to create fees
            console.log('Creating transfers to generate fees...');
            await this.transferTokens(
                authorityAta,
                holder1Ata,
                100_000_000_000, // 100 MIKO
                this.authority
            );
            await this.transferTokens(
                authorityAta,
                holder2Ata,
                200_000_000_000, // 200 MIKO
                this.authority
            );

            // Wait for confirmations
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Check withheld fees
            const holder1Account = await getAccount(
                this.connection,
                holder1Ata,
                'confirmed',
                TOKEN_2022_PROGRAM_ID
            );
            const holder2Account = await getAccount(
                this.connection,
                holder2Ata,
                'confirmed',
                TOKEN_2022_PROGRAM_ID
            );

            console.log(`Holder 1 withheld fees: ${holder1Account.tlvData}`);
            console.log(`Holder 2 withheld fees: ${holder2Account.tlvData}`);

            // Harvest fees
            console.log('Harvesting fees...');
            const harvestResult = await this.harvestFees([holder1Ata, holder2Ata]);
            
            if (harvestResult.success) {
                console.log('✅ Fee harvesting successful!');
                console.log(`Transaction: ${harvestResult.signature}`);
                
                // Check treasury and owner balances
                await this.checkBalances();
            } else {
                console.log('❌ Fee harvesting failed:', harvestResult.error);
            }

        } catch (error) {
            console.error('Test failed:', error);
        }
    }

    async testRewardDistribution() {
        console.log('\n🧪 Testing Reward Distribution...\n');

        try {
            // Create eligible holders
            const eligibleHolders = [];
            for (let i = 0; i < 3; i++) {
                const holder = Keypair.generate();
                await this.fundWallet(holder.publicKey, 0.1);
                const ata = await this.createTokenAccount(holder.publicKey, holder);
                
                // For testing, assume 100 MIKO = $100
                const balance = 100_000_000_000 + (i * 50_000_000_000); // 100, 150, 200 MIKO
                
                eligibleHolders.push({
                    wallet: holder.publicKey,
                    ata,
                    balance,
                    usdValue: balance / 1_000_000_000 // Simplified USD calculation
                });
            }

            // Prepare holder data for distribution
            const holderData = eligibleHolders.map(h => {
                const walletBuffer = h.wallet.toBuffer();
                const balanceBuffer = new BN(h.balance).toBuffer('le', 8);
                const usdValueBuffer = new BN(h.usdValue).toBuffer('le', 8);
                
                // Combine into single buffer: wallet (32) + balance (8) + usd_value (8)
                return Buffer.concat([walletBuffer, balanceBuffer, usdValueBuffer]);
            });

            console.log('Distributing rewards to eligible holders...');
            const distributeResult = await this.distributeRewards(holderData, eligibleHolders.map(h => h.ata));

            if (distributeResult.success) {
                console.log('✅ Reward distribution successful!');
                console.log(`Transaction: ${distributeResult.signature}`);
            } else {
                console.log('❌ Reward distribution failed:', distributeResult.error);
            }

        } catch (error) {
            console.error('Test failed:', error);
        }
    }

    async testExclusionManagement() {
        console.log('\n🧪 Testing Exclusion Management...\n');

        try {
            const testWallet = Keypair.generate();
            
            // Add exclusion
            console.log('Adding fee exclusion...');
            const addResult = await this.manageExclusion(
                testWallet.publicKey,
                0, // FeeOnly
                0  // Add
            );

            if (addResult.success) {
                console.log('✅ Exclusion added successfully!');
                console.log(`Transaction: ${addResult.signature}`);
                
                // Update to Both
                console.log('Updating to both exclusions...');
                const updateResult = await this.manageExclusion(
                    testWallet.publicKey,
                    2, // Both
                    0  // Add (update)
                );
                
                if (updateResult.success) {
                    console.log('✅ Exclusion updated successfully!');
                    console.log(`Transaction: ${updateResult.signature}`);
                }
            }

        } catch (error) {
            console.error('Test failed:', error);
        }
    }

    // Helper methods implementation
    async fundWallet(pubkey: PublicKey, amount: number) {
        const sig = await this.connection.requestAirdrop(
            pubkey,
            amount * LAMPORTS_PER_SOL
        );
        await this.connection.confirmTransaction(sig);
    }

    async createTokenAccount(owner: PublicKey, payer: Keypair): Promise<PublicKey> {
        const ata = await getAssociatedTokenAddress(
            MIKO_TOKEN_MINT,
            owner,
            false,
            TOKEN_2022_PROGRAM_ID
        );

        const instruction = createAssociatedTokenAccountInstruction(
            payer.publicKey,
            ata,
            owner,
            MIKO_TOKEN_MINT,
            TOKEN_2022_PROGRAM_ID
        );

        const tx = new Transaction().add(instruction);
        await sendAndConfirmTransaction(this.connection, tx, [payer]);
        
        return ata;
    }

    async getOrCreateTokenAccount(owner: PublicKey, payer: Keypair): Promise<PublicKey> {
        const ata = await getAssociatedTokenAddress(
            MIKO_TOKEN_MINT,
            owner,
            false,
            TOKEN_2022_PROGRAM_ID
        );

        const account = await this.connection.getAccountInfo(ata);
        if (!account) {
            await this.createTokenAccount(owner, payer);
        }
        
        return ata;
    }

    async transferTokens(
        from: PublicKey,
        to: PublicKey,
        amount: number,
        owner: Keypair
    ) {
        const sig = await transferChecked(
            this.connection,
            owner,
            from,
            MIKO_TOKEN_MINT,
            to,
            owner,
            amount,
            9,
            [],
            { commitment: 'confirmed' },
            TOKEN_2022_PROGRAM_ID
        );
        return sig;
    }

    async harvestFees(tokenAccounts: PublicKey[]) {
        try {
            const discriminator = getDiscriminator('harvest_fees');
            
            // Derive treasury and owner vault PDAs
            const [treasuryVault] = PublicKey.findProgramAddressSync(
                [Buffer.from('treasury_vault'), MIKO_TOKEN_MINT.toBuffer()],
                VAULT_PROGRAM_ID
            );
            
            const [ownerVault] = PublicKey.findProgramAddressSync(
                [Buffer.from('owner_vault'), MIKO_TOKEN_MINT.toBuffer()],
                VAULT_PROGRAM_ID
            );
            
            // Serialize accounts_to_harvest
            const accountsData = Buffer.concat([
                Buffer.from([tokenAccounts.length]), // u8 length
                ...tokenAccounts.map(acc => acc.toBuffer())
            ]);
            
            const instructionData = Buffer.concat([discriminator, accountsData]);
            
            const instruction = new TransactionInstruction({
                keys: [
                    { pubkey: VAULT_PDA, isSigner: false, isWritable: true },
                    { pubkey: this.keeper.publicKey, isSigner: true, isWritable: false },
                    { pubkey: MIKO_TOKEN_MINT, isSigner: false, isWritable: false },
                    { pubkey: treasuryVault, isSigner: false, isWritable: true },
                    { pubkey: ownerVault, isSigner: false, isWritable: true },
                    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
                    // Add token accounts as remaining accounts
                    ...tokenAccounts.map(acc => ({ 
                        pubkey: acc, 
                        isSigner: false, 
                        isWritable: true 
                    }))
                ],
                programId: VAULT_PROGRAM_ID,
                data: instructionData
            });
            
            const tx = new Transaction().add(instruction);
            const signature = await sendAndConfirmTransaction(
                this.connection,
                tx,
                [this.keeper]
            );
            
            return { success: true, signature };
        } catch (error) {
            return { success: false, error };
        }
    }

    async distributeRewards(holderData: Buffer[], rewardAccounts: PublicKey[]) {
        try {
            const discriminator = getDiscriminator('distribute_rewards');
            
            // Get current reward token from vault state
            // For now, use SOL as reward token
            const rewardToken = SystemProgram.programId; // Native SOL
            
            // Serialize holder data
            const holderDataSerialized = Buffer.concat([
                Buffer.from([holderData.length]), // u8 length
                ...holderData
            ]);
            
            const instructionData = Buffer.concat([discriminator, holderDataSerialized]);
            
            const instruction = new TransactionInstruction({
                keys: [
                    { pubkey: VAULT_PDA, isSigner: false, isWritable: true },
                    { pubkey: this.keeper.publicKey, isSigner: true, isWritable: false },
                    { pubkey: rewardToken, isSigner: false, isWritable: false },
                    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
                    // Add reward accounts as remaining accounts
                    ...rewardAccounts.map(acc => ({ 
                        pubkey: acc, 
                        isSigner: false, 
                        isWritable: true 
                    }))
                ],
                programId: VAULT_PROGRAM_ID,
                data: instructionData
            });
            
            const tx = new Transaction().add(instruction);
            const signature = await sendAndConfirmTransaction(
                this.connection,
                tx,
                [this.keeper]
            );
            
            return { success: true, signature };
        } catch (error) {
            return { success: false, error };
        }
    }

    async manageExclusion(wallet: PublicKey, exclusionType: number, action: number) {
        try {
            const discriminator = getDiscriminator('manage_exclusions');
            
            // Derive exclusion PDA
            const [exclusionPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('exclusion'), wallet.toBuffer()],
                VAULT_PROGRAM_ID
            );
            
            const instructionData = Buffer.concat([
                discriminator,
                wallet.toBuffer(),
                Buffer.from([exclusionType]),
                Buffer.from([action])
            ]);
            
            const instruction = new TransactionInstruction({
                keys: [
                    { pubkey: VAULT_PDA, isSigner: false, isWritable: false },
                    { pubkey: this.authority.publicKey, isSigner: true, isWritable: true },
                    { pubkey: exclusionPda, isSigner: false, isWritable: true },
                    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                    { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
                ],
                programId: VAULT_PROGRAM_ID,
                data: instructionData
            });
            
            const tx = new Transaction().add(instruction);
            const signature = await sendAndConfirmTransaction(
                this.connection,
                tx,
                [this.authority]
            );
            
            return { success: true, signature };
        } catch (error) {
            return { success: false, error };
        }
    }

    async checkBalances() {
        console.log('\n💰 Checking balances...');
        
        try {
            // Get treasury vault ATA
            const [treasuryVault] = PublicKey.findProgramAddressSync(
                [Buffer.from('treasury_vault'), MIKO_TOKEN_MINT.toBuffer()],
                VAULT_PROGRAM_ID
            );
            
            // Get owner vault ATA
            const [ownerVault] = PublicKey.findProgramAddressSync(
                [Buffer.from('owner_vault'), MIKO_TOKEN_MINT.toBuffer()],
                VAULT_PROGRAM_ID
            );
            
            // Check balances
            const treasuryAccount = await getAccount(
                this.connection,
                treasuryVault,
                'confirmed',
                TOKEN_2022_PROGRAM_ID
            );
            const ownerAccount = await getAccount(
                this.connection,
                ownerVault,
                'confirmed',
                TOKEN_2022_PROGRAM_ID
            );
            
            console.log(`Treasury Vault: ${Number(treasuryAccount.amount) / 10**9} MIKO (80% of fees)`);
            console.log(`Owner Vault: ${Number(ownerAccount.amount) / 10**9} MIKO (20% of fees)`);
            
        } catch (error) {
            console.error('Error checking balances:', error);
        }
    }
}

// Main test runner
async function runTests() {
    console.log('🚀 Starting Devnet Manual Tests\n');
    console.log('Program ID:', VAULT_PROGRAM_ID.toBase58());
    console.log('Token Mint:', MIKO_TOKEN_MINT.toBase58());
    console.log('Vault PDA:', VAULT_PDA.toBase58());
    console.log('\n' + '='.repeat(50) + '\n');

    const tester = new DevnetTester();

    // Run tests sequentially
    await tester.testFeeHarvesting();
    await tester.testExclusionManagement();
    await tester.testRewardDistribution();

    console.log('\n✅ All tests completed!');
}

// Execute tests
if (require.main === module) {
    runTests()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Test suite failed:', err);
            process.exit(1);
        });
}

export { DevnetTester, runTests };