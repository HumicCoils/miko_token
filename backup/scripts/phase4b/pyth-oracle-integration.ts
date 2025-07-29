import { Connection, PublicKey } from '@solana/web3.js';
import { createLogger } from '../../keeper-bot/src/utils/logger';
import { parsePriceData, PriceData as PythPriceData, PriceStatus } from '@pythnetwork/client';

const logger = createLogger('PythOracle');

// Pyth Network SOL/USD price feed account on Solana mainnet
const SOL_USD_PRICE_FEED_ACCOUNT = new PublicKey('H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG');

export interface PriceData {
  price: number;
  confidence: number;
  exponent: number;
  timestamp: number;
  slot: number;
  status: 'trading' | 'halted' | 'unknown';
}

export class PythOracleIntegration {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Fetch SOL/USD price from Pyth oracle
   */
  async fetchSOLPrice(): Promise<PriceData> {
    logger.info('Fetching SOL/USD price from Pyth oracle...');
    
    try {
      // Fetch the price feed account
      const accountInfo = await this.connection.getAccountInfo(SOL_USD_PRICE_FEED_ACCOUNT);
      
      if (!accountInfo) {
        throw new Error('Price feed account not found');
      }

      // Parse using official Pyth SDK
      const currentSlot = await this.connection.getSlot();
      const pythPriceData = parsePriceData(accountInfo.data, currentSlot);
      
      if (!pythPriceData.price || !pythPriceData.confidence) {
        throw new Error('Invalid price data from Pyth');
      }

      // Convert to decimal price
      const price = pythPriceData.price;
      const confidence = pythPriceData.confidence;
      const exponent = pythPriceData.exponent;
      
      // Calculate decimal price
      const decimalPrice = Number(price) * Math.pow(10, exponent);
      const decimalConfidence = Number(confidence) * Math.pow(10, exponent);
      
      // Estimate timestamp from slot
      // Solana produces ~2.5 blocks per second
      const slotDiff = currentSlot - Number(pythPriceData.validSlot);
      const ageSeconds = slotDiff * 0.4; // ~400ms per slot
      const timestamp = Date.now() - (ageSeconds * 1000);
      
      // Determine status
      let status: 'trading' | 'halted' | 'unknown' = 'unknown';
      if (pythPriceData.status === PriceStatus.Trading) {
        status = 'trading';
      } else if (pythPriceData.status === PriceStatus.Halted) {
        status = 'halted';
      }

      const priceData: PriceData = {
        price: decimalPrice,
        confidence: decimalConfidence,
        exponent,
        timestamp,
        slot: Number(pythPriceData.validSlot),
        status,
      };

      logger.info('SOL/USD price fetched successfully:', {
        price: `$${decimalPrice.toFixed(2)}`,
        confidence: `±$${decimalConfidence.toFixed(2)}`,
        age: `${ageSeconds.toFixed(1)}s`,
        status: priceData.status,
      });

      return priceData;

    } catch (error) {
      logger.error('Failed to fetch price from Pyth oracle', { error });
      throw error;
    }
  }

  /**
   * Verify price is fresh and trading
   */
  validatePrice(priceData: PriceData, maxAgeSeconds: number = 60): boolean {
    const ageSeconds = (Date.now() - priceData.timestamp) / 1000;
    
    if (ageSeconds > maxAgeSeconds) {
      logger.warn(`Price is stale: ${ageSeconds.toFixed(1)}s old (max: ${maxAgeSeconds}s)`);
      return false;
    }

    if (priceData.status !== 'trading') {
      logger.warn(`Price status is not trading: ${priceData.status}`);
      return false;
    }

    if (priceData.price <= 0) {
      logger.warn(`Invalid price: $${priceData.price}`);
      return false;
    }

    // Check confidence interval (should be < 1% of price for good quality)
    const confidencePercent = (priceData.confidence / priceData.price) * 100;
    if (confidencePercent > 1) {
      logger.warn(`High confidence interval: ${confidencePercent.toFixed(2)}% of price`);
    }

    return true;
  }

  /**
   * Monitor price updates
   */
  async monitorPrice(callback: (price: PriceData) => void, intervalMs: number = 5000): Promise<() => void> {
    let isRunning = true;
    
    const monitor = async () => {
      while (isRunning) {
        try {
          const priceData = await this.fetchSOLPrice();
          if (this.validatePrice(priceData)) {
            callback(priceData);
          }
        } catch (error) {
          logger.error('Error in price monitor', { error });
        }
        
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    };

    // Start monitoring in background
    monitor().catch(error => {
      logger.error('Price monitor crashed', { error });
    });

    // Return stop function
    return () => {
      isRunning = false;
      logger.info('Price monitor stopped');
    };
  }
}

// Alternative: Switchboard Oracle Integration
export class SwitchboardOracleIntegration {
  private connection: Connection;
  
  // Switchboard SOL/USD feed on mainnet
  private readonly SOL_USD_FEED = new PublicKey('GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR');

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async fetchSOLPrice(): Promise<PriceData> {
    logger.info('Fetching SOL/USD price from Switchboard oracle...');
    
    // Note: This is a simplified implementation
    // In production, use the official Switchboard SDK
    
    try {
      const accountInfo = await this.connection.getAccountInfo(this.SOL_USD_FEED);
      if (!accountInfo) {
        throw new Error('Switchboard feed account not found');
      }

      // Parse aggregator account data
      // This is a simplified example - real implementation needs proper deserialization
      const data = accountInfo.data;
      
      // Switchboard v2 aggregator layout (simplified)
      const latestRoundOffset = 128; // Offset to latest round data
      const price = data.readDoubleLE(latestRoundOffset);
      const timestamp = data.readBigInt64LE(latestRoundOffset + 8);
      
      return {
        price,
        confidence: price * 0.001, // Estimate 0.1% confidence
        exponent: 0,
        timestamp: Number(timestamp) * 1000,
        slot: await this.connection.getSlot(),
        status: 'trading',
      };
      
    } catch (error) {
      logger.error('Failed to fetch price from Switchboard', { error });
      throw error;
    }
  }
}