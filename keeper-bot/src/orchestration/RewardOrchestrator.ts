import { PublicKey, Transaction } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { AIAgentMonitor } from '../services/AIAgentMonitor';
import { BirdeyeClient } from '../services/BirdeyeClient';
import { JupiterClient } from '../services/JupiterClient';
import { SolanaClient } from '../services/SolanaClient';
import { AbsoluteVault } from '../../target/types/absolute_vault';
import { SmartDial } from '../../target/types/smart_dial';
import IDL_ABSOLUTE_VAULT from '../../target/idl/absolute_vault.json';
import IDL_SMART_DIAL from '../../target/idl/smart_dial.json';

const logger = createLogger('RewardOrchestrator');

export interface RewardCycleResult {
    success: boolean;
    rewardToken?: string;
    amountDistributed?: number;
    recipientsCount?: number;
    error?: string;
}

export class RewardOrchestrator {
    private aiAgentMonitor: AIAgentMonitor;
    private birdeyeClient: BirdeyeClient;
    private jupiterClient: JupiterClient;
    private solanaClient: SolanaClient;
    private absoluteVaultProgram: Program<AbsoluteVault>;
    private smartDialProgram: Program<SmartDial>;
    
    constructor() {
        this.aiAgentMonitor = new AIAgentMonitor();
        this.birdeyeClient = new BirdeyeClient();
        this.jupiterClient = new JupiterClient();
        this.solanaClient = new SolanaClient();
        
        // Initialize Anchor programs
        this.absoluteVaultProgram = new Program(
            IDL_ABSOLUTE_VAULT as AbsoluteVault,
            config.ABSOLUTE_VAULT_PROGRAM_ID,
            this.solanaClient.getProvider()
        );
        
        this.smartDialProgram = new Program(
            IDL_SMART_DIAL as SmartDial,
            config.SMART_DIAL_PROGRAM_ID,
            this.solanaClient.getProvider()
        );
    }
    
    async checkAndUpdateRewardToken(): Promise<void> {
        try {
            logger.info('Checking for new reward token from AI agent');
            
            // Get latest reward tweet
            const rewardTweet = await this.aiAgentMonitor.getLatestRewardTweet();
            
            if (!rewardTweet) {
                logger.info('No new reward tweet found');
                return;
            }
            
            logger.info({ symbol: rewardTweet.symbol }, 'Found new reward token symbol');
            
            // Find the highest volume token for this symbol
            const tokenInfo = await this.birdeyeClient.findHighestVolumeToken(rewardTweet.symbol);
            
            if (!tokenInfo) {
                logger.warn({ symbol: rewardTweet.symbol }, 'No valid token found for symbol');
                return;
            }
            
            // Validate the token
            const isValid = await this.birdeyeClient.validateToken(tokenInfo.address);
            
            if (!isValid) {
                logger.warn({ 
                    symbol: rewardTweet.symbol, 
                    address: tokenInfo.address 
                }, 'Token failed validation criteria');
                return;
            }
            
            // Update Smart Dial with new reward token
            await this.updateSmartDialRewardToken(new PublicKey(tokenInfo.address));
            
            logger.info({ 
                symbol: rewardTweet.symbol, 
                address: tokenInfo.address 
            }, 'Successfully updated reward token');
            
        } catch (error) {
            logger.error({ error }, 'Failed to check and update reward token');
            throw error;
        }
    }
    
    private async updateSmartDialRewardToken(newMint: PublicKey): Promise<void> {
        try {
            const [configPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('smart_dial_config')],
                this.smartDialProgram.programId
            );
            
            const tx = await this.smartDialProgram.methods
                .updateRewardTokenMint(newMint)
                .accounts({
                    signer: this.solanaClient.getPublicKey(),
                    config: configPda,
                })
                .rpc();
                
            logger.info({ 
                txid: tx, 
                newMint: newMint.toString() 
            }, 'Updated Smart Dial reward token');
            
        } catch (error) {
            logger.error({ error }, 'Failed to update Smart Dial reward token');
            throw error;
        }
    }
    
    async executeRewardCycle(): Promise<RewardCycleResult> {
        try {
            logger.info('Starting reward distribution cycle');
            
            // Get current reward token from Smart Dial
            const rewardToken = await this.getCurrentRewardToken();
            
            if (!rewardToken) {
                return {
                    success: false,
                    error: 'No reward token set in Smart Dial'
                };
            }
            
            // Trigger holder registry update
            await this.triggerHolderRegistryUpdate();
            
            // Get treasury balance
            const treasuryBalance = await this.getTreasuryBalance();
            
            if (treasuryBalance <= 0) {
                logger.warn('Treasury has no balance to distribute');
                return {
                    success: false,
                    error: 'Treasury balance is zero'
                };
            }
            
            // Swap tax tokens to reward token
            const swapResult = await this.swapTaxToRewardToken(rewardToken, treasuryBalance);
            
            if (!swapResult.success) {
                return {
                    success: false,
                    error: `Swap failed: ${swapResult.error}`
                };
            }
            
            // Calculate reward distribution
            await this.calculateRewardDistribution(swapResult.outputAmount);
            
            // Execute reward distribution
            const distributionResult = await this.executeRewardDistribution(
                rewardToken,
                swapResult.outputAmount
            );
            
            logger.info({ 
                rewardToken: rewardToken.toString(),
                amountDistributed: distributionResult.amountDistributed,
                recipientsCount: distributionResult.recipientsCount
            }, 'Reward cycle completed successfully');
            
            return {
                success: true,
                rewardToken: rewardToken.toString(),
                amountDistributed: distributionResult.amountDistributed,
                recipientsCount: distributionResult.recipientsCount,
            };
            
        } catch (error) {
            logger.error({ error }, 'Failed to execute reward cycle');
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    
    private async getCurrentRewardToken(): Promise<PublicKey | null> {
        try {
            const [configPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('smart_dial_config')],
                this.smartDialProgram.programId
            );
            
            const config = await this.smartDialProgram.account.smartDialConfig.fetch(configPda);
            
            if (config.currentRewardTokenMint.equals(PublicKey.default)) {
                return null;
            }
            
            return config.currentRewardTokenMint;
        } catch (error) {
            logger.error({ error }, 'Failed to get current reward token');
            return null;
        }
    }
    
    private async triggerHolderRegistryUpdate(): Promise<void> {
        logger.info('Triggering holder registry update');
        
        // This would iterate through all token accounts and update the registry
        // For now, we'll update the first chunk
        const chunkId = 0;
        
        const [taxConfigPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('tax_config')],
            this.absoluteVaultProgram.programId
        );
        
        const [holderRegistryPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('holder_registry'), Buffer.from([chunkId])],
            this.absoluteVaultProgram.programId
        );
        
        const tx = await this.absoluteVaultProgram.methods
            .updateHolderRegistry(chunkId, 0, 100)
            .accounts({
                authority: this.solanaClient.getPublicKey(),
                taxConfig: taxConfigPda,
                holderRegistry: holderRegistryPda,
            })
            .rpc();
            
        logger.info({ txid: tx, chunkId }, 'Holder registry updated');
    }
    
    private async getTreasuryBalance(): Promise<number> {
        const [configPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('smart_dial_config')],
            this.smartDialProgram.programId
        );
        
        const config = await this.smartDialProgram.account.smartDialConfig.fetch(configPda);
        const balance = await this.solanaClient.getTokenBalance(
            config.MIKO_TOKEN_MINT,
            config.treasuryWallet
        );
        
        return balance;
    }
    
    private async swapTaxToRewardToken(
        rewardToken: PublicKey,
        amount: number
    ): Promise<{ success: boolean; outputAmount: number; error?: string }> {
        try {
            // Convert to smallest unit
            const inputAmount = Math.floor(amount * 1e9);
            
            // Get swap quote
            const quote = await this.jupiterClient.getQuote(
                config.MIKO_TOKEN_MINT,
                rewardToken,
                inputAmount,
                100 // 1% slippage
            );
            
            // Get swap transaction
            const swapTx = await this.jupiterClient.getSwapTransaction(
                quote,
                this.solanaClient.getPublicKey()
            );
            
            // Execute swap
            const txid = await this.solanaClient.sendTransaction(swapTx);
            
            const outputAmount = parseInt(quote.outAmount) / 1e9;
            
            logger.info({ 
                txid, 
                inputAmount: amount,
                outputAmount,
                rewardToken: rewardToken.toString()
            }, 'Swap completed successfully');
            
            return { success: true, outputAmount };
            
        } catch (error) {
            logger.error({ error }, 'Swap failed');
            return { 
                success: false, 
                outputAmount: 0,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    
    private async calculateRewardDistribution(amount: number): Promise<void> {
        // This is handled by the smart contract
        logger.info({ amount }, 'Calculating reward distribution');
    }
    
    private async executeRewardDistribution(
        rewardToken: PublicKey,
        amount: number
    ): Promise<{ amountDistributed: number; recipientsCount: number }> {
        const [taxConfigPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('tax_config')],
            this.absoluteVaultProgram.programId
        );
        
        const [configPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('smart_dial_config')],
            this.smartDialProgram.programId
        );
        
        const config = await this.smartDialProgram.account.smartDialConfig.fetch(configPda);
        
        // Ensure treasury has reward token account
        const treasuryRewardAccount = await this.solanaClient.ensureTokenAccount(
            rewardToken,
            config.treasuryWallet
        );
        
        // Convert to smallest unit
        const rewardAmount = Math.floor(amount * 1e9);
        
        const tx = await this.absoluteVaultProgram.methods
            .calculateAndDistributeRewards(rewardAmount)
            .accounts({
                authority: this.solanaClient.getPublicKey(),
                taxConfig: taxConfigPda,
                rewardTokenMint: rewardToken,
                treasuryWallet: config.treasuryWallet,
                treasuryRewardAccount,
            })
            .rpc();
            
        logger.info({ txid: tx, amount, rewardToken: rewardToken.toString() }, 
            'Reward distribution executed');
        
        // TODO: Get actual recipient count from events
        return {
            amountDistributed: amount,
            recipientsCount: 0, // Will be updated from events
        };
    }
}