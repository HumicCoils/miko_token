import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { IJupiterAdapter, SwapParams, SwapQuote, SwapResult } from '../interfaces/IJupiterAdapter';

interface MockTokenPrice {
  mint: string;
  price: number;
  decimals: number;
}

export class MockJupiterAdapter implements IJupiterAdapter {
  private mockPrices: Map<string, MockTokenPrice> = new Map();
  private mockSwapHistory: SwapResult[] = [];
  private marketVolatility: Map<string, number> = new Map(); // Track volatility per token pair
  private liquidityDepth: Map<string, number> = new Map(); // Track available liquidity
  
  // Fee-exempt addresses (keeper, treasury, etc.)
  private feeExemptAddresses = new Set([
    '5E8kjrFSVugkU9tv378uEYQ78DNp9z2MLY2fjSU5E3Ju', // Keeper wallet
    '5ave8hWx7ZqJr6yrzA2f3DwBa6APRDMYzuLZSU8FKv9D', // Owner wallet
    'Ei9vqjqic5S4cdTyDu98ENc933ub4HJMgAXJ6amnDFCH'  // Treasury wallet
  ]);

  constructor() {
    // Initialize with realistic mainnet-like prices
    this.mockPrices.set('So11111111111111111111111111111111111111112', {
      mint: 'So11111111111111111111111111111111111111112',
      price: 100, // SOL at $100
      decimals: 9
    });
    
    this.mockPrices.set('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      price: 1, // USDC at $1
      decimals: 6
    });
    
    this.mockPrices.set('A9xZnPo2SvSgWiSxh4XApZyjyYRcH1ES8zTCvhzogYRE', {
      mint: 'A9xZnPo2SvSgWiSxh4XApZyjyYRcH1ES8zTCvhzogYRE',
      price: 0.001, // MIKO at $0.001
      decimals: 9
    });
    
    // Initialize default volatility (0-1 scale, 0.1 = 10% volatility)
    this.marketVolatility.set('SOL-USDC', 0.02); // 2% volatility
    this.marketVolatility.set('MIKO-SOL', 0.15); // 15% volatility for new token
    
    // Initialize liquidity depth (in USD)
    this.liquidityDepth.set('SOL-USDC', 10000000); // $10M liquidity
    this.liquidityDepth.set('MIKO-SOL', 100000); // $100K liquidity
  }

  async getQuote(params: SwapParams): Promise<SwapQuote> {
    const inputPrice = this.mockPrices.get(params.inputMint.toBase58());
    const outputPrice = this.mockPrices.get(params.outputMint.toBase58());

    if (!inputPrice || !outputPrice) {
      throw new Error('Token prices not found in mock data');
    }

    // Calculate swap amounts with realistic price impact
    const inputValue = params.amount * inputPrice.price / Math.pow(10, inputPrice.decimals);
    
    // Calculate price impact based on trade size vs liquidity
    const pairKey = `${params.inputMint.toBase58().slice(0, 4)}-${params.outputMint.toBase58().slice(0, 4)}`;
    const liquidity = this.liquidityDepth.get(pairKey) || 1000000;
    const priceImpactPct = Math.min((inputValue / liquidity) * 100, 50); // Cap at 50%
    
    // Calculate volatility-adjusted slippage
    const volatility = this.marketVolatility.get(pairKey) || 0.05;
    const dynamicSlippage = Math.max(params.slippageBps / 10000, volatility);
    
    // Apply price impact and slippage
    const baseOutputValue = inputValue / outputPrice.price;
    const priceImpactMultiplier = 1 - (priceImpactPct / 100);
    const outputAmount = baseOutputValue * Math.pow(10, outputPrice.decimals) * priceImpactMultiplier;
    
    // Mock route
    const route = [{
      inToken: params.inputMint.toBase58(),
      outToken: params.outputMint.toBase58(),
      amount: params.amount,
      outAmount: Math.floor(outputAmount),
      priceImpactPct: priceImpactPct, // Mock 0.5% price impact
      marketInfos: [{
        id: 'mock-market-1',
        label: 'Mock DEX',
        inputMint: params.inputMint.toBase58(),
        outputMint: params.outputMint.toBase58(),
        notEnoughLiquidity: false,
        inAmount: params.amount,
        outAmount: Math.floor(outputAmount),
        priceImpactPct: priceImpactPct,
        fee: {
          amount: params.amount * 0.0025, // 0.25% fee
          mint: params.inputMint.toBase58(),
          pct: 0.25
        }
      }]
    }];

    console.log(`[MockJupiter] Quote: ${params.amount} ${params.inputMint.toBase58().slice(0, 8)} → ${Math.floor(outputAmount)} ${params.outputMint.toBase58().slice(0, 8)}`);
    console.log(`[MockJupiter] Price impact: ${priceImpactPct.toFixed(2)}%, Dynamic slippage: ${(dynamicSlippage * 100).toFixed(2)}%`);

    return {
      inputMint: params.inputMint,
      inAmount: params.amount,
      outputMint: params.outputMint,
      outAmount: Math.floor(outputAmount),
      otherAmountThreshold: Math.floor(outputAmount * (1 - params.slippageBps / 10000)),
      swapMode: 'ExactIn',
      slippageBps: params.slippageBps,
      platformFee: null,
      priceImpactPct: priceImpactPct,
      routePlan: route,
      contextSlot: 250000000, // Mock slot
      timeTaken: 100 // Mock 100ms
    };
  }

  async swap(quote: SwapQuote, userPublicKey: PublicKey): Promise<SwapResult> {
    // Simulate realistic swap failures based on market conditions
    
    // Check for excessive price impact (like mainnet Jupiter)
    if (quote.priceImpactPct > 15) {
      throw new Error(`Price impact too high: ${quote.priceImpactPct.toFixed(2)}%. Try smaller amount or increase slippage.`);
    }
    
    // Check for insufficient liquidity
    if (quote.priceImpactPct > 10) {
      // 30% chance of failure due to liquidity issues
      if (Math.random() < 0.3) {
        throw new Error('Insufficient liquidity for swap. Try a smaller amount.');
      }
    }
    
    // Simulate slippage based on whether wallet is fee-exempt
    const isFeeExempt = this.feeExemptAddresses.has(userPublicKey.toBase58());
    
    let actualSlippage: number;
    if (isFeeExempt) {
      // Fee-exempt wallets only experience market volatility (minimal)
      actualSlippage = Math.random() * 0.003; // 0-0.3% for fee-exempt
    } else {
      // Normal wallets must account for 5% MIKO transfer fee + volatility
      // If they didn't set high enough slippage, the swap will fail
      const hasMikoToken = quote.inputMint.toBase58() === 'A9xZnPo2SvSgWiSxh4XApZyjyYRcH1ES8zTCvhzogYRE' ||
                          quote.outputMint.toBase58() === 'A9xZnPo2SvSgWiSxh4XApZyjyYRcH1ES8zTCvhzogYRE';
      
      if (hasMikoToken) {
        // MIKO swaps need to account for 5% transfer fee
        actualSlippage = 0.05 + (Math.random() * 0.02); // 5-7% for MIKO swaps
      } else {
        // Non-MIKO swaps have normal slippage
        actualSlippage = Math.random() * 0.02; // 0-2% for other tokens
      }
    }
    
    const maxSlippage = quote.slippageBps / 10000;
    if (actualSlippage > maxSlippage) {
      throw new Error(`Slippage tolerance exceeded. Expected: ${(maxSlippage * 100).toFixed(2)}%, Actual: ${(actualSlippage * 100).toFixed(2)}%`);
    }

    // Create mock transaction
    const transaction = new Transaction();
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: userPublicKey,
        toPubkey: userPublicKey, // Mock transfer to self
        lamports: 1,
      })
    );

    const result: SwapResult = {
      inputMint: quote.inputMint,
      inAmount: quote.inAmount,
      outputMint: quote.outputMint,
      outAmount: quote.outAmount,
      transaction,
      signers: [],
      txid: `mock-tx-${Date.now()}`,
      confirmed: true,
      slot: 250000001
    };

    this.mockSwapHistory.push(result);

    console.log(`[MockJupiter] Swap executed: ${result.txid}`);
    console.log(`[MockJupiter] Input: ${result.inAmount} ${result.inputMint.toBase58().slice(0, 8)}`);
    console.log(`[MockJupiter] Output: ${result.outAmount} ${result.outputMint.toBase58().slice(0, 8)}`);

    return result;
  }

  async getTokenPrice(mint: PublicKey): Promise<number | null> {
    const priceData = this.mockPrices.get(mint.toBase58());
    return priceData ? priceData.price : null;
  }

  async getTokenList(): Promise<Array<{
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
  }>> {
    return [
      {
        address: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Wrapped SOL',
        decimals: 9,
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
      },
      {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
      },
      {
        address: 'A9xZnPo2SvSgWiSxh4XApZyjyYRcH1ES8zTCvhzogYRE',
        symbol: 'MIKO',
        name: 'MIKO Token',
        decimals: 9
      }
    ];
  }

  // Helper methods for realistic market simulation
  setTokenPrice(mint: string, price: number, decimals: number = 9): void {
    this.mockPrices.set(mint, { mint, price, decimals });
  }

  getSwapHistory(): SwapResult[] {
    return this.mockSwapHistory;
  }

  clearSwapHistory(): void {
    this.mockSwapHistory = [];
  }
  
  // Simulate market conditions (for testing different scenarios)
  setMarketVolatility(pair: string, volatility: number): void {
    this.marketVolatility.set(pair, volatility);
  }
  
  setLiquidityDepth(pair: string, depth: number): void {
    this.liquidityDepth.set(pair, depth);
  }
}