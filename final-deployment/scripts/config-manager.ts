import { Connection, Keypair, PublicKey, Commitment } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

interface EnvironmentConfig {
  network: 'mainnet' | 'devnet' | 'localnet';
  rpcUrl: string;
  commitment: Commitment;
  tokenConfig: {
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: number;
    transferFeeBps: number;
    maximumFee: string;
  };
  vaultConfig: {
    minHoldAmount: number;
    harvestThreshold: string;
  };
  priorityFee: {
    microLamports: number;
  };
}

interface DeploymentState {
  // Program deployment
  vault_program_id?: string;
  smart_dial_program_id?: string;
  vault_deployment_signature?: string;
  smart_dial_deployment_signature?: string;
  
  // Token creation
  token_mint?: string;
  token_creation_signature?: string;
  token_mint_signature?: string;
  deployer_token_account?: string;
  token_created_at?: string;
  
  // Initialization
  vault_initialized?: boolean;
  smart_dial_initialized?: boolean;
  vault_init_signature?: string;
  smart_dial_init_signature?: string;
  
  // Authority transfers
  authorities_transferred?: boolean;
  transfer_timestamp?: string;
  
  // Pool creation
  pool_created?: boolean;
  pool_id?: string;
  pool_info?: any;
  launch_time?: string;
  
  // Liquidity stages
  liquidity_added?: boolean;
  liquidity_stages?: Record<string, any>;
  liquidity_completion_time?: string;
  
  // Mint revocation
  mint_authority_revoked?: boolean;
  revocation_signature?: string;
  revocation_timestamp?: string;
  final_supply?: string;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private environmentConfig: EnvironmentConfig;
  private deploymentState: DeploymentState;
  private connection: Connection;
  
  private constructor() {
    // Load environment config
    const envPath = path.join(__dirname, '..', 'config', 'environment.json');
    this.environmentConfig = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
    
    // Load deployment state
    const statePath = path.join(__dirname, '..', 'config', 'deployment-state.json');
    if (fs.existsSync(statePath)) {
      this.deploymentState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    } else {
      this.deploymentState = {};
    }
    
    // Initialize connection
    this.connection = new Connection(this.environmentConfig.rpcUrl, this.environmentConfig.commitment);
  }
  
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }
  
  // Network configuration
  getNetwork(): string {
    return this.environmentConfig.network;
  }
  
  getRpcUrl(): string {
    return this.environmentConfig.rpcUrl;
  }
  
  getConnection(): Connection {
    return this.connection;
  }
  
  getCommitment(): Commitment {
    return this.environmentConfig.commitment;
  }
  
  // Token configuration
  getTokenConfig() {
    return this.environmentConfig.tokenConfig;
  }
  
  // Vault configuration
  getVaultConfig() {
    return this.environmentConfig.vaultConfig;
  }
  
  // Priority fee
  getPriorityFee() {
    return this.environmentConfig.priorityFee;
  }
  
  // Deployment state management
  getDeploymentState(): DeploymentState {
    return { ...this.deploymentState };
  }
  
  updateDeploymentState(updates: Partial<DeploymentState>) {
    this.deploymentState = {
      ...this.deploymentState,
      ...updates
    };
    
    const statePath = path.join(__dirname, '..', 'config', 'deployment-state.json');
    fs.writeFileSync(statePath, JSON.stringify(this.deploymentState, null, 2));
  }
  
  // Keypair management
  loadKeypair(name: string): Keypair {
    const keypairPath = path.join(__dirname, '..', 'keypairs', `${name}-keypair.json`);
    if (!fs.existsSync(keypairPath)) {
      throw new Error(`Keypair not found: ${keypairPath}`);
    }
    
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(keypairData));
  }
  
  saveKeypair(name: string, keypair: Keypair) {
    const keypairPath = path.join(__dirname, '..', 'keypairs', `${name}-keypair.json`);
    const keypairDir = path.dirname(keypairPath);
    
    if (!fs.existsSync(keypairDir)) {
      fs.mkdirSync(keypairDir, { recursive: true });
    }
    
    fs.writeFileSync(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));
  }
  
  // Program IDs
  getVaultProgramId(): PublicKey {
    if (!this.deploymentState.vault_program_id) {
      throw new Error('Vault program ID not found in deployment state');
    }
    return new PublicKey(this.deploymentState.vault_program_id);
  }
  
  getSmartDialProgramId(): PublicKey {
    if (!this.deploymentState.smart_dial_program_id) {
      throw new Error('Smart Dial program ID not found in deployment state');
    }
    return new PublicKey(this.deploymentState.smart_dial_program_id);
  }
  
  // Token mint
  getTokenMint(): PublicKey {
    if (!this.deploymentState.token_mint) {
      throw new Error('Token mint not found in deployment state');
    }
    return new PublicKey(this.deploymentState.token_mint);
  }
  
  // PDAs
  getVaultPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), this.getTokenMint().toBuffer()],
      this.getVaultProgramId()
    );
    return pda;
  }
  
  getSmartDialPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('dial_state')],
      this.getSmartDialProgramId()
    );
    return pda;
  }
  
  getPoolRegistryPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool_registry'), this.getVaultPda().toBuffer()],
      this.getVaultProgramId()
    );
    return pda;
  }
}

// Export singleton getter
export function getConfigManager(): ConfigManager {
  return ConfigManager.getInstance();
}