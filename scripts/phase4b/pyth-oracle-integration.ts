import { Connection, PublicKey } from '@solana/web3.js';
import { createLogger } from '../../keeper-bot/src/utils/logger';
import BN from 'bn.js';

const logger = createLogger('PythOracle');

// Pyth Network SOL/USD price feed account on Solana mainnet
const SOL_USD_PRICE_FEED_ACCOUNT = new PublicKey('H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG');

// Pyth price account structure offsets
const MAGIC_OFFSET = 0;
const VERSION_OFFSET = 4;
const ACCOUNT_TYPE_OFFSET = 8;
const PRICE_TYPE_OFFSET = 12;
const EXPONENT_OFFSET = 16;
const NUM_COMPONENTS_OFFSET = 20;
const LAST_SLOT_OFFSET = 24;
const VALID_SLOT_OFFSET = 32;
const PRODUCT_OFFSET = 40;
const NEXT_OFFSET = 48;
const PREVIOUS_SLOT_OFFSET = 56;
const PREVIOUS_PRICE_OFFSET = 64;
const PREVIOUS_CONFIDENCE_OFFSET = 72;
const PREVIOUS_TIMESTAMP_OFFSET = 80;
const AGGREGATE_PRICE_OFFSET = 88;
const AGGREGATE_CONFIDENCE_OFFSET = 96;
const AGGREGATE_STATUS_OFFSET = 104;
const AGGREGATE_CORPORATE_ACTION_OFFSET = 108;
const AGGREGATE_PUBLISH_SLOT_OFFSET = 112;

// Constants
const PRICE_ACCOUNT_SIZE = 3312;
const MAGIC_NUMBER = 0xa1b2c3d4;
const VERSION_2 = 2;
const PRICE_ACCOUNT_TYPE = 3;

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

      if (accountInfo.data.length !== PRICE_ACCOUNT_SIZE) {
        throw new Error(`Invalid price account size: ${accountInfo.data.length}`);
      }

      // Parse the price data
      const data = accountInfo.data;
      
      // Verify magic number and version
      const magic = data.readUInt32LE(MAGIC_OFFSET);
      if (magic !== MAGIC_NUMBER) {
        throw new Error(`Invalid magic number: ${magic.toString(16)}`);
      }

      const version = data.readUInt32LE(VERSION_OFFSET);
      if (version !== VERSION_2) {
        throw new Error(`Unsupported version: ${version}`);
      }

      const accountType = data.readUInt32LE(ACCOUNT_TYPE_OFFSET);
      if (accountType !== PRICE_ACCOUNT_TYPE) {
        throw new Error(`Invalid account type: ${accountType}`);
      }

      // Extract price data
      const exponent = data.readInt32LE(EXPONENT_OFFSET);
      const priceComponent = data.readBigInt64LE(AGGREGATE_PRICE_OFFSET);
      const confidenceComponent = data.readBigUInt64LE(AGGREGATE_CONFIDENCE_OFFSET);
      const status = data.readUInt32LE(AGGREGATE_STATUS_OFFSET);
      const publishSlot = data.readBigUInt64LE(AGGREGATE_PUBLISH_SLOT_OFFSET);
      
      // Convert price to decimal
      const price = Number(priceComponent) * Math.pow(10, exponent);
      const confidence = Number(confidenceComponent) * Math.pow(10, exponent);
      
      // Get current slot for timestamp estimation
      const currentSlot = await this.connection.getSlot();
      const slotDiff = currentSlot - Number(publishSlot);
      const estimatedAge = slotDiff * 0.4; // ~400ms per slot
      const timestamp = Date.now() - (estimatedAge * 1000);

      const priceData: PriceData = {
        price,
        confidence,
        exponent,
        timestamp,
        slot: Number(publishSlot),
        status: this.getStatusString(status),
      };

      logger.info('SOL/USD price fetched successfully:', {
        price: `$${price.toFixed(2)}`,
        confidence: `±$${confidence.toFixed(2)}`,
        slot: publishSlot.toString(),
        age: `${estimatedAge.toFixed(1)}s`,
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
   * Get status string from status code
   */
  private getStatusString(status: number): 'trading' | 'halted' | 'unknown' {
    switch (status) {
      case 1: return 'trading';
      case 2: return 'halted';
      default: return 'unknown';
    }
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