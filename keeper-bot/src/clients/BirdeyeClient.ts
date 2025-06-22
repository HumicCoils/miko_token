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

interface TokenInfoResponse {
  data: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    liquidity: number;
    volume24h: number;
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

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`Birdeye API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Birdeye API Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`Birdeye API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error('Birdeye API Response Error:', error);
        return Promise.reject(error);
      }
    );
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
   * Get token information including liquidity and volume
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

  /**
   * Get multiple token prices in batch
   */
  async getMultipleTokenPrices(tokenAddresses: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    
    // Birdeye API has rate limits, so process in batches
    const batchSize = 10;
    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      const batch = tokenAddresses.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (address) => {
          try {
            const price = await this.getTokenPrice(address);
            prices.set(address, price);
          } catch (error) {
            logger.error(`Failed to get price for ${address}:`, error);
            prices.set(address, 0);
          }
        })
      );
      
      // Rate limit: wait 100ms between batches
      if (i + batchSize < tokenAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return prices;
  }
}