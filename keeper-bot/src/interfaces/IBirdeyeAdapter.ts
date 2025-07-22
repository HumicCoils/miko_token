import { PublicKey } from '@solana/web3.js';

export interface TokenHolder {
  address: string;
  balance: number;
  usdValue: number;
  percentage: number;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  supply: number;
  price: number;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  holders: number;
}

export interface TokenPrice {
  value: number;
  updateUnixTime: number;
  updateSlot: number;
}

export interface TokenSearchResult {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  volume24h: number;
  liquidity: number;
}

export interface IBirdeyeAdapter {
  // Get token holders with balance >= minUsdValue
  getTokenHolders(
    mint: PublicKey,
    minUsdValue: number,
    limit?: number
  ): Promise<TokenHolder[]>;

  // Get token price
  getTokenPrice(mint: PublicKey): Promise<TokenPrice | null>;

  // Get detailed token info
  getTokenInfo(mint: PublicKey): Promise<TokenInfo | null>;

  // Search tokens by symbol
  searchTokensBySymbol(symbol: string): Promise<TokenSearchResult[]>;

  // Get token with highest 24h volume for a symbol
  getHighestVolumeToken(symbol: string): Promise<TokenSearchResult | null>;

  // Get multiple token prices in batch
  getMultipleTokenPrices(mints: PublicKey[]): Promise<Map<string, TokenPrice>>;
}