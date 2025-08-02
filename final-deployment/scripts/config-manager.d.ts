import { Connection, Keypair, PublicKey, Commitment } from '@solana/web3.js';
interface DeploymentState {
    vault_program_id?: string;
    smart_dial_program_id?: string;
    vault_deployment_signature?: string;
    smart_dial_deployment_signature?: string;
    token_mint?: string;
    token_creation_signature?: string;
    token_mint_signature?: string;
    deployer_token_account?: string;
    token_created_at?: string;
    vault_initialized?: boolean;
    smart_dial_initialized?: boolean;
    vault_init_signature?: string;
    smart_dial_init_signature?: string;
    authorities_transferred?: boolean;
    transfer_timestamp?: string;
    pool_created?: boolean;
    pool_id?: string;
    pool_info?: any;
    launch_time?: string;
    liquidity_added?: boolean;
    liquidity_stages?: Record<string, any>;
    liquidity_completion_time?: string;
    mint_authority_revoked?: boolean;
    revocation_signature?: string;
    revocation_timestamp?: string;
    final_supply?: string;
}
export declare class ConfigManager {
    private static instance;
    private environmentConfig;
    private deploymentState;
    private connection;
    private constructor();
    static getInstance(): ConfigManager;
    getNetwork(): string;
    getRpcUrl(): string;
    getConnection(): Connection;
    getCommitment(): Commitment;
    getTokenConfig(): {
        name: string;
        symbol: string;
        decimals: number;
        totalSupply: number;
        transferFeeBps: number;
        maximumFee: string;
    };
    getVaultConfig(): {
        minHoldAmount: number;
        harvestThreshold: string;
    };
    getPriorityFee(): {
        microLamports: number;
    };
    getDeploymentState(): DeploymentState;
    updateDeploymentState(updates: Partial<DeploymentState>): void;
    loadKeypair(name: string): Keypair;
    saveKeypair(name: string, keypair: Keypair): void;
    getVaultProgramId(): PublicKey;
    getSmartDialProgramId(): PublicKey;
    getTokenMint(): PublicKey;
    getVaultPda(): PublicKey;
    getSmartDialPda(): PublicKey;
    getPoolRegistryPda(): PublicKey;
}
export declare function getConfigManager(): ConfigManager;
export {};
//# sourceMappingURL=config-manager.d.ts.map