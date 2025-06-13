import { 
    Connection, 
    Keypair, 
    PublicKey, 
    Transaction,
    VersionedTransaction,
    sendAndConfirmTransaction,
    ComputeBudgetProgram,
    TransactionMessage,
    TransactionInstruction,
    SystemProgram
} from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { 
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createTransferCheckedInstruction,
    TOKEN_2022_PROGRAM_ID
} from '@solana/spl-token';
import * as bs58 from 'bs58';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { withRetry } from '../utils/retry';

const logger = createLogger('SolanaClient');

export class SolanaClient {
    private connection: Connection;
    private wallet: Wallet;
    private provider: AnchorProvider;
    
    constructor() {
        this.connection = new Connection(config.RPC_URL, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000,
        });
        
        // Decode keeper bot private key
        const secretKey = bs58.decode(config.KEEPER_BOT_KEY);
        const keypair = Keypair.fromSecretKey(secretKey);
        
        this.wallet = new Wallet(keypair);
        this.provider = new AnchorProvider(
            this.connection,
            this.wallet,
            { commitment: 'confirmed' }
        );
    }
    
    getConnection(): Connection {
        return this.connection;
    }
    
    getProvider(): AnchorProvider {
        return this.provider;
    }
    
    getWallet(): Wallet {
        return this.wallet;
    }
    
    getPublicKey(): PublicKey {
        return this.wallet.publicKey;
    }
    
    async getBalance(address?: PublicKey): Promise<number> {
        const pubkey = address || this.wallet.publicKey;
        const balance = await this.connection.getBalance(pubkey);
        return balance; // Return in lamports
    }
    
    async getTokenBalance(mint: PublicKey, owner?: PublicKey): Promise<number> {
        try {
            const ownerPubkey = owner || this.wallet.publicKey;
            const tokenAccount = await getAssociatedTokenAddress(
                mint,
                ownerPubkey,
                false,
                TOKEN_2022_PROGRAM_ID
            );
            
            const accountInfo = await this.connection.getTokenAccountBalance(tokenAccount);
            return parseFloat(accountInfo.value.uiAmount?.toString() || '0');
        } catch (error) {
            logger.warn({ error, mint: mint.toString() }, 'Failed to get token balance');
            return 0;
        }
    }
    
    async ensureTokenAccount(
        mint: PublicKey,
        owner?: PublicKey
    ): Promise<PublicKey> {
        const ownerPubkey = owner || this.wallet.publicKey;
        const associatedToken = await getAssociatedTokenAddress(
            mint,
            ownerPubkey,
            false,
            TOKEN_2022_PROGRAM_ID
        );
        
        const accountInfo = await this.connection.getAccountInfo(associatedToken);
        
        if (!accountInfo) {
            logger.info({
                mint: mint.toString(),
                owner: ownerPubkey.toString(),
                ata: associatedToken.toString()
            }, 'Creating associated token account');
            
            const transaction = new Transaction().add(
                createAssociatedTokenAccountInstruction(
                    this.wallet.publicKey,
                    associatedToken,
                    ownerPubkey,
                    mint,
                    TOKEN_2022_PROGRAM_ID
                )
            );
            
            await this.sendTransaction(transaction);
        }
        
        return associatedToken;
    }
    
    async sendTransaction(
        transaction: Transaction | VersionedTransaction,
        skipPreflight: boolean = false
    ): Promise<string> {
        try {
            return await withRetry(async () => {
                let signature: string;
                
                if (transaction instanceof Transaction) {
                    // Add priority fee
                    transaction.add(
                        ComputeBudgetProgram.setComputeUnitPrice({
                            microLamports: 1000, // Priority fee
                        })
                    );
                    
                    signature = await sendAndConfirmTransaction(
                        this.connection,
                        transaction,
                        [this.wallet.payer],
                        {
                            skipPreflight,
                            commitment: 'confirmed',
                            maxRetries: 3,
                        }
                    );
                } else {
                    // For versioned transactions
                    transaction.sign([this.wallet.payer]);
                    signature = await this.connection.sendTransaction(transaction, {
                        skipPreflight,
                        maxRetries: 3,
                    });
                    
                    // Wait for confirmation
                    const confirmation = await this.connection.confirmTransaction({
                        signature,
                        blockhash: transaction.message.recentBlockhash,
                        lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight,
                    }, 'confirmed');
                    
                    if (confirmation.value.err) {
                        throw new Error(`Transaction failed: ${confirmation.value.err}`);
                    }
                }
                
                logger.info({ signature }, 'Transaction sent successfully');
                return signature;
            }, {
                maxRetries: 3,
                delay: 2000,
                onRetry: (error, attempt) => {
                    logger.warn({ error, attempt }, 'Transaction failed, retrying...');
                }
            });
        } catch (error) {
            logger.error({ error }, 'Failed to send transaction');
            throw error;
        }
    }
    
    async simulateTransaction(
        transaction: Transaction | VersionedTransaction
    ): Promise<boolean> {
        try {
            let result;
            
            if (transaction instanceof Transaction) {
                result = await this.connection.simulateTransaction(transaction);
            } else {
                result = await this.connection.simulateTransaction(transaction);
            }
            
            if (result.value.err) {
                logger.error({ 
                    error: result.value.err,
                    logs: result.value.logs 
                }, 'Transaction simulation failed');
                return false;
            }
            
            logger.info({ 
                logs: result.value.logs,
                unitsConsumed: result.value.unitsConsumed 
            }, 'Transaction simulation successful');
            
            return true;
        } catch (error) {
            logger.error({ error }, 'Failed to simulate transaction');
            return false;
        }
    }
    
    async getRecentBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
        const blockhashInfo = await this.connection.getLatestBlockhash('confirmed');
        return {
            blockhash: blockhashInfo.blockhash,
            lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
        };
    }
    
    async getSlot(): Promise<number> {
        return await this.connection.getSlot();
    }
    
    async getHealth(): Promise<{ slot: number; blockTime: number | null }> {
        const slot = await this.getSlot();
        const blockTime = await this.connection.getBlockTime(slot);
        return { slot, blockTime };
    }
    
    async transfer(
        recipient: PublicKey,
        lamports: number
    ): Promise<string> {
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: this.wallet.publicKey,
                toPubkey: recipient,
                lamports,
            })
        );
        
        return await this.sendTransaction(transaction);
    }
    
    async getTokenAccount(
        mint: PublicKey,
        owner: PublicKey
    ): Promise<PublicKey> {
        return await getAssociatedTokenAddress(
            mint,
            owner,
            false,
            TOKEN_2022_PROGRAM_ID
        );
    }
    
    async transferToken(
        mint: PublicKey,
        from: PublicKey,
        to: PublicKey,
        authority: PublicKey,
        amount: number
    ): Promise<string> {
        const transaction = new Transaction().add(
            createTransferCheckedInstruction(
                from,
                mint,
                to,
                authority,
                amount,
                9, // Assuming 9 decimals for all tokens
                [],
                TOKEN_2022_PROGRAM_ID
            )
        );
        
        return await this.sendTransaction(transaction);
    }
}