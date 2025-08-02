import { 
  Connection, 
  Keypair, 
  PublicKey, 
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount
} from '@solana/spl-token';
import { Raydium, TxVersion, CurveCalculator } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
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
  private mikoMint!: PublicKey;
  private poolId!: PublicKey;
  private raydium!: Raydium;
  
  constructor() {
    this.connection = new Connection(FORK_RPC, 'confirmed');
  }
  
  async initialize() {
    // Load deployment info
    const deploymentPath = path.join(__dirname, '..', 'config', 'deployment-state.json');
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf-8'));
    
    this.mikoMint = new PublicKey(deployment.token_mint);
    this.poolId = new PublicKey(deployment.pool_id);
    
    console.log('MIKO Mint:', this.mikoMint.toBase58());
    console.log('Pool ID:', this.poolId.toBase58());
    
    // Initialize Raydium SDK
    console.log('Initializing Raydium SDK...');
    this.raydium = await Raydium.load({
      connection: this.connection,
      owner: Keypair.generate(), // Temporary keypair for SDK initialization
      cluster: 'devnet',
      disableFeatureCheck: true,
      disableLoadToken: false,
      blockhashCommitment: 'confirmed',
    });
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
    const deployerPath = path.join(__dirname, '..', 'keypairs', 'deployer-keypair.json');
    const deployer = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync(deployerPath, 'utf-8')))
    );
    
    // Buy MIKO from pool for each wallet
    for (let i = 0; i < this.testWallets.length; i++) {
      const wallet = this.testWallets[i];
      
      try {
        // Use 1-2 SOL to buy MIKO
        const solAmount = Math.floor((1 + Math.random()) * LAMPORTS_PER_SOL);
        
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
    await this.swapOnRaydium(
      wallet,
      new PublicKey('So11111111111111111111111111111111111111112'), // SOL
      this.mikoMint,
      solAmount
    );
  }
  
  private async swapMikoForSol(wallet: TestWallet, mikoAmount: number) {
    await this.swapOnRaydium(
      wallet,
      this.mikoMint,
      new PublicKey('So11111111111111111111111111111111111111112'), // SOL
      mikoAmount
    );
  }
  
  private async swapOnRaydium(
    wallet: TestWallet,
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number
  ) {
    try {
      // Create Raydium instance for this wallet
      const walletRaydium = await Raydium.load({
        connection: this.connection,
        owner: wallet.keypair,
        cluster: 'devnet',
        disableFeatureCheck: true,
        disableLoadToken: false,
        blockhashCommitment: 'confirmed',
      });
      
      // Get pool information from RPC
      const data = await walletRaydium.cpmm.getPoolInfoFromRpc(this.poolId.toBase58());
      const poolInfo = data.poolInfo;
      const poolKeys = data.poolKeys;
      const rpcData = data.rpcData;
      
      // Determine if we're swapping base token or quote token
      const baseIn = inputMint.toBase58() === poolInfo.mintA.address;
      
      // Create BN for amount
      const inputAmount = new BN(amount.toString());
      
      // Calculate swap output using CurveCalculator
      const swapResult = CurveCalculator.swap(
        inputAmount,
        baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
        baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
        rpcData.configInfo!.tradeFeeRate
      );
      
      // Check output token account
      const outputTokenProgram = outputMint.equals(new PublicKey('So11111111111111111111111111111111111111112')) 
        ? TOKEN_PROGRAM_ID 
        : TOKEN_2022_PROGRAM_ID;
      
      const userOutputATA = getAssociatedTokenAddressSync(
        outputMint,
        wallet.publicKey,
        false,
        outputTokenProgram
      );
      
      // Pre-create output ATA if needed
      let createATANeeded = false;
      try {
        await getAccount(this.connection, userOutputATA, undefined, outputTokenProgram);
      } catch {
        createATANeeded = true;
      }
      
      if (createATANeeded) {
        const createATATx = new Transaction();
        createATATx.add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            userOutputATA,
            wallet.publicKey,
            outputMint,
            outputTokenProgram
          )
        );
        
        const { blockhash } = await this.connection.getLatestBlockhash();
        createATATx.recentBlockhash = blockhash;
        createATATx.feePayer = wallet.publicKey;
        
        await sendAndConfirmTransaction(
          this.connection,
          createATATx,
          [wallet.keypair],
          { commitment: 'confirmed' }
        );
      }
      
      // Build and execute the swap transaction
      const { execute } = await walletRaydium.cpmm.swap({
        poolInfo,
        poolKeys,
        inputAmount,
        swapResult,
        slippage: 0.10, // 10% slippage (5% for MIKO transfer fee + buffer)
        baseIn,
        computeBudgetConfig: {
          units: 400_000,
          microLamports: 1_000,
        },
      });
      
      // Execute the transaction
      const { txId } = await execute({ sendAndConfirm: true });
      
      console.log(`Swap successful: ${txId}`);
      
    } catch (error) {
      console.error('Raydium swap error:', error);
      throw error;
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