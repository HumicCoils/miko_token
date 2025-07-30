import { 
  Connection, 
  Keypair, 
  PublicKey, 
  LAMPORTS_PER_SOL,
  VersionedTransaction
} from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount
} from '@solana/spl-token';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const FORK_RPC = 'http://localhost:8899';
const NUM_WALLETS = 20;

interface TestWallet {
  keypair: Keypair;
  publicKey: PublicKey;
  mikoAta: PublicKey;
  mikoBalance: number;
  solBalance: number;
}

class SwapActivityGenerator {
  private connection: Connection;
  private testWallets: TestWallet[] = [];
  private mikoMint: PublicKey;
  private poolId: PublicKey;
  
  constructor() {
    this.connection = new Connection(FORK_RPC, 'confirmed');
  }
  
  async initialize() {
    // Load deployment info
    const deploymentPath = path.join(__dirname, '..', 'deployment-addresses.json');
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf-8'));
    
    this.mikoMint = new PublicKey(deployment.token.address);
    this.poolId = new PublicKey(deployment.pool.address);
    
    console.log('MIKO Mint:', this.mikoMint.toBase58());
    console.log('Pool ID:', this.poolId.toBase58());
  }
  
  async createTestWallets() {
    console.log(`\n📝 Creating ${NUM_WALLETS} test wallets...`);
    
    for (let i = 0; i < NUM_WALLETS; i++) {
      const keypair = Keypair.generate();
      const publicKey = keypair.publicKey;
      
      // Airdrop SOL
      const airdropSig = await this.connection.requestAirdrop(publicKey, 5 * LAMPORTS_PER_SOL);
      await this.connection.confirmTransaction(airdropSig);
      
      // Get ATA address
      const mikoAta = getAssociatedTokenAddressSync(
        this.mikoMint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      this.testWallets.push({
        keypair,
        publicKey,
        mikoAta,
        mikoBalance: 0,
        solBalance: 5 * LAMPORTS_PER_SOL
      });
      
      console.log(`Created wallet ${i + 1}: ${publicKey.toBase58()}`);
    }
    
    // Save wallets for reference
    const walletsPath = path.join(__dirname, 'test-wallets.json');
    const walletsData = this.testWallets.map(w => ({
      publicKey: w.publicKey.toBase58(),
      mikoAta: w.mikoAta.toBase58()
    }));
    fs.writeFileSync(walletsPath, JSON.stringify(walletsData, null, 2));
  }
  
  async fundWalletsWithMiko() {
    console.log('\n💰 Funding wallets with MIKO...');
    
    // Load deployer who has the initial MIKO supply
    const deployerPath = path.join(__dirname, '..', 'keypairs', 'deployer.json');
    const deployer = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync(deployerPath, 'utf-8')))
    );
    
    // Buy MIKO from pool for each wallet
    for (let i = 0; i < this.testWallets.length; i++) {
      const wallet = this.testWallets[i];
      
      try {
        // Use 1-2 SOL to buy MIKO
        const solAmount = (1 + Math.random()) * LAMPORTS_PER_SOL;
        
        // Swap SOL for MIKO using Raydium
        await this.swapSolForMiko(wallet, solAmount);
        
        // Update balance
        const tokenAccount = await getAccount(
          this.connection,
          wallet.mikoAta,
          'confirmed',
          TOKEN_2022_PROGRAM_ID
        );
        wallet.mikoBalance = Number(tokenAccount.amount);
        wallet.solBalance -= solAmount;
        
        console.log(`Wallet ${i + 1} bought MIKO: ${wallet.mikoBalance / 1e9} MIKO`);
      } catch (error) {
        console.log(`Failed to fund wallet ${i + 1}:`, error);
      }
    }
  }
  
  async generateSwapActivity() {
    console.log('\n🔄 Generating swap activity...');
    
    let swapCount = 0;
    const targetSwaps = 100;
    
    while (swapCount < targetSwaps) {
      // Randomly select 5-20 wallets
      const numActiveWallets = 5 + Math.floor(Math.random() * 16);
      const activeWallets = this.shuffleArray([...this.testWallets]).slice(0, numActiveWallets);
      
      for (const wallet of activeWallets) {
        try {
          // Randomly choose swap direction
          const swapMikoToSol = Math.random() > 0.5;
          
          if (swapMikoToSol && wallet.mikoBalance > 1000 * 1e9) {
            // Swap MIKO to SOL
            const mikoAmount = Math.floor(wallet.mikoBalance * (0.1 + Math.random() * 0.4));
            await this.swapMikoForSol(wallet, mikoAmount);
            
            console.log(`Swap ${swapCount + 1}: ${wallet.publicKey.toBase58().slice(0, 8)} swapped ${mikoAmount / 1e9} MIKO → SOL`);
          } else if (!swapMikoToSol && wallet.solBalance > 0.5 * LAMPORTS_PER_SOL) {
            // Swap SOL to MIKO
            const solAmount = Math.floor(wallet.solBalance * (0.1 + Math.random() * 0.4));
            await this.swapSolForMiko(wallet, solAmount);
            
            console.log(`Swap ${swapCount + 1}: ${wallet.publicKey.toBase58().slice(0, 8)} swapped ${solAmount / LAMPORTS_PER_SOL} SOL → MIKO`);
          }
          
          swapCount++;
          
          // Update balances
          await this.updateWalletBalance(wallet);
          
          if (swapCount >= targetSwaps) break;
        } catch (error) {
          console.log(`Swap failed:`, error);
        }
      }
      
      // Random delay between rounds
      await this.sleep(1000 + Math.random() * 2000);
    }
    
    console.log(`\n✅ Generated ${swapCount} swaps`);
  }
  
  private async swapSolForMiko(wallet: TestWallet, solAmount: number) {
    // Use actual Raydium or Jupiter router
    const useJupiter = Math.random() > 0.5;
    
    if (useJupiter) {
      await this.swapViaJupiter(
        wallet,
        new PublicKey('So11111111111111111111111111111111111112'),
        this.mikoMint,
        solAmount
      );
    } else {
      await this.swapViaRaydium(wallet, false, solAmount);
    }
  }
  
  private async swapMikoForSol(wallet: TestWallet, mikoAmount: number) {
    // Use actual Raydium or Jupiter router
    const useJupiter = Math.random() > 0.5;
    
    if (useJupiter) {
      await this.swapViaJupiter(
        wallet,
        this.mikoMint,
        new PublicKey('So11111111111111111111111111111111111112'),
        mikoAmount
      );
    } else {
      await this.swapViaRaydium(wallet, true, mikoAmount);
    }
  }
  
  private async swapViaJupiter(
    wallet: TestWallet,
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number
  ) {
    // Get quote from Jupiter API
    const quoteResponse = await axios.get('https://quote-api.jup.ag/v6/quote', {
      params: {
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        amount: amount.toString(),
        slippageBps: 100
      }
    });
    
    const quote = quoteResponse.data;
    
    // Get swap transaction
    const swapResponse = await axios.post('https://quote-api.jup.ag/v6/swap', {
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true
    });
    
    const swapTransactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    
    // Sign and send
    transaction.sign([wallet.keypair]);
    const signature = await this.connection.sendRawTransaction(transaction.serialize());
    await this.connection.confirmTransaction(signature);
  }
  
  private async swapViaRaydium(wallet: TestWallet, isMikoToSol: boolean, amount: number) {
    // Direct swap on Raydium CPMM pool
    // This would use the actual Raydium SDK or direct program calls
    // For now, using Jupiter which will route through Raydium
    if (isMikoToSol) {
      await this.swapViaJupiter(
        wallet,
        this.mikoMint,
        new PublicKey('So11111111111111111111111111111111111112'),
        amount
      );
    } else {
      await this.swapViaJupiter(
        wallet,
        new PublicKey('So11111111111111111111111111111111111112'),
        this.mikoMint,
        amount
      );
    }
  }
  
  private async updateWalletBalance(wallet: TestWallet) {
    // Update SOL balance
    wallet.solBalance = await this.connection.getBalance(wallet.publicKey);
    
    // Update MIKO balance
    try {
      const tokenAccount = await getAccount(
        this.connection,
        wallet.mikoAta,
        'confirmed',
        TOKEN_2022_PROGRAM_ID
      );
      wallet.mikoBalance = Number(tokenAccount.amount);
    } catch {
      wallet.mikoBalance = 0;
    }
  }
  
  private shuffleArray<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

async function main() {
  const generator = new SwapActivityGenerator();
  
  try {
    await generator.initialize();
    await generator.createTestWallets();
    await generator.fundWalletsWithMiko();
    await generator.generateSwapActivity();
    
    console.log('\n🎉 Swap activity generation complete!');
    console.log('Check accumulated fees and run keeper bot to harvest.');
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);