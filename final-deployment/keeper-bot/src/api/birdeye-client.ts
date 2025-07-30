import axios, { AxiosInstance } from 'axios';
import { Logger } from '../utils/logger';

interface TokenHolder {
  owner: string;
  balance: number;
  percentage: number;
}

interface TokenPrice {
  value: number;
  updateUnixTime: number;
  updateSlot: number;
}

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  volume24h: number;
  liquidity: number;
  price: number;
}

export class BirdeyeClient {
  private axios: AxiosInstance;
  private logger: Logger;
  private apiKey: string;
  private lastRequestTime: number = 0;
  private rateLimitMs: number;
  
  constructor(apiKey: string, logger: Logger) {
    this.apiKey = apiKey || process.env.BIRDEYE_API_KEY || '';
    this.logger = logger;
    this.rateLimitMs = 1000; // 1 second between requests
    
    if (!this.apiKey) {
      this.logger.warn('Birdeye API key not provided. Some features may not work.');
    }
    
    this.axios = axios.create({
      baseURL: 'https://public-api.birdeye.so',
      headers: {
        'X-API-KEY': this.apiKey,
        'Accept': 'application/json',
      },
      timeout: 30000,
    });
  }
  
  /**
   * Get token holders with balances
   */
  async getTokenHolders(tokenAddress: string, limit: number = 100): Promise<TokenHolder[]> {
    try {
      await this.enforceRateLimit();
      
      const response = await this.axios.get('/defi/v1/holders', {
        params: {
          address: tokenAddress,
          limit,
          sort_by: 'balance',
          sort_order: 'desc'
        }
      });
      
      if (!response.data?.data?.holders) {
        this.logger.warn('No holder data received from Birdeye');
        return [];
      }
      
      return response.data.data.holders.map((holder: any) => ({
        owner: holder.owner,
        balance: holder.balance * Math.pow(10, 9), // Convert to raw amount
        percentage: holder.percentage || 0
      }));
      
    } catch (error: any) {
      this.logger.error('Failed to get token holders', {
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }
  
  /**
   * Get token price in USD
   */
  async getTokenPrice(tokenAddress: string): Promise<number> {
    try {
      await this.enforceRateLimit();
      
      const response = await this.axios.get('/defi/v2/price', {
        params: {
          address: tokenAddress
        }
      });
      
      if (!response.data?.data?.value) {
        this.logger.warn('No price data received from Birdeye');
        return 0;
      }
      
      return response.data.data.value;
      
    } catch (error: any) {
      this.logger.error('Failed to get token price', {
        error: error.message,
        response: error.response?.data
      });
      return 0;
    }
  }
  
  /**
   * Search tokens by symbol and get the one with highest 24h volume
   */
  async getTokenBySymbolWithHighestVolume(symbol: string): Promise<TokenInfo | null> {
    try {
      await this.enforceRateLimit();
      
      // Remove $ from symbol if present
      const cleanSymbol = symbol.replace('$', '').toUpperCase();
      
      const response = await this.axios.get('/defi/v2/tokens/search', {
        params: {
          keyword: cleanSymbol,
          sort_by: 'volume24h',
          sort_order: 'desc',
          limit: 20
        }
      });
      
      if (!response.data?.data?.tokens || response.data.data.tokens.length === 0) {
        this.logger.warn('No tokens found for symbol', { symbol: cleanSymbol });
        return null;
      }
      
      // Filter tokens that match the exact symbol
      const matchingTokens = response.data.data.tokens.filter(
        (token: any) => token.symbol?.toUpperCase() === cleanSymbol
      );
      
      if (matchingTokens.length === 0) {
        this.logger.warn('No exact symbol matches found', { symbol: cleanSymbol });
        return null;
      }
      
      // Sort by 24h volume and take the highest
      const topToken = matchingTokens.sort((a: any, b: any) => 
        (b.volume24h || 0) - (a.volume24h || 0)
      )[0];
      
      this.logger.info('Found token with highest volume', {
        symbol: topToken.symbol,
        address: topToken.address,
        volume24h: topToken.volume24h,
        name: topToken.name
      });
      
      return {
        address: topToken.address,
        symbol: topToken.symbol,
        name: topToken.name,
        decimals: topToken.decimals || 9,
        volume24h: topToken.volume24h || 0,
        liquidity: topToken.liquidity || 0,
        price: topToken.price || 0
      };
      
    } catch (error: any) {
      this.logger.error('Failed to search tokens by symbol', {
        error: error.message,
        response: error.response?.data
      });
      return null;
    }
  }
  
  /**
   * Get token metadata
   */
  async getTokenMetadata(tokenAddress: string): Promise<any> {
    try {
      await this.enforceRateLimit();
      
      const response = await this.axios.get('/defi/v2/token/metadata', {
        params: {
          address: tokenAddress
        }
      });
      
      return response.data?.data || null;
      
    } catch (error: any) {
      this.logger.error('Failed to get token metadata', {
        error: error.message,
        response: error.response?.data
      });
      return null;
    }
  }
  
  /**
   * Get token market data
   */
  async getTokenMarketData(tokenAddress: string): Promise<any> {
    try {
      await this.enforceRateLimit();
      
      const response = await this.axios.get('/defi/v2/token/market_data', {
        params: {
          address: tokenAddress
        }
      });
      
      return response.data?.data || null;
      
    } catch (error: any) {
      this.logger.error('Failed to get token market data', {
        error: error.message,
        response: error.response?.data
      });
      return null;
    }
  }
  
  /**
   * Enforce rate limiting
   */
  private async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitMs) {
      const waitTime = this.rateLimitMs - timeSinceLastRequest;
      await this.sleep(waitTime);
    }
    
    this.lastRequestTime = Date.now();
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const testToken = 'So11111111111111111111111111111111111112'; // SOL
      const price = await this.getTokenPrice(testToken);
      
      if (price > 0) {
        this.logger.info('Birdeye API connection successful', { solPrice: price });
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('Birdeye API connection test failed', error);
      return false;
    }
  }
}