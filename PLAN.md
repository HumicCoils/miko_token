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

4. **Keeper Bot**
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
     }
   }
   ```

3. **Environment Configuration**
   - RPC endpoints
   - Network selection (devnet/mainnet)
   - API keys placeholder

### Phase 1: Core Programs Development (Week 1-3)
**Objective**: Develop and deploy on-chain programs with anti-sniper features

#### CRITICAL DEPLOYMENT PROCESS
**WARNING: Incorrect deployment order causes program ID mismatches that block the entire system**

1. **Program Deployment Preparation** (MUST DO FIRST):
   - Generate deployment keypair BEFORE writing any code
   - Record the generated address from the keypair
   - Set the program ID in code to match the keypair address
   - Build the program with the correct ID
   - Deploy using the SAME keypair file
   - Verify: deployed ID = code ID (CRITICAL: mismatch = system failure)

2. **Deployment Process for Each Program**:
   ```bash
   # Step 1: Generate keypair (DO THIS FIRST)
   solana-keygen new -o deploy-keypair.json
   
   # Step 2: Get the public key
   solana-keygen pubkey deploy-keypair.json
   # Output: AbCdEfGhIjKlMnOpQrStUvWxYz123456789...
   
   # Step 3: Update declare_id! in lib.rs with this EXACT address
   
   # Step 4: Build program
   anchor build
   
   # Step 5: Deploy with the SAME keypair
   anchor deploy --program-keypair deploy-keypair.json
   
   # Step 6: Verify IDs match
   # Check that deployed ID = declared ID in code
   ```

#### Environment Setup
- Use appropriate Rust base image
- Install Solana tools and Anchor framework
- Mount volumes for workspace and shared artifacts

#### Absolute Vault Program

1. **Pre-coding Setup**:
   - Generate vault program keypair
   - Record keypair address
   - Create program with correct declare_id!

2. **Data Structures**:
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

3. **Launch Time Management**:
   - Implement set_launch_time function
   - Require launch_timestamp to be unset (zero)
   - Set current timestamp when Raydium pool is created
   - Return error if already launched

4. **Dynamic Fee Updates**:
   - Implement update_transfer_fee function
   - Calculate elapsed time since launch
   - Apply fee schedule:
     - 0-5 minutes: 30% (3000 basis points)
     - 5-10 minutes: 15% (1500 basis points)
     - 10+ minutes: 5% (500 basis points) and revoke authority
   - Update fee via CPI to Token-2022 program
   - Set fee_finalized flag when complete

5. **Instructions with Direct CPI**:
   - harvest_fees: Direct CPI implementation to Token-2022
     - Use SPL Token-2022's harvest_withheld_tokens_to_mint instruction
     - Build instruction with token mint and account list
     - Execute with PDA signature using invoke_signed
     - Process accounts in batches for efficiency

6. **Authority Design**:
   - `authority`: Program admin (can update configs)
   - `keeper_authority`: Bot wallet (can harvest/distribute/update fees)
   - Separate authorities prevent single point of failure

7. **Deployment Validation**:
   - Confirm program ID in code matches deployed ID
   - Save deployed ID to shared-artifacts
   - Test basic instruction calls

#### Smart Dial Program

1. **Pre-coding Setup**:
   - Generate dial program keypair
   - Record keypair address
   - Create program with correct declare_id!

2. **Simple State Management**:
   - Implement DialState with:
     - authority field
     - current_reward_token storage
     - last_update timestamp
     - update_history tracking
     - launch_timestamp for first Monday calculation

3. **24-hour Update Constraint** (active after first Monday):
   - Require 86400 seconds (24 hours) between updates
   - Return error if update attempted too soon

4. **Deployment and ID Storage**:
   - Deploy with generated keypair
   - Verify IDs match
   - Save both program IDs to shared-artifacts

### Phase 2: MIKO Token Creation (Week 4)
**Objective**: Create token with temporary authority structure

#### Pre-creation Verification
1. **Load and Verify Program IDs**:
   - Read programs.json from shared-artifacts
   - Verify both program IDs exist
   - Confirm programs are deployed and accessible
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

3. **Mint Total Supply** (CRITICAL: Do this BEFORE any authority changes):
   - Mint 1,000,000,000 MIKO tokens
   - Send to deployer wallet temporarily
   - Verify balance shows full supply
   - This must be done BEFORE revoking mint authority

4. **Save Token Info**:
   ```json
   // shared-artifacts/token.json
   {
     "mint": "...",
     "totalSupply": "1000000000",
     "temporaryAuthority": "... (deployer)",
     "freezeAuthority": null,
     "createdAt": "...",
     "verified": {
       "totalSupplyMinted": true,
       "inDeployerWallet": true,
       "transferFeeActive": true
     }
   }
   ```

5. **Critical Verification Gates**:
   > VC Gate:2.FEE_RATE – Verify transfer fee is exactly 3000 basis points (30%); write verification/vc2-fee-rate.json; BLOCK if not 30%
   
   > VC Gate:2.AUTHORITIES – Verify all authorities set to deployer, freeze authority null; write verification/vc2-authorities.json; BLOCK if mismatch

### Phase 3: System Initialization & Authority Transfer (Week 5)
**Objective**: Initialize all programs and transfer authorities to PDAs

#### Critical Order of Operations
**WARNING: Operations must be performed in this EXACT order**

1. **Calculate Vault PDA**:
   - Use findProgramAddressSync with 'vault' seed and mint pubkey
   - Record PDA address
   - This PDA will receive all authorities
   
   > VC Gate:3.PDA_CALCULATION – Verify PDA derivation is deterministic and correct; write verification/vc3-pda-calculation.json; BLOCK if calculation fails

2. **Initialize Programs** (Must be done BEFORE authority transfers):
   - **Step 1**: Initialize Vault
     - Call vault program's initialize method
     - Creates the Vault PDA account
     - Set all configuration parameters
     - Verify PDA created successfully
     
     > VC Gate:3.VAULT_EXCLUSIONS – Verify vault auto-excluded all 5 system accounts in both lists; write verification/vc3-vault-exclusions.json; BLOCK if any missing
   
   - **Step 2**: Initialize Smart Dial
     - Call dial program's initialize method
     - Set initial reward token to SOL mint address
     - Configure treasury wallet
     - Record initialization timestamp

3. **Verify All PDAs Exist**:
   - Check vault PDA exists and is initialized
   - Check dial state PDA exists
   - Do NOT proceed if any PDA is missing

4. **Transfer Token Authorities to Vault PDA** (Only after all PDAs exist):
   - Transfer fee config authority from deployer to Vault PDA
   - Transfer withdraw withheld authority from deployer to Vault PDA
   - Verify each transfer successful
   
   > VC Gate:3.AUTH_SYNC – Verify both authorities (fee config, withdraw) now point to Vault PDA; write verification/vc3-auth-sync.json; BLOCK if any mismatch

5. **Initial Transfer Testing**:
   - Test small transfer to verify 30% fee collection
   - Verify fees are withheld correctly
   - Check withheld fees can be queried
   
   > VC Gate:3.TRANSFER_TEST – Use STANDARD token transfer (no custom scripts); verify 30% fee deduction works; write verification/vc3-transfer-test.json; BLOCK if transfer fails or fee incorrect

6. **Revoke Mint Authority** (MUST be last):
   - Only after all tokens are minted
   - Only after all systems are initialized
   - Permanently revoke mint authority
   - Verify mint authority is null

7. **Distribute Initial Token Supply**:
   - Send tokens from deployer to appropriate wallets:
     - Keep liquidity allocation in deployer wallet
     - Team allocation (if any)
     - Marketing allocation (if any)
   - Ensure all allocations are complete
   - Verify liquidity allocation remains in deployer wallet

8. **Final System Validation**:
   - All authorities transferred correctly
   - Token distribution complete (liquidity remains in deployer)
   - All programs initialized and working
   - Fee collection mechanism active
   - Deployer wallet ready for liquidity deployment
   - System ready for launch

### Phase 4: Keeper Bot Development (Week 6-7)
**Objective**: Automated operations with launch-aware scheduling and comprehensive testing using Local Mainnet-Fork

1. **Configuration**:
   - Load environment variables for:
     - Vault program ID
     - Dial program ID
     - Keeper public key
     - Launch timestamp (set test value in Local Mainnet-Fork)
   - No private keys stored in configuration
   - Set up Local Mainnet-Fork environment for all testing
   
   > VC Gate:4.KEEPER_PREFLIGHT – Verify env loaded, programs reachable, test with simulated launch timestamp; write verification/vc4-keeper-preflight.json; BLOCK keeper startup if fail

2. **Fee Update Manager**:
   - Class to handle dynamic fee updates:
     - Track elapsed time since launch
     - Update to 15% at 5 minutes
     - Finalize at 5% at 10 minutes
     - Call vault program's updateTransferFee method
   - Test with Local Mainnet-Fork:
     - Set past launch timestamp
     - Fast-forward time to test transitions
     - Verify fee updates occur at exact times

3. **Fee Harvest Monitor**:
   - **Pre-harvest Validation**:
     - Verify vault is initialized
     - Verify harvest authority is set correctly
     - Check that withheld fees exist before attempting harvest
   - Class to monitor and harvest fees:
     - Define harvest threshold (500k MIKO with decimals)
     - Query total withheld fees across all accounts
     - Execute harvest when threshold reached
     - Batch accounts for efficiency (e.g., 20 per transaction)
     - Trigger swap and distribution after successful harvest
   - Test with Local Mainnet-Fork:
     - Generate test transactions to accumulate fees
     - Reach 500k MIKO threshold
     - Execute actual harvest transaction
     - Verify entire flow works correctly

4. **Twitter AI Integration** (Active after first Monday):
   - **Pre-integration Validation**:
     - Set test launch timestamp in the past
     - Calculate first Monday from launch timestamp
     - Verify Smart Dial is initialized with SOL
     
     > VC Gate:4.FIRST_MONDAY – Verify first Monday calculation logic; test with multiple launch dates; write verification/vc4-first-monday.json; BLOCK if calculation wrong
   - Function to check and update reward token:
     - Calculate first Monday after launch
     - Return early if before first Monday
     - At Monday 03:00 UTC, fetch @project_miko's pinned tweet
     - Extract single $SYMBOL mention from pinned message
     - Query all tokens with that symbol via Birdeye API
     - Select the token with highest 24h volume among matching symbols
     - Update reward token in Smart Dial program only if different from current
   - Test with Local Mainnet-Fork:
     - Simulate Monday condition
     - Test full token selection and update flow

5. **Distribution Engine**:
   - **Pre-distribution Requirements**:
     - Verify harvest has been completed
     - Verify reward token is set in Smart Dial
     - Verify treasury has reward tokens to distribute
   - Function to distribute rewards:
     - Get current reward token (SOL initially)
     - Query holders via Birdeye API
     - Get MIKO token price from Birdeye
     - Filter holders with $100+ USD value
     - Exclude reward_exclusions list members
     - Calculate proportional shares
     - Execute batch distributions only if holders exist
   - Test with Local Mainnet-Fork:
     - Create test holder accounts
     - Use real Birdeye API for prices
     - Test full distribution flow
   - **Implement Tax Flow Scenarios**:
     - **Scenario 1 - Reward Token is SOL**:
       - If keeper balance < 0.05 SOL:
         - Keep all collected tax as SOL
         - Use up to 20% for keeper (until 0.10 SOL)
         - Send excess to owner
         - Distribute 80% to holders
       - If keeper balance ≥ 0.05 SOL:
         - Distribute 20% to owner
         - Distribute 80% to holders
     - **Scenario 2 - Reward Token is NOT SOL**:
       - If keeper balance < 0.05 SOL:
         - Swap 20% (owner portion) to SOL
         - Keep SOL for keeper until 0.10 SOL
         - Send excess to owner
         - Swap 80% to reward token for holders
       - If keeper balance ≥ 0.05 SOL:
         - Swap all tax to reward token
         - Distribute 20% to owner, 80% to holders

6. **Tax Flow Implementation**:
   > VC Gate:4.TAX_FLOW_LOGIC – Test all tax scenarios; write verification/vc4-tax-flow-logic.json; BLOCK if scenarios fail
   
   > VC Gate:4.TAX_FLOW_EDGE – Test edge cases (exact 0.05 SOL, swap failures, concurrent harvests); write verification/vc4-tax-flow-edge.json; BLOCK production if fail

7. **Launch Script Preparation**:
   - Create launch coordination script with:
     - Pre-launch checklist verification
     - Raydium CLMM pool creation function
     - Launch Liquidity Ladder execution logic (refer to LAUNCH_LIQUIDITY_PARAMS.md)
     - Immediate launch timestamp setter
     - Fee update scheduler initialization
     - Keeper bot startup trigger
   - Prepare Launch Preflight Package (using LAUNCH_LIQUIDITY_PARAMS.md template):
     - Token pair: MIKO/SOL
     - Raydium fee tier (0.25% for standard pairs, 1% for exotic)
     - Initial price and price range configuration
     - Liquidity quantities for each stage
     - Deployer wallet funded with all liquidity
   - Test entire launch sequence with Local Mainnet-Fork:
     - Create test CLMM pool
     - Execute all liquidity stages with exact timing
     - Verify launch timestamp setting
     - Test fee transitions
   - Add timing safeguards and emergency procedures

8. **Scheduler**:
   - Launch-time operations:
     - Execute Launch Liquidity Ladder stages at T+60s, T+180s, T+300s (refer to LAUNCH_LIQUIDITY_PARAMS.md for timing)
     - Monitor Raydium CLMM price action for re-centering decisions
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

### Phase 5: Integration Testing & Mainnet Canary (Week 8-9)
**Objective**: Extended integration testing and production validation

**Testing Strategy**: Building on Phase 4's comprehensive Local Mainnet-Fork tests:
1. **Extended Integration Tests** - Multi-day scenarios, complex edge cases
2. **Mainnet Canary** (1.5 SOL) - Real environment with minimal stake

1. **Extended Integration Testing**:
   - Multi-day harvest cycles
   - Complex holder scenarios (1000+ holders)
   - Network congestion simulation
   - API failure recovery testing
   - First Monday token change across multiple weeks

2. **Mainnet Canary Deployment**:
   - Deploy with minimal liquidity (1.5 SOL)
   - Execute real Launch Liquidity Ladder:
     - T0: Bootstrap liquidity
     - T+60s: Stage A
     - T+180s: Stage B
     - T+300s: Stage C
   - Monitor real fee transitions:
     - 30% → 15% at 5 minutes
     - 15% → 5% at 10 minutes
   - Run for minimum 30 minutes
   - Execute at least 2 harvest cycles
   
   > VC Gate:LAUNCH_LIQUIDITY – Verify each deployment within ±5 seconds; confirm deployer wallet control; write verification/vc-launch-liquidity.json; PASS required before production
   
   > VC Gate:LAUNCH_TIMING – Record exact transition times; verify 5m/10m transitions within ±10 seconds; verify authority revoked; write verification/vc-launch-timing.json; BLOCK production if timing wrong
   
   > VC Gate:LAUNCH_LIQUIDITY – Verify each liquidity addition within ±5 seconds; confirm deployer wallet control; write verification/vc-launch-liquidity.json; BLOCK if timing wrong
   
   > VC Gate:LAUNCH_TIMING – Record exact transition times; verify 5m/10m transitions within ±10 seconds; verify authority revoked; write verification/vc-launch-timing.json; BLOCK production if timing wrong

3. **Final Validation**:
   - All harvest/swap/distribute cycles working
   - Tax flow scenarios validated in production
   - First Monday logic confirmed
   - $100 holder filtering accurate
   
   > VC Gate:ELIGIBILITY_SAMPLE – Test $100 holder calculation with sample data; compare to manual calculation; write verification/vc-eligibility-sample.json; BLOCK first distribution if mismatch

4. **Load Testing** (Local Mainnet-Fork):
   - 1000+ holder distribution simulation
   - High-frequency trading during launch period
   - API rate limit handling
   - Network congestion scenarios

### Phase 6: Production Deployment (Week 10)
**Objective**: Mainnet deployment with monitoring

1. **Pre-deployment Checklist**:
   - [ ] All tests passing (including 3-step pipeline validation)
   - [ ] All program IDs verified (declared = deployed)
   - [ ] Anti-sniper features tested
   - [ ] Launch script ready with staged liquidity logic
   - [ ] Fee update timers configured
   - [ ] First Monday calculation verified
   - [ ] Tax flow edge cases tested
   - [ ] All Phase 5 tests passed

2. **Deployment Order** (CRITICAL - Same process as devnet):
   1. Generate production keypairs for all programs *(optional - only if redeploying new IDs)*
   2. Update declare_id! with production addresses *(if using new keypairs)*
   3. Deploy Absolute Vault program
   4. Deploy Smart Dial program
   5. Verify both deployed IDs match declared IDs
   6. Create MIKO token with 30% initial fee
   7. Initialize all programs in correct order
   8. Transfer authorities after PDAs exist
   9. Prepare Raydium CLMM pool creation

3. **Launch Sequence with Launch Liquidity Ladder**:
   - **Pre-launch Final Check**:
     - Verify all programs initialized
     - Verify all authorities transferred
     - Verify keeper bot is running
     - Verify monitoring dashboard active
     - Verify Launch Preflight Package parameters (from LAUNCH_LIQUIDITY_PARAMS.md)
   - **Launch Execution**:
     - Create CLMM pool with bootstrap liquidity (minimal)
     - Configure initial narrow price range (±5%)
     - Set launch timestamp in same block if possible
     - Execute Launch Liquidity Ladder (using exact parameters from LAUNCH_LIQUIDITY_PARAMS.md):
       - T+60s: Stage A - narrow/midband liquidity
       - T+180s: Stage B - broader range, re-center
       - T+300s: Stage C - stability backstop
     - All from single deployer wallet
     - Log exact timestamps for verification
     
     > VC Gate:LAUNCH_LIQUIDITY (Production) – Verify each stage within ±5 seconds; write verification/vc-launch-liquidity-mainnet.json; CRITICAL for production validation
   
   - **Post-launch Monitoring**:
     - Confirm timestamp was set successfully
     - Monitor first transaction for 30% fee
     - Track liquidity stage timing
     - Alert team of any anomalies
   - **Fee Update Verification**:
     - At launch + 4 minutes 30 seconds: prepare for fee update
     - At launch + 5 minutes: verify 15% fee active
     - At launch + 9 minutes 30 seconds: prepare for final update
     - At launch + 10 minutes: verify 5% fee active and authority revoked
     
     > VC Gate:LAUNCH_TIMING (Production) – Verify all transitions within ±10 seconds; write verification/vc-launch-timing-mainnet.json; CRITICAL for fee mechanism validation

## Key Implementation Details

### Program ID Management (CRITICAL)
- **Never** use default or placeholder program IDs
- **Always** generate keypair before writing program code
- **Always** verify deployed ID matches declared ID
- **Always** save deployed IDs before proceeding to next phase

### Transfer Fee Mechanics
- Initial fee: 3000 basis points (30%)
- 5-minute fee: 1500 basis points (15%)
- Final fee: 500 basis points (5%)
- Maximum fee: u64::MAX (no upper limit)
- Transfer fee config authority: Vault PDA → Revoked after 10 min
- Withdraw withheld authority: Vault PDA (permanent)

### Anti-Sniper Protection
- **0-5 minutes**: 30% tax, Launch Liquidity Ladder in progress
- **5-10 minutes**: 15% tax, full liquidity deployed
- **10+ minutes**: 5% tax (permanent)

### Launch Liquidity Ladder (Single Wallet)
- **T0**: Create CLMM pool with bootstrap liquidity (minimal)
- **+60s**: Stage A - narrow/midband liquidity add
- **+180s**: Stage B - broader range, re-center based on price action
- **+300s**: Stage C - stability backstop before fee reduction
- All stages executed from single deployer wallet
- Raydium CLMM allows manual price range adjustment per stage
- Detailed parameters documented in LAUNCH_LIQUIDITY_PARAMS.md

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

### Undistributed Funds Handling (Critical for Early Launch)

#### The Problem
During early launch phases, especially with 30% tax deterring buyers, there may be no holders meeting the $100 USD threshold. Without proper handling, the 80% allocation for holders would get stuck in the keeper wallet indefinitely.

#### Solution: Distribution Engine V2 with Rollover Support

1. **Tracking Undistributed Amounts**:
   - Distribution Engine maintains persistent state for undistributed balances
   - Tracks: amount, token type, and last update timestamp
   - Stores in keeper bot's local database/file system

2. **Rollover Mechanism**:
   ```
   When harvest occurs:
   - Check for previous undistributed balance
   - If same token type: Add to current distribution
   - If different token: Log warning (handle separately)
   - Total distribution = new harvest + undistributed
   ```

3. **Distribution Flow**:
   - **No Eligible Holders**: 
     - Entire holder allocation (80%) marked as undistributed
     - Owner still receives their 20%
     - Amount saved for next cycle
     - Log event for monitoring
   
   - **Eligible Holders Exist**:
     - Include any previous undistributed amount
     - Distribute total to current eligible holders
     - Clear undistributed balance after success

4. **Emergency Withdrawal Function**:
   - Authority-only function to recover stuck funds
   - Transfers undistributed balance to treasury
   - Used only when:
     - Multiple cycles pass with no eligible holders
     - Token type changes prevent automatic rollover
     - Technical issues require manual intervention
   - All withdrawals logged with timestamp and reason

5. **Example Scenario**:
   ```
   Cycle 1: 500k MIKO harvested → 0 eligible holders
            Owner gets 20% (100k MIKO value)
            80% (400k MIKO value) saved as undistributed
   
   Cycle 2: 500k MIKO harvested → 3 eligible holders
            Total to distribute: 500k + 400k = 900k MIKO value
            Owner gets 20% of new (100k MIKO value)
            Holders get 80% of new + all previous (800k MIKO value)
   ```

6. **Monitoring & Alerts**:
   - Alert when funds marked as undistributed
   - Daily report of undistributed balances
   - Warning if undistributed > 3 cycles old
   - Critical alert if undistributed > 1M MIKO value

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
   - Staged liquidity deployment prevents large accumulation
   - MEV protection through batching
   - Slippage controls on swaps

## Testing Strategy

### Unit Tests
- Each instruction independently
- Time-based fee updates
- Staged liquidity timing
- Edge cases (empty lists, zero balances)
- Authority validations

### Integration Tests
- Multi-program interactions
- Full tax cycle with dynamic fees
- Staged liquidity deployment
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
   - Liquidity deployment timing
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
# Checks: Programs compiled, deployed, IDs saved, IDs match

# Phase 2 validation  
./scripts/verify-phase.sh 2
# Checks: Token created, supply minted, authorities correct

# Phase 3 validation
./scripts/verify-phase.sh 3
# Checks: All PDAs exist, authorities transferred, mint revoked

# Continue for each phase...
```

## Success Criteria

1. **Functional Requirements**
   - ✅ Dynamic transfer fee (30% → 15% → 5%)
   - ✅ Launch Liquidity Ladder for anti-sniper protection
   - ✅ Threshold-based fee harvesting (500k MIKO)
   - ✅ 20%/80% split logic of collected tax
   - ✅ Tax flow scenarios for keeper SOL management
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
   - ✅ Edge cases handled (exact 0.05 SOL, swap failures, concurrent harvests)

3. **Performance Requirements**
   - ✅ Handle 1000+ holders
   - ✅ Complete harvest/distribution cycle efficiently
   - ✅ Smooth fee transitions
   - ✅ 99.9% uptime

4. **Process Requirements**
   - ✅ All program IDs match (declared = deployed)
   - ✅ Correct initialization order followed
   - ✅ Authority transfers after PDA creation
   - ✅ Mint authority revoked last
   - ✅ Testing strategy addresses devnet limitations
   - ✅ Tax flow edge cases properly handled
   - ✅ Launch verification applies to both test and production

This plan ensures all README.md features are implemented without compromise while maintaining security, phase isolation, robust anti-sniper protection through dynamic fees and Launch Liquidity Ladder, tax flow scenario handling, and correct deployment processes.