# MIKO Token Backend Development Requirements

## 1. Project Overview

### 1.1 Project Information
- **Project Name**: MIKO Token Backend System
- **Blockchain**: Solana
- **Language**: Rust (Smart Contracts), TypeScript (Keeper Bot)
- **Framework**: Anchor Framework v0.29+
- **Token Standard**: Token-2022

### 1.2 System Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                     Solana Blockchain                         │
├─────────────────────┬───────────────────┬───────────────────┤
│  Absolute Vault     │   Smart Dial      │   Token-2022      │
│  Program            │   Program         │   MIKO Token      │
└─────────────────────┴───────────────────┴───────────────────┘
                              │
                              │ RPC
                              │
┌─────────────────────────────────────────────────────────────┐
│                      Keeper Bot (Node.js)                     │
├─────────────────────┬───────────────────┬───────────────────┤
│  AI Agent Monitor   │  Birdeye Client   │  Jupiter Client   │
├─────────────────────┴───────────────────┴───────────────────┤
│                    Reward Orchestrator                        │
└─────────────────────────────────────────────────────────────┘
```

## 2. Smart Contract Requirements

### 2.1 Absolute Vault Program

#### 2.1.1 Program Structure
```
programs/absolute-vault/
├── src/
│   ├── lib.rs              # Main program entry
│   ├── instructions/
│   │   ├── mod.rs
│   │   ├── initialize.rs   # Initialize tax config
│   │   ├── process_tax.rs  # Process collected taxes
│   │   ├── update_holders.rs # Update holder registry
│   │   └── distribute.rs   # Distribute rewards
│   ├── state/
│   │   ├── mod.rs
│   │   ├── config.rs       # Tax configuration
│   │   └── holder_registry.rs # Holder information
│   ├── errors.rs           # Custom error definitions
│   └── constants.rs        # Immutable constants
├── Cargo.toml
└── Xargo.toml
```

#### 2.1.2 Constants (Immutable)
```rust
// src/constants.rs
pub const TAX_RATE: u8 = 5;              // 5% tax rate
pub const OWNER_SHARE: u8 = 1;           // 1% to owner
pub const HOLDER_SHARE: u8 = 4;          // 4% to holders
pub const MIN_HOLDER_THRESHOLD: u64 = 1_000_000; // 0.1% of 1B supply
pub const MAX_HOLDERS_PER_CHUNK: usize = 100;    // Account size limit
```

#### 2.1.3 State Definitions
```rust
// src/state/config.rs
#[account]
pub struct TaxConfig {
    pub authority: Pubkey,           // One-time use, then burned
    pub tax_authority_pda: Pubkey,   // PDA for tax withdrawal
    pub tax_holding_pda: Pubkey,     // PDA for temporary holding
    pub smart_dial_program: Pubkey,  // Smart Dial program ID
    pub token_mint: Pubkey,          // MIKO token mint
    pub initialized: bool,
    pub bump: u8,
}

// src/state/holder_registry.rs
#[account]
pub struct HolderRegistry {
    pub eligible_holders: Vec<HolderInfo>,
    pub last_snapshot_slot: u64,
    pub total_eligible_balance: u64,
    pub chunk_id: u8,
    pub next_chunk: Option<Pubkey>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct HolderInfo {
    pub address: Pubkey,
    pub balance: u64,
    pub reward_share: u64,
}
```

#### 2.1.4 Instructions
```rust
// src/instructions/initialize.rs
pub fn initialize(
    ctx: Context<Initialize>,
    smart_dial_program: Pubkey,
) -> Result<()> {
    // One-time initialization
    // Set up PDAs and tax configuration
    // Enable Transfer Fee Extension
}

// src/instructions/process_tax.rs
pub fn process_collected_taxes(
    ctx: Context<ProcessTax>
) -> Result<()> {
    // Withdraw withheld tokens to TaxHoldingPDA
    // Split 1% to owner_wallet (from Smart Dial)
    // Split 4% to treasury_wallet (from Smart Dial)
}

// src/instructions/update_holders.rs
pub fn update_holder_registry(
    ctx: Context<UpdateHolders>,
    chunk_id: u8,
    start_index: u32,
    batch_size: u32,
) -> Result<()> {
    // Update holder balances in chunks
    // Filter by MIN_HOLDER_THRESHOLD
    // Calculate total eligible balance
}

// src/instructions/distribute.rs
pub fn calculate_and_distribute_rewards(
    ctx: Context<DistributeRewards>,
    reward_token_amount: u64,
) -> Result<()> {
    // Calculate each holder's share
    // Execute batch transfers
    // Emit distribution events
}
```

#### 2.1.5 Security Requirements
- Use `require!` for all validations
- Implement reentrancy guards
- Use checked math operations
- Validate all PDAs
- After deployment: `solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority 11111111111111111111111111111111`

### 2.2 Smart Dial Program

#### 2.2.1 Program Structure
```
programs/smart-dial/
├── src/
│   ├── lib.rs
│   ├── instructions/
│   │   ├── mod.rs
│   │   ├── initialize.rs
│   │   ├── update_reward_token.rs
│   │   └── update_wallets.rs
│   ├── state/
│   │   ├── mod.rs
│   │   └── config.rs
│   └── errors.rs
├── Cargo.toml
└── Xargo.toml
```

#### 2.2.2 State Definition
```rust
// src/state/config.rs
#[account]
pub struct SmartDialConfig {
    pub current_reward_token_mint: Pubkey,
    pub keeper_bot_pubkey: Pubkey,
    pub treasury_wallet: Pubkey,
    pub owner_wallet: Pubkey,
    pub ai_agent_twitter_id: String,  // @mikolovescrypto
    pub admin: Pubkey,                 // For emergency updates
    pub bump: u8,
}
```

#### 2.2.3 Access Control
```rust
// src/instructions/update_reward_token.rs
pub fn update_reward_token_mint(
    ctx: Context<UpdateRewardToken>,
    new_mint: Pubkey,
) -> Result<()> {
    require!(
        ctx.accounts.signer.key() == ctx.accounts.config.keeper_bot_pubkey,
        ErrorCode::UnauthorizedAccess
    );
    
    ctx.accounts.config.current_reward_token_mint = new_mint;
    
    emit!(RewardTokenUpdated {
        old_mint: ctx.accounts.config.current_reward_token_mint,
        new_mint,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}
```

### 2.3 Token-2022 Configuration

#### 2.3.1 Token Creation Script
```rust
// scripts/create-token.rs
use spl_token_2022::{
    extension::{
        transfer_fee::TransferFeeConfig,
        ExtensionType,
    },
};

pub async fn create_miko_token() -> Result<()> {
    // Initialize Token-2022 with extensions
    let extensions = vec![
        ExtensionType::TransferFeeConfig,
        ExtensionType::InterestBearingConfig,
    ];
    
    // Set transfer fee
    let transfer_fee_config = TransferFeeConfig {
        transfer_fee_basis_points: 500, // 5%
        maximum_fee: u64::MAX,
    };
    
    // Create mint with extensions
    // Set withdraw_withheld_authority to Absolute Vault PDA
}
```

## 3. Keeper Bot Requirements

### 3.1 Project Structure
```
keeper-bot/
├── src/
│   ├── main.ts
│   ├── config/
│   │   └── index.ts
│   ├── services/
│   │   ├── AIAgentMonitor.ts
│   │   ├── BirdeyeClient.ts
│   │   ├── JupiterClient.ts
│   │   └── SolanaClient.ts
│   ├── orchestration/
│   │   ├── RewardOrchestrator.ts
│   │   └── RewardScheduler.ts
│   ├── monitoring/
│   │   ├── HealthCheck.ts
│   │   └── MetricsCollector.ts
│   ├── notifications/
│   │   ├── DiscordNotifier.ts
│   │   └── TelegramNotifier.ts
│   └── utils/
│       ├── logger.ts
│       └── retry.ts
├── package.json
├── tsconfig.json
├── .env.example
├── Dockerfile
└── docker-compose.yml
```

### 3.2 Core Services Implementation

#### 3.2.1 AI Agent Monitor
```typescript
interface AIAgentMonitor {
    getLatestRewardTweet(): Promise<{symbol: string, tweetId: string} | null>;
    isRewardTweet(text: string): boolean;
    extractSymbol(text: string): string | null;
}
```

#### 3.2.2 Birdeye Client
```typescript
interface BirdeyeClient {
    searchTokensBySymbol(symbol: string, limit?: number): Promise<TokenInfo[]>;
    findHighestVolumeToken(symbol: string): Promise<TokenInfo | null>;
    getTokenDetails(address: string): Promise<TokenDetails>;
}

interface TokenInfo {
    address: string;
    symbol: string;
    name: string;
    price: string;
    mc: string;
    v24hUSD: string;
    liquidity: string;
}
```

#### 3.2.3 Reward Orchestrator
```typescript
interface RewardOrchestrator {
    checkAndUpdateRewardToken(): Promise<void>;
    executeRewardCycle(): Promise<void>;
    private triggerHolderRegistryUpdate(): Promise<void>;
    private swapTaxToRewardToken(): Promise<SwapResult>;
    private calculateRewardDistribution(amount: u64): Promise<void>;
    private executeRewardDistribution(): Promise<DistributionResult>;
}
```

### 3.3 Configuration Management
```typescript
// src/config/index.ts
export const config = {
    // API Keys
    BIRDEYE_API_KEY: process.env.BIRDEYE_API_KEY!,
    TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN!,
    
    // Solana
    RPC_URL: process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
    KEEPER_BOT_KEY: process.env.KEEPER_BOT_KEY!, // Base64 encoded
    
    // Program IDs
    ABSOLUTE_VAULT_PROGRAM_ID: process.env.ABSOLUTE_VAULT_PROGRAM_ID!,
    SMART_DIAL_PROGRAM_ID: process.env.SMART_DIAL_PROGRAM_ID!,
    MIKO_TOKEN_MINT: process.env.MIKO_TOKEN_MINT!,
    
    // AI Agent
    AI_AGENT_TWITTER_ID: "1807336107638001665",
    
    // Scheduling
    REWARD_CHECK_INTERVAL_MS: 30 * 60 * 1000, // 30 minutes
    REWARD_DISTRIBUTION_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
    
    // Monitoring
    HEALTH_CHECK_PORT: 3000,
    METRICS_PORT: 9090,
    
    // Notifications
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
};
```

### 3.4 Error Handling & Retry Logic
```typescript
// src/utils/retry.ts
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: {
        maxRetries?: number;
        delay?: number;
        backoff?: number;
        onRetry?: (error: Error, attempt: number) => void;
    } = {}
): Promise<T> {
    const {
        maxRetries = 3,
        delay = 1000,
        backoff = 2,
        onRetry
    } = options;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxRetries) throw error;
            
            if (onRetry) onRetry(error as Error, attempt);
            
            const waitTime = delay * Math.pow(backoff, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    
    throw new Error('Unreachable');
}
```

## 4. API Specifications

### 4.1 Health Check API
```
GET /health
Response: {
    "status": "healthy|unhealthy",
    "slot": 123456789,
    "lastExecution": "2024-06-11T00:00:00Z",
    "uptime": 3600
}
```

### 4.2 Metrics API
```
GET /metrics
Response: {
    "rewardCycles": 288,
    "tokenUpdates": 4,
    "errors": 0,
    "gasUsed": 12.5,
    "holdersCount": 5432,
    "lastRewardToken": {
        "symbol": "BONK",
        "address": "...",
        "updatedAt": "2024-06-11T00:00:00Z"
    }
}
```

## 5. Database Schema (State Management)

### 5.1 Keeper Bot State (JSON File)
```json
{
    "lastRewardCheck": "2024-06-11T00:00:00Z",
    "lastProcessedTweetId": "1234567890",
    "currentRewardToken": {
        "symbol": "BONK",
        "address": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        "updatedAt": "2024-06-11T00:00:00Z"
    },
    "metrics": {
        "totalRewardCycles": 1000,
        "totalTokenUpdates": 10,
        "totalErrors": 2,
        "totalGasUsed": 50.5
    }
}
```

## 6. Security Requirements

### 6.1 Smart Contract Security
- [ ] Use Anchor's security best practices
- [ ] Implement proper PDA validation
- [ ] Use checked math operations
- [ ] Add reentrancy guards
- [ ] Validate all user inputs
- [ ] Implement proper access control
- [ ] Burn upgrade authority after deployment

### 6.2 Keeper Bot Security
- [ ] Store private keys in environment variables
- [ ] Use secure key management (AWS KMS, HashiCorp Vault)
- [ ] Implement rate limiting
- [ ] Add request signing
- [ ] Use HTTPS for all external calls
- [ ] Implement proper error handling
- [ ] Add monitoring and alerting

### 6.3 API Security
- [ ] Implement authentication for sensitive endpoints
- [ ] Add CORS configuration
- [ ] Implement rate limiting
- [ ] Use HTTPS only
- [ ] Validate all inputs
- [ ] Add request/response logging

## 7. Testing Requirements

### 7.1 Smart Contract Tests
```rust
// tests/absolute-vault.ts
describe("Absolute Vault", () => {
    it("Should initialize with correct tax rates", async () => {});
    it("Should prevent tax rate changes", async () => {});
    it("Should correctly split taxes", async () => {});
    it("Should update holder registry", async () => {});
    it("Should distribute rewards proportionally", async () => {});
});

// tests/smart-dial.ts
describe("Smart Dial", () => {
    it("Should only allow keeper bot to update reward token", async () => {});
    it("Should emit events on updates", async () => {});
    it("Should validate token mint addresses", async () => {});
});
```

### 7.2 Keeper Bot Tests
```typescript
// tests/services/AIAgentMonitor.test.ts
describe("AI Agent Monitor", () => {
    it("Should detect reward tweets", async () => {});
    it("Should extract symbols correctly", async () => {});
    it("Should ignore non-reward tweets", async () => {});
});

// tests/orchestration/RewardOrchestrator.test.ts
describe("Reward Orchestrator", () => {
    it("Should update reward token", async () => {});
    it("Should handle API failures gracefully", async () => {});
    it("Should execute full reward cycle", async () => {});
});
```

## 8. Deployment Requirements

### 8.1 Smart Contract Deployment
```bash
# Build programs
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet
anchor deploy --provider.cluster mainnet

# Burn upgrade authority
solana program set-upgrade-authority <ABSOLUTE_VAULT_ID> \
  --new-upgrade-authority 11111111111111111111111111111111 \
  --keypair ~/.config/solana/deployer.json
```

### 8.2 Keeper Bot Deployment
```bash
# Build Docker image
docker build -t miko-keeper-bot .

# Run with Docker Compose
docker-compose up -d

# Check logs
docker logs -f miko-keeper-bot

# Health check
curl http://localhost:3000/health
```

## 9. Monitoring & Maintenance

### 9.1 Metrics to Monitor
- Reward distribution success rate
- Gas usage per cycle
- API response times
- Error rates
- Holder count changes
- Token update frequency

### 9.2 Alerts to Configure
- Failed reward distributions
- API errors (Birdeye, Twitter)
- Low SOL balance
- Unusual gas consumption
- Extended downtime

### 9.3 Maintenance Tasks
- Weekly log rotation
- Monthly performance review
- Quarterly security audit
- API key rotation
- Dependency updates

## 10. Environment Variables

### 10.1 Required Variables
```env
# API Keys
BIRDEYE_API_KEY=
TWITTER_BEARER_TOKEN=

# Solana Configuration
RPC_URL=https://api.mainnet-beta.solana.com
KEEPER_BOT_KEY=

# Program IDs (After Deployment)
ABSOLUTE_VAULT_PROGRAM_ID=
SMART_DIAL_PROGRAM_ID=
MIKO_TOKEN_MINT=

# Notifications
DISCORD_WEBHOOK_URL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Monitoring
HEALTH_CHECK_PORT=3000
METRICS_PORT=9090
```

## 11. Development Timeline

### Phase 1: Smart Contracts (Week 1-4)
- Week 1-2: Absolute Vault program
- Week 3: Smart Dial program
- Week 4: Integration testing

### Phase 2: Keeper Bot (Week 5-6)
- Week 5: Core services implementation
- Week 6: Orchestration and scheduling

### Phase 3: Integration (Week 7-8)
- Week 7: End-to-end testing
- Week 8: Security audit preparation

### Phase 4: Deployment (Week 9-10)
- Week 9: Devnet deployment and testing
- Week 10: Mainnet deployment

## 12. Deliverables

### 12.1 Code Deliverables
- [ ] Absolute Vault program (Rust/Anchor)
- [ ] Smart Dial program (Rust/Anchor)
- [ ] Token creation scripts
- [ ] Keeper Bot (TypeScript)
- [ ] Deployment scripts
- [ ] Test suites

### 12.2 Documentation
- [ ] API documentation
- [ ] Deployment guide
- [ ] Operations manual
- [ ] Security audit report

### 12.3 Infrastructure
- [ ] Docker configuration
- [ ] CI/CD pipeline
- [ ] Monitoring dashboard
- [ ] Alert configuration