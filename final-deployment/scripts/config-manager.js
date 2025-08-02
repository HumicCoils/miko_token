"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = void 0;
exports.getConfigManager = getConfigManager;
const web3_js_1 = require("@solana/web3.js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ConfigManager {
    static instance;
    environmentConfig;
    deploymentState;
    connection;
    constructor() {
        // Load environment config
        const envPath = path.join(__dirname, '..', 'config', 'environment.json');
        this.environmentConfig = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
        // Load deployment state
        const statePath = path.join(__dirname, '..', 'config', 'deployment-state.json');
        if (fs.existsSync(statePath)) {
            this.deploymentState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        }
        else {
            this.deploymentState = {};
        }
        // Initialize connection
        this.connection = new web3_js_1.Connection(this.environmentConfig.rpcUrl, this.environmentConfig.commitment);
    }
    static getInstance() {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }
    // Network configuration
    getNetwork() {
        return this.environmentConfig.network;
    }
    getRpcUrl() {
        return this.environmentConfig.rpcUrl;
    }
    getConnection() {
        return this.connection;
    }
    getCommitment() {
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
    getDeploymentState() {
        return { ...this.deploymentState };
    }
    updateDeploymentState(updates) {
        this.deploymentState = {
            ...this.deploymentState,
            ...updates
        };
        const statePath = path.join(__dirname, '..', 'config', 'deployment-state.json');
        fs.writeFileSync(statePath, JSON.stringify(this.deploymentState, null, 2));
    }
    // Keypair management
    loadKeypair(name) {
        const keypairPath = path.join(__dirname, '..', 'keypairs', `${name}-keypair.json`);
        if (!fs.existsSync(keypairPath)) {
            throw new Error(`Keypair not found: ${keypairPath}`);
        }
        const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
        return web3_js_1.Keypair.fromSecretKey(new Uint8Array(keypairData));
    }
    saveKeypair(name, keypair) {
        const keypairPath = path.join(__dirname, '..', 'keypairs', `${name}-keypair.json`);
        const keypairDir = path.dirname(keypairPath);
        if (!fs.existsSync(keypairDir)) {
            fs.mkdirSync(keypairDir, { recursive: true });
        }
        fs.writeFileSync(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));
    }
    // Program IDs
    getVaultProgramId() {
        if (!this.deploymentState.vault_program_id) {
            throw new Error('Vault program ID not found in deployment state');
        }
        return new web3_js_1.PublicKey(this.deploymentState.vault_program_id);
    }
    getSmartDialProgramId() {
        if (!this.deploymentState.smart_dial_program_id) {
            throw new Error('Smart Dial program ID not found in deployment state');
        }
        return new web3_js_1.PublicKey(this.deploymentState.smart_dial_program_id);
    }
    // Token mint
    getTokenMint() {
        if (!this.deploymentState.token_mint) {
            throw new Error('Token mint not found in deployment state');
        }
        return new web3_js_1.PublicKey(this.deploymentState.token_mint);
    }
    // PDAs
    getVaultPda() {
        const [pda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('vault'), this.getTokenMint().toBuffer()], this.getVaultProgramId());
        return pda;
    }
    getSmartDialPda() {
        const [pda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('dial_state')], this.getSmartDialProgramId());
        return pda;
    }
    getPoolRegistryPda() {
        const [pda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('pool_registry'), this.getVaultPda().toBuffer()], this.getVaultProgramId());
        return pda;
    }
}
exports.ConfigManager = ConfigManager;
// Export singleton getter
function getConfigManager() {
    return ConfigManager.getInstance();
}
//# sourceMappingURL=config-manager.js.map