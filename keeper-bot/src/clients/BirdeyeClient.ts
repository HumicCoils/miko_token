import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config';

interface TokenPriceResponse {
  data: {
    value: number;
    updateUnixTime: number;
    updateHumanTime: string;
  };
  success: boolean;
}

interface TokenSearchResponse {
  data: {
    tokens: Array<{
      address: string;
      symbol: string;
      name: string;
      decimals: number;
      logoURI: string;
      volume24h: number;
      liquidity: number;
    }>;
  };
  success: boolean;
}

interface TokenInfoResponse {
  data: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    liquidity: number;
    volume24h: number;
    priceUsd: number;
  };
  success: boolean;
}

export class BirdeyeClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://public-api.birdeye.so',
      headers: {
        'X-API-KEY': config.BIRDEYE_API_KEY,
      },
      timeout: 30000,
    });
  }

  /**
   * Get current price of a token in USD
   */
  async getTokenPrice(tokenAddress: string): Promise<number> {
    try {
      const response = await this.client.get<TokenPriceResponse>('/defi/price', {
        params: {
          address: tokenAddress,
        },
      });

      if (!response.data.success) {
        throw new Error('Failed to get token price from Birdeye');
      }

      return response.data.data.value;
    } catch (error) {
      logger.error(`Failed to get price for token ${tokenAddress}:`, error);
      throw error;
    }
  }

  /**
   * Search tokens by symbol
   */
  async searchTokenBySymbol(symbol: string): Promise<Array<{address: string, volume24h: number}>> {
    try {
      const response = await this.client.get<TokenSearchResponse>('/defi/search', {
        params: {
          query: symbol,
          chain: 'solana',
        },
      });

      if (!response.data.success) {
        throw new Error(`Failed to search for symbol ${symbol}`);
      }

      // Filter tokens that match the exact symbol (case-insensitive)
      const matchingTokens = response.data.data.tokens
        .filter(token => token.symbol.toUpperCase() === symbol.toUpperCase())
        .map(token => ({
          address: token.address,
          volume24h: token.volume24h,
        }));

      return matchingTokens;
    } catch (error) {
      logger.error(`Failed to search for symbol ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get detailed token information
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenInfoResponse['data']> {
    try {
      const response = await this.client.get<TokenInfoResponse>('/defi/token_overview', {
        params: {
          address: tokenAddress,
        },
      });

      if (!response.data.success) {
        throw new Error('Failed to get token info from Birdeye');
      }

      return response.data.data;
    } catch (error) {
      logger.error(`Failed to get info for token ${tokenAddress}:`, error);
      throw error;
    }
  }

  /**
   * Validate if a token meets minimum requirements for rewards
   */
  async validateRewardToken(tokenAddress: string): Promise<boolean> {
    try {
      const tokenInfo = await this.getTokenInfo(tokenAddress);
      
      // Validation criteria
      const minLiquidity = 50000; // $50k minimum liquidity
      const minVolume = 10000;    // $10k daily volume
      
      if (tokenInfo.liquidity < minLiquidity) {
        logger.warn(`Token ${tokenAddress} has insufficient liquidity: $${tokenInfo.liquidity}`);
        return false;
      }
      
      if (tokenInfo.volume24h < minVolume) {
        logger.warn(`Token ${tokenAddress} has insufficient volume: $${tokenInfo.volume24h}`);
        return false;
      }
      
      logger.info(`Token ${tokenAddress} validated successfully:`, {
        symbol: tokenInfo.symbol,
        liquidity: tokenInfo.liquidity,
        volume24h: tokenInfo.volume24h,
      });
      
      return true;
    } catch (error) {
      logger.error(`Failed to validate token ${tokenAddress}:`, error);
      return false;
    }
  }
}