import axios, { AxiosInstance } from 'axios';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { withRetry } from '../utils/retry';

const logger = createLogger('JupiterClient');

export interface SwapQuote {
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: 'ExactIn' | 'ExactOut';
    slippageBps: number;
    priceImpactPct: string;
    routePlan: any[];
}

export interface SwapResult {
    txid: string;
    inputAmount: string;
    outputAmount: string;
    inputMint: string;
    outputMint: string;
}

export class JupiterClient {
    private client: AxiosInstance;
    
    constructor() {
        this.client = axios.create({
            baseURL: 'https://quote-api.jup.ag/v6',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
    }
    
    async getQuote(
        inputMint: PublicKey,
        outputMint: PublicKey,
        amount: number,
        slippageBps: number = 50 // 0.5% default slippage
    ): Promise<SwapQuote> {
        try {
            return await withRetry(async () => {
                const response = await this.client.get('/quote', {
                    params: {
                        inputMint: inputMint.toString(),
                        outputMint: outputMint.toString(),
                        amount: amount.toString(),
                        slippageBps,
                        onlyDirectRoutes: false,
                        asLegacyTransaction: false,
                    },
                });
                
                if (!response.data) {
                    throw new Error('No quote data received');
                }
                
                const quote: SwapQuote = {
                    inputMint: response.data.inputMint,
                    outputMint: response.data.outputMint,
                    inAmount: response.data.inAmount,
                    outAmount: response.data.outAmount,
                    otherAmountThreshold: response.data.otherAmountThreshold,
                    swapMode: response.data.swapMode,
                    slippageBps: response.data.slippageBps,
                    priceImpactPct: response.data.priceImpactPct,
                    routePlan: response.data.routePlan,
                };
                
                logger.info({
                    inputMint: inputMint.toString(),
                    outputMint: outputMint.toString(),
                    inputAmount: amount,
                    outputAmount: quote.outAmount,
                    priceImpact: quote.priceImpactPct,
                }, 'Got swap quote');
                
                return quote;
            }, {
                maxRetries: 3,
                delay: 2000,
                onRetry: (error, attempt) => {
                    logger.warn({ error, attempt }, 'Jupiter quote request failed, retrying...');
                }
            });
        } catch (error) {
            logger.error({ error, inputMint: inputMint.toString(), outputMint: outputMint.toString() }, 
                'Failed to get swap quote');
            throw error;
        }
    }
    
    async getSwapTransaction(
        quote: SwapQuote,
        userPublicKey: PublicKey,
        wrapUnwrapSol: boolean = true
    ): Promise<VersionedTransaction> {
        try {
            return await withRetry(async () => {
                const response = await this.client.post('/swap', {
                    quoteResponse: quote,
                    userPublicKey: userPublicKey.toString(),
                    wrapAndUnwrapSol: wrapUnwrapSol,
                    dynamicComputeUnitLimit: true,
                    prioritizationFeeLamports: 'auto',
                });
                
                if (!response.data || !response.data.swapTransaction) {
                    throw new Error('No swap transaction received');
                }
                
                // Deserialize the transaction
                const swapTransactionBuf = Buffer.from(response.data.swapTransaction, 'base64');
                const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
                
                logger.info({
                    userPublicKey: userPublicKey.toString(),
                    inputMint: quote.inputMint,
                    outputMint: quote.outputMint,
                }, 'Got swap transaction');
                
                return transaction;
            }, {
                maxRetries: 3,
                delay: 2000,
                onRetry: (error, attempt) => {
                    logger.warn({ error, attempt }, 'Jupiter swap request failed, retrying...');
                }
            });
        } catch (error) {
            logger.error({ error }, 'Failed to get swap transaction');
            throw error;
        }
    }
    
    async getTokenList(): Promise<Map<string, any>> {
        try {
            return await withRetry(async () => {
                const response = await axios.get('https://token.jup.ag/all');
                
                if (!response.data || !Array.isArray(response.data)) {
                    throw new Error('Invalid token list response');
                }
                
                const tokenMap = new Map<string, any>();
                
                for (const token of response.data) {
                    tokenMap.set(token.address, {
                        symbol: token.symbol,
                        name: token.name,
                        decimals: token.decimals,
                        logoURI: token.logoURI,
                        tags: token.tags || [],
                    });
                }
                
                logger.info({ count: tokenMap.size }, 'Loaded Jupiter token list');
                
                return tokenMap;
            }, {
                maxRetries: 3,
                delay: 2000,
            });
        } catch (error) {
            logger.error({ error }, 'Failed to get token list');
            throw error;
        }
    }
    
    async validateSwapRoute(
        inputMint: PublicKey,
        outputMint: PublicKey,
        amount: number
    ): Promise<boolean> {
        try {
            const quote = await this.getQuote(inputMint, outputMint, amount);
            
            // Check if route exists and price impact is acceptable
            const priceImpact = parseFloat(quote.priceImpactPct);
            const maxAcceptablePriceImpact = 5; // 5% max price impact
            
            if (priceImpact > maxAcceptablePriceImpact) {
                logger.warn({
                    inputMint: inputMint.toString(),
                    outputMint: outputMint.toString(),
                    priceImpact,
                    maxAcceptable: maxAcceptablePriceImpact,
                }, 'Price impact too high');
                return false;
            }
            
            // Check if output amount is reasonable
            const outputAmount = BigInt(quote.outAmount);
            if (outputAmount === 0n) {
                logger.warn({
                    inputMint: inputMint.toString(),
                    outputMint: outputMint.toString(),
                }, 'Zero output amount');
                return false;
            }
            
            return true;
        } catch (error) {
            logger.error({ error }, 'Failed to validate swap route');
            return false;
        }
    }
}