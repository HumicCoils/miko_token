import axios, { AxiosInstance } from 'axios';
import { Logger } from '../utils/logger';

interface PriceData {
  price: number;
  confidence: number;
  expo: number;
  publishTime: number;
}

export class PythClient {
  private axios: AxiosInstance;
  private logger: Logger;
  private endpoint: string;
  
  // Pyth price feed IDs (mainnet)
  private readonly PRICE_FEEDS = {
    SOL: 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG',
    USDC: 'Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD',
    BTC: 'GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU',
    ETH: 'JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB',
  };
  
  constructor(endpoint: string, logger: Logger) {
    this.endpoint = endpoint || process.env.PYTH_ENDPOINT || 'https://hermes.pyth.network';
    this.logger = logger;
    
    this.axios = axios.create({
      baseURL: this.endpoint,
      headers: {
        'Accept': 'application/json',
      },
      timeout: 10000,
    });
  }
  
  /**
   * Get SOL price in USD
   */
  async getSolPrice(): Promise<number> {
    return this.getPrice(this.PRICE_FEEDS.SOL);
  }
  
  /**
   * Get price for a specific feed
   */
  async getPrice(feedId: string): Promise<number> {
    try {
      const response = await this.axios.get('/api/latest_price_feeds', {
        params: {
          ids: [feedId]
        }
      });
      
      if (!response.data || !response.data[0]) {
        this.logger.error('No price data received from Pyth');
        return 0;
      }
      
      const priceData = response.data[0];
      const price = this.parsePriceData(priceData);
      
      this.logger.debug('Price fetched from Pyth', {
        feedId,
        price,
        confidence: price.confidence,
        publishTime: new Date(price.publishTime * 1000).toISOString()
      });
      
      return price.price;
      
    } catch (error: any) {
      this.logger.error('Failed to get price from Pyth', {
        error: error.message,
        feedId,
        response: error.response?.data
      });
      
      // Fallback to backup endpoint if available
      if (process.env.PYTH_BACKUP_ENDPOINT) {
        return this.getPriceFromBackup(feedId);
      }
      
      return 0;
    }
  }
  
  /**
   * Get multiple prices at once
   */
  async getMultiplePrices(feedIds: string[]): Promise<Map<string, number>> {
    try {
      const response = await this.axios.get('/api/latest_price_feeds', {
        params: {
          ids: feedIds
        }
      });
      
      const prices = new Map<string, number>();
      
      if (!response.data || !Array.isArray(response.data)) {
        this.logger.error('Invalid response from Pyth multi-price endpoint');
        return prices;
      }
      
      for (const priceData of response.data) {
        const parsed = this.parsePriceData(priceData);
        if (priceData.id) {
          prices.set(priceData.id, parsed.price);
        }
      }
      
      return prices;
      
    } catch (error: any) {
      this.logger.error('Failed to get multiple prices from Pyth', {
        error: error.message,
        feedIds
      });
      return new Map();
    }
  }
  
  /**
   * Parse price data from Pyth response
   */
  private parsePriceData(data: any): PriceData {
    const priceInfo = data.price || data.current || {};
    
    // Pyth prices come with an exponent
    const rawPrice = parseFloat(priceInfo.price || '0');
    const expo = parseInt(priceInfo.expo || '0');
    const confidence = parseFloat(priceInfo.conf || '0');
    const publishTime = parseInt(priceInfo.publish_time || '0');
    
    // Apply exponent to get actual price
    const actualPrice = rawPrice * Math.pow(10, expo);
    
    return {
      price: actualPrice,
      confidence: confidence * Math.pow(10, expo),
      expo,
      publishTime
    };
  }
  
  /**
   * Get price from backup endpoint
   */
  private async getPriceFromBackup(feedId: string): Promise<number> {
    try {
      const backupEndpoint = process.env.PYTH_BACKUP_ENDPOINT;
      if (!backupEndpoint) {
        return 0;
      }
      
      const response = await axios.get(`${backupEndpoint}/api/latest_price_feeds`, {
        params: { ids: [feedId] },
        timeout: 5000
      });
      
      if (response.data && response.data[0]) {
        const price = this.parsePriceData(response.data[0]);
        this.logger.info('Price fetched from backup endpoint', {
          feedId,
          price: price.price
        });
        return price.price;
      }
      
      return 0;
    } catch (error) {
      this.logger.error('Backup price fetch failed', error);
      return 0;
    }
  }
  
  /**
   * Check if price data is stale
   */
  isPriceStale(publishTime: number, maxAgeSeconds: number = 60): boolean {
    const now = Math.floor(Date.now() / 1000);
    return (now - publishTime) > maxAgeSeconds;
  }
  
  /**
   * Get all available price feeds
   */
  getAvailableFeeds(): Record<string, string> {
    return { ...this.PRICE_FEEDS };
  }
  
  /**
   * Test connection to Pyth
   */
  async testConnection(): Promise<boolean> {
    try {
      const price = await this.getSolPrice();
      
      if (price > 0) {
        this.logger.info('Pyth connection successful', { solPrice: price });
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('Pyth connection test failed', error);
      return false;
    }
  }
}