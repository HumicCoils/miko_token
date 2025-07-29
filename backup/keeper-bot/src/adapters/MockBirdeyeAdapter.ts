import { PublicKey, Keypair } from '@solana/web3.js';
import { 
  IBirdeyeAdapter, 
  TokenHolder, 
  TokenInfo, 
  TokenPrice, 
  TokenSearchResult 
} from '../interfaces/IBirdeyeAdapter';

interface MockTokenData {
  info: TokenInfo;
  holders: TokenHolder[];
}

export class MockBirdeyeAdapter implements IBirdeyeAdapter {
  private mockTokens: Map<string, MockTokenData> = new Map();
  private shouldFailNextRequest = false;
  private failureReason = '';

  constructor() {
    // Initialize with MIKO token mock data
    const mikoHolders = this.generateMockHolders(100, 0.001); // 100 holders, $0.001 per MIKO
    
    this.mockTokens.set('A9xZnPo2SvSgWiSxh4XApZyjyYRcH1ES8zTCvhzogYRE', {
      info: {
        address: 'A9xZnPo2SvSgWiSxh4XApZyjyYRcH1ES8zTCvhzogYRE',
        symbol: 'MIKO',
        name: 'MIKO Token',
        decimals: 9,
        supply: 1000000000,
        price: 0.001,
        marketCap: 1000000,
        volume24h: 100000,
        priceChange24h: 5.5,
        holders: 100
      },
      holders: mikoHolders
    });

    // Add some mock reward tokens
    this.addMockToken('So11111111111111111111111111111111111111112', 'SOL', 'Wrapped SOL', 100, 100000000);
    this.addMockToken('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'USDC', 'USD Coin', 1, 50000000);
    this.addMockToken('DummyToken1111111111111111111111111111111111', 'PEPE', 'Pepe Coin', 0.0001, 1000000);
    this.addMockToken('DummyToken2222222222222222222222222222222222', 'PEPE', 'Pepe Classic', 0.00005, 500000);
  }

  private generateMockHolders(count: number, tokenPrice: number): TokenHolder[] {
    const holders: TokenHolder[] = [];
    const totalSupply = 1000000000; // 1B MIKO
    
    for (let i = 0; i < count; i++) {
      // Generate varied balances - some above $100, some below
      const balance = Math.floor(Math.random() * 10000000) + 10000; // 10k to 10M tokens
      const usdValue = balance * tokenPrice;
      const percentage = (balance / totalSupply) * 100;
      
      holders.push({
        address: Keypair.generate().publicKey.toBase58(),
        balance,
        usdValue,
        percentage
      });
    }
    
    // Sort by balance descending
    return holders.sort((a, b) => b.balance - a.balance);
  }

  private addMockToken(
    address: string, 
    symbol: string, 
    name: string, 
    price: number, 
    volume24h: number
  ): void {
    const holders = this.generateMockHolders(50, price);
    const supply = 1000000000;
    
    this.mockTokens.set(address, {
      info: {
        address,
        symbol,
        name,
        decimals: symbol === 'USDC' ? 6 : 9,
        supply,
        price,
        marketCap: supply * price,
        volume24h,
        priceChange24h: (Math.random() - 0.5) * 20, // -10% to +10%
        holders: holders.length
      },
      holders
    });
  }

  async getTokenHolders(
    mint: PublicKey,
    minUsdValue: number,
    limit: number = 1000
  ): Promise<TokenHolder[]> {
    if (this.shouldFailNextRequest) {
      this.shouldFailNextRequest = false;
      throw new Error(this.failureReason || 'Mock Birdeye API failure');
    }

    const tokenData = this.mockTokens.get(mint.toBase58());
    if (!tokenData) {
      return [];
    }

    // Filter holders by minimum USD value
    const eligibleHolders = tokenData.holders
      .filter(holder => holder.usdValue >= minUsdValue)
      .slice(0, limit);

    console.log(`[MockBirdeye] Found ${eligibleHolders.length} holders with >= $${minUsdValue}`);
    
    return eligibleHolders;
  }

  async getTokenPrice(mint: PublicKey): Promise<TokenPrice | null> {
    const tokenData = this.mockTokens.get(mint.toBase58());
    if (!tokenData) {
      return null;
    }

    return {
      value: tokenData.info.price,
      updateUnixTime: Math.floor(Date.now() / 1000),
      updateSlot: 250000000
    };
  }

  async getTokenInfo(mint: PublicKey): Promise<TokenInfo | null> {
    const tokenData = this.mockTokens.get(mint.toBase58());
    return tokenData ? tokenData.info : null;
  }

  async searchTokensBySymbol(symbol: string): Promise<TokenSearchResult[]> {
    const results: TokenSearchResult[] = [];
    
    for (const [address, data] of this.mockTokens) {
      if (data.info.symbol.toUpperCase() === symbol.toUpperCase()) {
        results.push({
          address,
          symbol: data.info.symbol,
          name: data.info.name,
          decimals: data.info.decimals,
          volume24h: data.info.volume24h,
          liquidity: data.info.marketCap * 0.1 // Mock 10% of market cap as liquidity
        });
      }
    }

    console.log(`[MockBirdeye] Found ${results.length} tokens with symbol ${symbol}`);
    
    return results;
  }

  async getHighestVolumeToken(symbol: string): Promise<TokenSearchResult | null> {
    const tokens = await this.searchTokensBySymbol(symbol);
    
    if (tokens.length === 0) {
      return null;
    }

    // Sort by 24h volume descending
    tokens.sort((a, b) => b.volume24h - a.volume24h);
    
    const highest = tokens[0];
    console.log(`[MockBirdeye] Highest volume ${symbol}: ${highest.name} with $${highest.volume24h.toLocaleString()}`);
    
    return highest;
  }

  async getMultipleTokenPrices(mints: PublicKey[]): Promise<Map<string, TokenPrice>> {
    const prices = new Map<string, TokenPrice>();
    
    for (const mint of mints) {
      const price = await this.getTokenPrice(mint);
      if (price) {
        prices.set(mint.toBase58(), price);
      }
    }
    
    return prices;
  }

  // Test helper methods
  setTokenPrice(mint: string, newPrice: number): void {
    const tokenData = this.mockTokens.get(mint);
    if (tokenData) {
      tokenData.info.price = newPrice;
      tokenData.info.marketCap = tokenData.info.supply * newPrice;
      
      // Update holder USD values
      tokenData.holders.forEach(holder => {
        holder.usdValue = holder.balance * newPrice;
      });
    }
  }

  addMockHolder(mint: string, address: string, balance: number): void {
    const tokenData = this.mockTokens.get(mint);
    if (tokenData) {
      const usdValue = balance * tokenData.info.price;
      const percentage = (balance / tokenData.info.supply) * 100;
      
      tokenData.holders.push({
        address,
        balance,
        usdValue,
        percentage
      });
      
      tokenData.info.holders++;
    }
  }

  simulateApiFailure(reason: string): void {
    this.shouldFailNextRequest = true;
    this.failureReason = reason;
  }

  clearMockData(): void {
    this.mockTokens.clear();
  }
}