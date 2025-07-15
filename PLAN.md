# MIKO Token System Development Plan

## Overview

This document outlines the comprehensive development plan for the MIKO token system on Solana, featuring automated tax collection, AI-driven reward distribution, dynamic holder eligibility, and anti-sniper protection. All features described in README.md will be implemented without compromise.

## Architecture Overview

### System Components

1. **MIKO Token (Token-2022)**
   - SPL Token-2022 with dynamic transfer fee extension
   - Initial 30% fee, reducing to 15% (5 min), then 5% (10 min)
   - Fee configuration authority managed by Vault, then revoked
   - Withheld fees accumulate in token accounts
   - Freeze authority null, mint authority revoked

2. **Absolute Vault Program**
   - Core tax collection and distribution logic
   - Launch timestamp tracking
   - Dynamic fee update mechanism
   - Holder registry management
   - Reward distribution mechanics (20% owner/80% holders split)
   - Dual exclusion list management
   - Emergency withdrawal capabilities

3. **Smart Dial Program**
   - Reward token configuration storage (initially SOL)
   - Update authorization management
   - Treasury configuration
   - 24-hour update constraint (active after first Monday)

4. **Transfer Hook Program**
   - Transaction size enforcement (1% max for 10 minutes)
   - Launch-time based restrictions
   - Automatic deactivation after anti-sniper period

5. **Keeper Bot**
   - Automated monitoring with threshold-based execution
   - Tax rate updates at 5 and 10 minute marks
   - Harvest trigger: 500,000 MIKO accumulated (0.05% of supply)
   - Pinned tweet monitoring for reward token selection (after first Monday)
   - Symbol disambiguation via 24h volume comparison
   - Jupiter swap integration
   - Birdeye API integration for holder data and token volumes
   - No wallet private key required

## Technical Stack

### On-chain Development
- **Language**: Rust (latest stable)
- **Framework**: Anchor framework
- **Token Standard**: SPL Token-2022 with extensions
- **Program Development**: Solana CLI

### Off-chain Development
- **Language**: TypeScript
- **Runtime**: Node.js LTS
- **Web3 Library**: @solana/web3.js
- **Scheduler**: cron job library
- **APIs**: Twitter API v2, Birdeye API, Jupiter API

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Shared Storage**: Volume mounts for artifacts
- **Environment Management**: .env files per phase

## Development Phases

### Phase 0: Infrastructure Setup (Day 1)
**Objective**: Prepare development environment and shared infrastructure

1. **Directory Structure**
   ```
   miko-token/
   ├── docker/
   │   ├── shared-artifacts/     # Program IDs, configs
   │   │   ├── .gitkeep
   │   │   └── README.md        # Artifact format docs
   │   ├── phase1-programs/
   │   ├── phase2-token/
   │   ├── phase3-init/
   │   └── phase4-keeper/
   ├── scripts/
   │   └── verify-phase.sh      # Phase validation scripts
   ├── .env.example             # Environment template
   ├── docker-compose.yml       # Full system composition
   └── README.md
   ```

2. **Shared Artifacts Format**
   ```json
   // shared-artifacts/programs.json
   {
     "absoluteVault": {
       "programId": "...",
       "deployedAt": "...",
       "network": "devnet"
     },
     "smartDial": {
       "programId": "...",
       "deployedAt": "...",
       "network": "devnet"
     },
     "transferHook": {
       "programId": "...",
       "deployedAt": "...",
       "network": "devnet"
     }
   }
   ```

3. **Environment Configuration**
   - RPC endpoints
   - Network selection (devnet/mainnet)
   - API keys placeholder

### Phase 1: Core Programs Development (Week 1-3)
**Objective**: Develop and deploy on-chain programs with anti-sniper features

#### Environment Setup
- Use appropriate Rust base image
- Install Solana tools and Anchor framework
- Mount volumes for workspace and shared artifacts

#### Absolute Vault Program

1. **Data Structures**:
   - VaultState struct containing:
     - authority: Admin authority
     - treasury: Treasury wallet
     - owner_wallet: Owner (1% recipient)
     - token_mint: MIKO token mint
     - min_hold_amount: Min $100 USD in tokens
     - fee_exclusions: Fee harvest exclusions list
     - reward_exclusions: Reward exclusions list
     - keeper_authority: Keeper bot authority
     - launch_timestamp: Raydium pool creation time
     - fee_finalized: Tax locked at 5% flag
     - harvest_threshold: 500,000 MIKO (0.05% of supply)
     - Additional statistics fields

2. **Launch Time Management**:
   - Implement set_launch_time function
   - Require launch_timestamp to be unset (zero)
   - Set current timestamp when Raydium pool is created
   - Return error if already launched

3. **Dynamic Fee Updates**:
   - Implement update_transfer_fee function
   - Calculate elapsed time since launch
   - Apply fee schedule:
     - 0-5 minutes: 30% (3000 basis points)
     - 5-10 minutes: 15% (1500 basis points)
     - 10+ minutes: 5% (500 basis points) and revoke authority
   - Update fee via CPI to Token-2022 program
   - Set fee_finalized flag when complete

4. **Instructions with Direct CPI**:
   - harvest_fees: Direct CPI implementation to Token-2022
     - Use SPL Token-2022's harvest_withheld_tokens_to_mint instruction
     - Build instruction with token mint and account list
     - Execute with PDA signature using invoke_signed
     - Process accounts in batches for efficiency

5. **Authority Design**:
   - `authority`: Program admin (can update configs)
   - `keeper_authority`: Bot wallet (can harvest/distribute/update fees)
   - Separate authorities prevent single point of failure

#### Transfer Hook Program

1. **Transaction Limit Enforcement**:
   - Create TransferHookConfig struct with:
     - launch_time field (initially 0)
     - token_mint reference
     - total_supply tracking
   - Implement process_transfer function:
     - Check if launch_time is set (non-zero)
     - If set and within 10 minute anti-sniper period:
       - Calculate 1% of total supply as max allowed
       - Reject transfers exceeding limit
     - If launch_time not set or after 10 minutes:
       - Allow unlimited transfers
   - Note: Hook is active immediately but only enforces limits after launch_time is set

#### Smart Dial Program

1. **Simple State Management**:
   - Implement DialState with:
     - authority field
     - current_reward_token storage
     - last_update timestamp
     - update_history tracking
     - launch_timestamp for first Monday calculation

2. **24-hour Update Constraint** (active after first Monday):
   - Require 86400 seconds (24 hours) between updates
   - Return error if update attempted too soon

### Phase 2: MIKO Token Creation (Week 4)
**Objective**: Create token with temporary authority structure

1. **Load Program IDs**:
   - Read programs.json from shared-artifacts
   - Parse and extract all program IDs
   - Convert to PublicKey objects

2. **Token Creation with Temporary Authority**:
   - Create mint with deployer as temporary mint authority
   - Set freeze authority to null (permanent)
   - Initialize transfer fee extension:
     - Set deployer as temporary fee config authority
     - Set deployer as temporary withdraw withheld authority
     - Initial fee: 3000 basis points (30%)
     - No maximum fee limit
   - Initialize transfer hook extension:
     - Set deployer as temporary hook authority
     - Link to transfer hook program

3. **Mint Total Supply**:
   - Mint 1,000,000,000 MIKO tokens
   - Send to deployer wallet temporarily
   - This must be done BEFORE revoking mint authority

4. **Save Token Info**:
   ```json
   // shared-artifacts/token.json
   {
     "mint": "...",
     "totalSupply": "1000000000",
     "temporaryAuthority": "... (deployer)",
     "freezeAuthority": null,
     "createdAt": "..."
   }
   ```

### Phase 3: System Initialization & Authority Transfer (Week 5)
**Objective**: Initialize all programs and transfer authorities to PDAs

1. **Calculate Vault PDA**:
   - Use findProgramAddressSync with 'vault' seed and mint pubkey
   - This PDA will receive all authorities

2. **Initialize Vault**:
   - Call vault program's initialize method
   - Creates the Vault PDA account
   - Set all configuration parameters
   - This MUST be done before any authority transfers

3. **Initialize Transfer Hook**:
   - Call hook program's initialize method  
   - Pass token mint and total supply
   - Set launch_time to 0 (not launched yet)
   - Hook is now active but won't limit transfers until launch_time is set
   - This MUST be done before any token transfers can occur

4. **Transfer Token Authorities to Vault PDA**:
   - Transfer fee config authority from deployer to Vault PDA
   - Transfer withdraw withheld authority from deployer to Vault PDA
   - Transfer hook authority from deployer to Vault PDA
   - All programs must be initialized before this step

5. **Initial Transfer Testing**:
   - Test small transfer to verify 30% fee collection
   - Verify hook allows transfer (no limit before launch)
   - Verify fees are withheld correctly

6. **Revoke Mint Authority**:
   - Permanently revoke mint authority
   - This MUST be done after all minting is complete

7. **Distribute Initial Token Supply**:
   - Send tokens from deployer to appropriate wallets:
     - Liquidity provision allocation  
     - Team allocation (if any)
     - Marketing allocation (if any)
   - Ensure all allocations are complete before launch
   - Hook is active but won't enforce limits until launch_time is set

8. **Initialize Smart Dial with SOL**:
   - Call dial program's initialize method
   - Set initial reward token to SOL mint address
   - Configure treasury wallet
   - Record initialization timestamp

9. **Validation Before Launch**:
   - Verify all authorities transferred correctly
   - Verify token distribution complete
   - Verify all programs initialized and working
   - Test fee collection mechanism
   - Test harvest function with accumulated fees
   - Run full integration test suite

10. **Create Launch Script**:
    - Function to launch MIKO token:
      - Create Raydium pool with appropriate parameters
      - Immediately set launch timestamp via vault program
      - Schedule fee updates at 5 and 10 minute intervals
      - Log progress for monitoring

### Phase 4: Keeper Bot Development (Week 6-7)
**Objective**: Automated operations with launch-aware scheduling

1. **Configuration**:
   - Load environment variables for:
     - Vault program ID
     - Dial program ID
     - Hook program ID
     - Keeper public key
     - Launch timestamp
   - No private keys stored in configuration

2. **Fee Update Manager**:
   - Class to handle dynamic fee updates:
     - Track elapsed time since launch
     - Update to 15% at 5 minutes
     - Finalize at 5% at 10 minutes
     - Call vault program's updateTransferFee method

3. **Fee Harvest Monitor**:
   - Class to monitor and harvest fees:
     - Define harvest threshold (500k MIKO with decimals)
     - Query total withheld fees across all accounts
     - Execute harvest when threshold reached
     - Batch accounts for efficiency (e.g., 20 per transaction)
     - Trigger swap and distribution after successful harvest
   - Methods:
     - checkAndHarvest: Main monitoring function
     - getTotalWithheldFees: Sum all withheld amounts
     - executeFeeHarvest: Perform actual harvest operation

4. **Twitter AI Integration** (Active after first Monday):
   - Function to check and update reward token:
     - Calculate first Monday after launch
     - Return early if before first Monday
     - At Monday 03:00 UTC, fetch @project_miko's pinned tweet
     - Extract single $SYMBOL mention from pinned message
     - Query all tokens with that symbol via Birdeye API
     - Select the token with highest 24h volume among matching symbols
     - Update reward token in Smart Dial program

5. **Distribution Engine**:
   - Function to distribute rewards:
     - Get current reward token (SOL initially)
     - Query holders via Birdeye API
     - Get MIKO token price from Birdeye
     - Filter holders with $100+ USD value
     - Calculate proportional shares
     - Execute batch distributions

6. **Scheduler**:
   - One-time fee updates:
     - Schedule update to 15% at 5 minutes
     - Schedule finalization to 5% at 10 minutes
   - Weekly reward token updates:
     - Every Monday at 03:00 UTC
     - Check if after first Monday
     - Fetch pinned tweet and extract symbol
     - Query matching tokens and select by volume
   - Continuous monitoring:
     - Check harvest threshold every minute
     - Execute harvest/swap/distribute when triggered

### Phase 5: Integration & Testing (Week 8-9)
**Objective**: Complete system validation with anti-sniper features

1. **Pre-Launch Testing** (Before pool creation):
   - Token transfer functionality with 30% fee
   - Fee accumulation and harvest mechanism  
   - Authority verification (all properly transferred)
   - Exclusion list functionality
   - Smart Dial configuration
   - Keeper bot basic operations

2. **Launch Simulation**:
   - Create test pool on devnet
   - Set launch timestamp
   - Monitor tax rate changes:
     - Verify 30% tax active immediately
     - Test 1% transaction limit enforcement  
     - Wait 5 minutes, verify 15% tax
     - Wait 10 minutes, verify 5% tax
     - Confirm fee authority revoked at 10 minutes
   - Test transaction limits removed after 10 minutes

3. **Post-Launch Testing**:
   - Threshold-based harvest trigger (500k MIKO)
   - Reward distribution to eligible holders
   - SOL reward scenario
   - First Monday simulation for reward token change
   - API integration tests (Twitter, Birdeye, Jupiter)

4. **Load Testing**:
   - 1000+ holder distribution simulation
   - High-frequency trading during anti-sniper period
   - API rate limit handling
   - Network congestion scenarios

### Phase 6: Production Deployment (Week 10)
**Objective**: Mainnet deployment with monitoring

1. **Pre-deployment Checklist**:
   - [ ] Anti-sniper features tested
   - [ ] Launch script ready
   - [ ] Fee update timers configured
   - [ ] First Monday calculation verified

2. **Deployment Order**:
   1. Deploy Absolute Vault program
   2. Deploy Smart Dial program
   3. Deploy Transfer Hook program
   4. Create MIKO token with 30% initial fee
   5. Initialize all programs
   6. Prepare Raydium pool creation
   7. Launch sequence:
      - Create pool
      - Set launch timestamp
      - Start keeper bot
      - Monitor fee updates

## Key Implementation Details

### Transfer Fee Mechanics
- Initial fee: 3000 basis points (30%)
- 5-minute fee: 1500 basis points (15%)
- Final fee: 500 basis points (5%)
- Maximum fee: u64::MAX (no upper limit)
- Transfer fee config authority: Vault PDA → Revoked after 10 min
- Withdraw withheld authority: Vault PDA (permanent)

### Anti-Sniper Protection
- **0-5 minutes**: 30% tax, 1% max transaction
- **5-10 minutes**: 15% tax, 1% max transaction
- **10+ minutes**: 5% tax (permanent), unlimited transactions

### Reward Token Schedule
- **Launch to First Monday**: SOL only
- **First Monday onwards**: AI posts pinned tweet (00:00-02:00 UTC), bot checks at 03:00 UTC

### Tax Flow Scenarios

#### Scenario 1: Reward Token is SOL
- If keeper balance < MIN_KEEPER_SOL:
  - Keep all collected tax as SOL
  - Use up to 20% of tax (owner's portion) for keeper top-up until 0.10 SOL
  - Send any remaining owner portion to owner
  - Distribute 80% of tax to holders
- Else:
  - Normal distribution: 20% of tax to owner, 80% of tax to holders

#### Scenario 2: Reward Token is NOT SOL
- If keeper balance < MIN_KEEPER_SOL:
  - Swap 20% of tax (owner's portion) to SOL
  - Keep SOL in keeper wallet until reaches 0.10 SOL
  - Send any excess to owner
  - Swap 80% of tax (holders' portion) to reward token
  - Distribute reward tokens to holders
- Else:
  - Swap all tax to reward token
  - Distribute: 20% of tax value to owner, 80% of tax value to holders

### Holder Eligibility System
1. Fetch MIKO/USD price from Birdeye
2. Calculate USD value for each holder
3. Filter holders with ≥ $100 USD value
4. Exclude reward_exclusions list members
5. Calculate proportional shares
6. Batch distribute

### Dual Exclusion Lists
- **Fee Exclusions**: Skip during harvest_fees
- **Reward Exclusions**: Skip during distribute_rewards
- **Auto-excluded**: System accounts (owner, treasury, keeper, programs)

### Emergency Functions
- `emergency_withdraw_vault`: Withdraw any token/SOL from vault
- `emergency_withdraw_withheld`: Recover stuck withheld fees
- Authority-only access for both

## Security Considerations

1. **Program Security**
   - Separate admin and keeper authorities
   - Time-based fee update constraints
   - Overflow protection with checked math
   - PDA seed validation
   - Reentrancy prevention

2. **Token Security**
   - Mint authority revoked immediately
   - Freeze authority null from creation
   - Transfer fee authority revoked after 10 minutes
   - No ability to modify supply

3. **Bot Security**
   - No private keys except keeper's own
   - API key encryption
   - Rate limiting
   - Retry with exponential backoff

4. **Economic Security**
   - Anti-sniper protection via high initial tax
   - Transaction size limits during launch
   - MEV protection through batching
   - Slippage controls on swaps

## Testing Strategy

### Unit Tests
- Each instruction independently
- Time-based fee updates
- Transaction limit enforcement
- Edge cases (empty lists, zero balances)
- Authority validations

### Integration Tests
- Multi-program interactions
- Full tax cycle with dynamic fees
- Anti-sniper period transitions
- Reward token scheduling
- API mock responses

### Stress Tests
- 10,000+ holders
- High-frequency transfers during launch
- Network congestion
- Rapid fee updates

## Monitoring & Maintenance

1. **Launch Metrics**
   - Tax rate transitions
   - Transaction limit enforcement
   - Sniper activity detection
   - Pool creation success

2. **Ongoing Metrics**
   - Harvest success rate
   - Distribution accuracy
   - API response times
   - Holder count growth

3. **Alerts**
   - Failed fee updates
   - Failed harvests
   - Low keeper SOL
   - API errors
   - Unusual activity

## Risk Mitigation

1. **Launch Risks**
   - Multiple RPC nodes for reliability
   - Backup fee update mechanism
   - Manual intervention procedures
   - Monitoring dashboard

2. **Technical Risks**
   - API fallbacks (multiple RPC nodes)
   - Graceful degradation
   - Manual intervention procedures

3. **Operational Risks**
   - Key rotation procedures
   - Bot redundancy (primary/backup)
   - Regular state audits

## Phase Validation Scripts

Each phase must pass validation before proceeding:

```bash
# Phase 1 validation
./scripts/verify-phase.sh 1
# Checks: Programs compiled, deployed, IDs saved, hooks work

# Phase 2 validation  
./scripts/verify-phase.sh 2
# Checks: Token created, vault PDA authorities, mint revoked

# Continue for each phase...
```

## Success Criteria

1. **Functional Requirements**
   - ✅ Dynamic transfer fee (30% → 15% → 5%)
   - ✅ Transaction limits for 10 minutes
   - ✅ Threshold-based fee harvesting (500k MIKO)
   - ✅ 20%/80% split logic of collected tax
   - ✅ Initial SOL rewards, then AI-driven selection
   - ✅ $100 minimum holder eligibility
   - ✅ Dual exclusion lists
   - ✅ Emergency withdrawal capabilities
   - ✅ Immutable token (no freeze/mint)

2. **Security Requirements**
   - ✅ No wallet private keys in keeper bot
   - ✅ Vault PDA controls fee harvesting
   - ✅ Proper authority separation
   - ✅ Anti-sniper protection active
   - ✅ All authorities properly revoked

3. **Performance Requirements**
   - ✅ Handle 1000+ holders
   - ✅ Complete harvest/distribution cycle efficiently
   - ✅ Smooth fee transitions
   - ✅ 99.9% uptime

This plan ensures all README.md features are implemented without compromise while maintaining security, phase isolation, and robust anti-sniper protection.