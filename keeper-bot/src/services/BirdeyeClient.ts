import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { withRetry } from '../utils/retry';

const logger = createLogger('BirdeyeClient');

export interface TokenInfo {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    price: string;
    mc: string;         // Market cap
    v24hUSD: string;    // 24h volume in USD
    liquidity: string;
    logoURI?: string;
}

export interface TokenDetails extends TokenInfo {
    totalSupply: string;
    priceChange24h: number;
    volumeChange24h: number;
    holders: number;
    createdAt: string;
}

export class BirdeyeClient {
    private client: AxiosInstance;
    
    constructor() {
        this.client = axios.create({
            baseURL: 'https://public-api.birdeye.so',
            headers: {
                'X-API-KEY': config.BIRDEYE_API_KEY,
                'Accept': 'application/json',
            },
            timeout: 30000,
        });
    }
    
    async searchTokensBySymbol(symbol: string, limit: number = 10): Promise<TokenInfo[]> {
        try {
            return await withRetry(async () => {
                const response = await this.client.get('/defi/search', {
                    params: {
                        query: symbol,
                        limit,
                    },
                });
                
                if (!response.data || !response.data.data) {
                    logger.warn({ symbol }, 'No tokens found for symbol');
                    return [];
                }
                
                const tokens: TokenInfo[] = response.data.data.map((token: any) => ({
                    address: token.address,
                    symbol: token.symbol,
                    name: token.name,
                    decimals: token.decimals || 9,
                    price: token.price || '0',
                    mc: token.mc || '0',
                    v24hUSD: token.v24hUSD || '0',
                    liquidity: token.liquidity || '0',
                    logoURI: token.logoURI,
                }));
                
                logger.info({ symbol, count: tokens.length }, 'Found tokens for symbol');
                
                return tokens;
            }, {
                maxRetries: 3,
                delay: 2000,
                onRetry: (error, attempt) => {
                    logger.warn({ error, attempt, symbol }, 'Birdeye API request failed, retrying...');
                }
            });
        } catch (error) {
            logger.error({ error, symbol }, 'Failed to search tokens by symbol');
            throw error;
        }
    }
    
    async findHighestVolumeToken(symbol: string): Promise<TokenInfo | null> {
        try {
            const tokens = await this.searchTokensBySymbol(symbol, 20);
            
            if (tokens.length === 0) {
                return null;
            }
            
            // Sort by 24h volume and market cap
            const sortedTokens = tokens.sort((a, b) => {
                const volumeA = parseFloat(a.v24hUSD) || 0;
                const volumeB = parseFloat(b.v24hUSD) || 0;
                
                // If volumes are close, consider market cap
                if (Math.abs(volumeA - volumeB) < 1000) {
                    const mcA = parseFloat(a.mc) || 0;
                    const mcB = parseFloat(b.mc) || 0;
                    return mcB - mcA;
                }
                
                return volumeB - volumeA;
            });
            
            const selected = sortedTokens[0];
            
            logger.info({
                symbol,
                selected: {
                    address: selected.address,
                    symbol: selected.symbol,
                    volume: selected.v24hUSD,
                    marketCap: selected.mc,
                }
            }, 'Selected highest volume token');
            
            return selected;
        } catch (error) {
            logger.error({ error, symbol }, 'Failed to find highest volume token');
            throw error;
        }
    }
    
    async getTokenDetails(address: string): Promise<TokenDetails> {
        try {
            return await withRetry(async () => {
                const response = await this.client.get(`/defi/token_overview`, {
                    params: {
                        address,
                    },
                });
                
                if (!response.data || !response.data.data) {
                    throw new Error(`Token not found: ${address}`);
                }
                
                const data = response.data.data;
                
                const details: TokenDetails = {
                    address: data.address,
                    symbol: data.symbol,
                    name: data.name,
                    decimals: data.decimals || 9,
                    price: data.price || '0',
                    mc: data.mc || '0',
                    v24hUSD: data.v24hUSD || '0',
                    liquidity: data.liquidity || '0',
                    logoURI: data.logoURI,
                    totalSupply: data.supply || '0',
                    priceChange24h: data.priceChange24h || 0,
                    volumeChange24h: data.volumeChange24h || 0,
                    holders: data.holder || 0,
                    createdAt: data.createdAt || new Date().toISOString(),
                };
                
                logger.info({ address, symbol: details.symbol }, 'Retrieved token details');
                
                return details;
            }, {
                maxRetries: 3,
                delay: 2000,
                onRetry: (error, attempt) => {
                    logger.warn({ error, attempt, address }, 'Birdeye API request failed, retrying...');
                }
            });
        } catch (error) {
            logger.error({ error, address }, 'Failed to get token details');
            throw error;
        }
    }
    
    async validateToken(address: string): Promise<boolean> {
        try {
            const details = await this.getTokenDetails(address);
            
            // Validation criteria
            const minLiquidity = 10000; // $10k minimum liquidity
            const minVolume = 5000;     // $5k minimum 24h volume
            const minHolders = 100;     // At least 100 holders
            
            const liquidity = parseFloat(details.liquidity) || 0;
            const volume = parseFloat(details.v24hUSD) || 0;
            const holders = details.holders || 0;
            
            const isValid = liquidity >= minLiquidity && 
                          volume >= minVolume && 
                          holders >= minHolders;
            
            logger.info({
                address,
                symbol: details.symbol,
                liquidity,
                volume,
                holders,
                isValid,
                criteria: { minLiquidity, minVolume, minHolders }
            }, 'Token validation result');
            
            return isValid;
        } catch (error) {
            logger.error({ error, address }, 'Failed to validate token');
            return false;
        }
    }
    
    async getMikoPrice(): Promise<number> {
        try {
            const details = await this.getTokenDetails(config.MIKO_TOKEN_MINT.toString());
            const price = parseFloat(details.price) || 0;
            
            logger.info({ 
                price, 
                marketCap: details.mc,
                volume24h: details.v24hUSD 
            }, 'Retrieved MIKO token price');
            
            return price;
        } catch (error) {
            logger.error({ error }, 'Failed to get MIKO token price');
            // Return a default price if unable to fetch
            return 0.01; // Default to $0.01
        }
    }
}