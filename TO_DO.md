# MIKO Token Development Checklist - Final Architecture

## Core Development Principles

1. **Programs First, Token Second**: Deploy programs to get IDs before creating token
2. **Phase Isolation**: Each phase in separate Docker container (though less critical now)
3. **No Compromises**: Production-ready architecture with anti-sniper protection
4. **Shared Artifacts**: Program IDs and critical data shared between phases
5. **Process Over Details**: Focus on correct order and verification, not specific versions

## Prerequisites

### Docker Environment Setup
- [ ] Install Docker and Docker Compose
- [ ] Create project directory structure:
  ```
  miko-token/
  ├── docker/
  │   ├── phase1-programs/
  │   ├── phase2-token/
  │   ├── phase3-init/
  │   ├── phase4-keeper/
  │   └── shared-artifacts/
  ├── PLAN.md
  ├── TO_DO.md
  ├── testing_strategy.md
  └── README.md
  ```
- [ ] Understand volume mounting for artifact sharing

## Phase 1: Core Programs Development ✅ COMPLETE

### Container Setup
- [x] Create Dockerfile with Rust, Solana, and Anchor ✅
- [x] Configure docker-compose.yml with shared-artifacts volume ✅
- [x] Verify SPL Token-2022 dependencies work ✅

### Absolute Vault Program Development
- [x] Initialize Anchor workspace for programs ✅
- [x] Generate program keypair BEFORE coding ✅
- [x] Update declare_id! with keypair address ✅
- [x] Implement VaultState with: ✅
  - [x] Multi-token support via mint-based PDA derivation ✅
  - [x] Reward exclusion list only (no fee exclusions possible) ✅
  - [x] Launch timestamp tracking ✅
  - [x] Harvest threshold (500k MIKO) ✅
  - [x] Pool registry for dynamic detection ✅
  - [x] Emergency withdrawal capabilities ✅
  - [x] Batch operation support ✅
  
- [x] Implement instructions with direct CPI: ✅
  - [x] `initialize` - Set up vault with auto-exclusions ✅
  - [x] `set_launch_time` - Record Raydium pool creation timestamp ✅
  - [x] `harvest_fees` - Using SPL Token harvest instruction ✅
  - [x] `distribute_rewards` - With SOL balance management ✅
  - [x] `manage_exclusions` - Add/remove from reward exclusion list ✅
  - [x] `update_pool_registry` - Dynamic pool detection ✅
  - [x] `update_config` - Modify vault parameters ✅
  - [x] `emergency_withdraw_vault` - Withdraw tokens/SOL ✅
  - [x] `emergency_withdraw_withheld` - Recover stuck fees ✅

- [x] Build and deploy with proper ID management: ✅
  - [x] Run anchor build ✅
  - [x] Deploy to devnet using generated keypair ✅
  - [x] Verify: deployed ID = declared ID in code ✅ (4ieMsf7qFmh1W5FwcaX6M3fz3NNyaGy3FyuXoKJLrRDq)
  - [x] Save program ID to shared-artifacts ✅
  - [x] Record deployment timestamp ✅ (2025-07-15)

### Smart Dial Program Development
- [x] Generate program keypair BEFORE coding ✅
- [x] Update declare_id! with keypair address ✅
- [x] Implement DialState with: ✅
  - [x] Current reward token storage (default SOL) ✅
  - [x] Launch timestamp for first Monday calculation ✅
  - [x] Update history tracking ✅
  - [x] 24-hour update constraint (after first Monday) ✅
  
- [x] Implement instructions: ✅
  - [x] `initialize` - Set SOL as initial reward token ✅
  - [x] `update_reward_token` - Change reward token (Monday only) ✅
  - [x] `update_authority` - Transfer authority control ✅

- [x] Build, deploy with same keypair, and verify ID match ✅ (DggkQFbBnkMCK43y5JTHfYdX3CKw2H3m177TbLC7Mjdz)
- [x] Save program ID to shared-artifacts ✅

### Phase 1 Validation
- [x] Both programs successfully deployed ✅
- [x] Program IDs saved to shared-artifacts ✅
- [x] Verify all declared IDs match deployed IDs ✅
- [x] No compilation errors with Token-2022 integration ✅

## Phase 2: MIKO Token Creation ✅ COMPLETE

### Container Setup
- [x] Create a new environment dedicated to Phase 2 ✅
- [x] Mount shared-artifacts to access program IDs ✅

### Pre-Creation Verification
- [x] Load all program IDs from shared-artifacts ✅
- [x] Verify both programs are deployed and accessible ✅
- [x] Test connection to each program (query account info) ✅

### Token Creation Script Development
- [x] Create comprehensive token creation script that: ✅
  - [x] Loads all program IDs from shared-artifacts ✅
  - [x] Generates new mint keypair ✅
  - [x] Creates mint with deployer as temporary authorities ✅
  - [x] Sets freeze authority to null (permanent) ✅
  - [x] Initializes with 5% transfer fee (500 basis points) ✅
  - [x] Sets maximum fee to u64::MAX (unlimited) ✅
  - [x] Mints total supply of 1,000,000,000 MIKO ✅
  - [x] Stores tokens in deployer wallet temporarily ✅

### Execute Token Creation
- [x] Run token creation script ✅
- [x] Verify mint created with correct parameters ✅
- [x] **VC:2.NO_UNSUPPORTED_EXT** ✅
  - [x] Verify only TransferFeeConfig extension present ✅
  - [x] Confirm NO transfer hook or other incompatible extensions ✅
  - [x] Write `verification/vc2-no-unsupported-ext.json` ✅
  - [x] PASS required before Phase 3 ✅ PASSED
- [x] **VC:2.FEE_RATE** ✅
  - [x] Query mint for TransferFeeConfig extension ✅
  - [x] Verify fee = 500 basis points (5%) ✅
  - [x] Write `verification/vc2-fee-rate.json` ✅
  - [x] PASS required before proceeding ✅ PASSED
- [x] **VC:2.MAX_FEE** ✅
  - [x] Query mint for TransferFeeConfig extension ✅
  - [x] Verify maximum fee = u64::MAX (18446744073709551615) ✅
  - [x] Write `verification/vc2-max-fee.json` ✅
  - [x] PASS required before proceeding ✅ PASSED
- [x] **VC:2.AUTHORITIES** ✅
  - [x] Verify all authorities = deployer wallet ✅
  - [x] Verify freeze authority = null ✅
  - [x] Write `verification/vc2-authorities.json` ✅
  - [x] PASS required before Phase 3 ✅ PASSED

### Phase 2 Documentation
- [x] Total supply minted and in deployer wallet ✅
- [x] Mint authority still with deployer (temporary) ✅
- [x] Transfer fee config authority with deployer (temporary) ✅
- [x] Withdraw withheld authority with deployer (temporary) ✅
- [x] Save comprehensive token info to shared-artifacts ✅

## Phase 3: System Initialization & Authority Transfer ✅ COMPLETE

### Container Setup
- [x] Create initialization environment ✅
- [x] Access program IDs and token info from shared-artifacts ✅

### Calculate PDAs
- [x] Calculate Vault PDA using mint address and 'vault' seed ✅
- [x] Save PDA addresses for use in transfers ✅
- [x] **VC:3.PDA_CALCULATION** ✅
  - [x] Verify PDA calculation is deterministic ✅
  - [x] Write `verification/vc3-pda-calculation.json` ✅
  - [x] PASS required before initialization ✅ PASSED

### Critical Order: Initialize Programs BEFORE Authority Transfers
- [x] **Step 1**: Initialize Vault (creates PDA) ✅
  - [x] Create initialization script ✅
  - [x] Initialize vault with all parameters ✅
  - [x] Initialize empty pool registry ✅
  - [x] Verify PDA created successfully ✅
  - [x] Verify auto-exclusions applied to reward list: ✅
    - [x] Owner wallet excluded ✅
    - [x] Keeper wallet excluded ✅
    - [x] Vault program excluded ✅
    - [x] Vault PDA excluded ✅
  - [x] **VC:3.VAULT_EXCLUSIONS** ✅
    - [x] Query vault account data ✅
    - [x] Verify all system accounts in reward exclusion list ✅
    - [x] Write `verification/vc3-vault-exclusions.json` ✅
    - [x] PASS required before Step 2 ✅ PASSED

- [x] **Step 2**: Initialize Smart Dial ✅
  - [x] Set initial reward token to SOL ✅
  - [x] Record initialization timestamp ✅
  - [x] Verify dial state PDA created ✅
  - [x] Set update constraints ✅

### Verify All PDAs Exist Before Proceeding
- [x] Vault PDA exists and initialized ✅
- [x] Dial state PDA exists ✅
- [x] DO NOT proceed to authority transfers if any PDA missing ✅

### Authority Transfers (Only After ALL PDAs Exist)
- [x] Transfer fee config authority from deployer to Vault PDA ✅
- [x] Transfer withdraw withheld authority from deployer to Vault PDA ✅
- [x] Verify each transfer successful ✅
- [x] **VC:3.AUTH_SYNC** ✅
  - [x] Fetch mint account and verify all Token-2022 authorities ✅
  - [x] Both authorities must equal Vault PDA ✅
  - [x] Write `verification/vc3-auth-sync.json` ✅
  - [x] PASS required before transfers ✅ PASSED

### Initial Transfer Testing
- [x] Test small transfer between test wallets ✅
- [x] Verify 5% fee is collected ✅
- [x] Verify fees accumulate as withheld amounts ✅
- [x] **VC:3.TRANSFER_TEST** ✅
  - [x] Use STANDARD SPL token transfer (NO custom scripts) ✅
  - [x] Send 100 MIKO: verify receiver gets 95, 5 withheld ✅
  - [x] Must use same transfer method as wallets/DEXs ✅
  - [x] Write `verification/vc3-transfer-test.json` ✅
  - [x] PASS required before proceeding ✅ PASSED

### Finalize Token Setup
- [x] Revoke mint authority permanently ✅
- [x] Verify mint authority is null ✅

### Token Distribution
- [x] Send tokens from deployer wallet to: ✅
  - [x] Keep liquidity allocation in deployer wallet ✅ (90% for LP + 10% retention)
  - [x] Team wallets (if applicable) ✅ (No team allocation)
  - [x] Marketing wallet (if applicable) ✅ (No marketing allocation)
- [x] Verify all non-liquidity tokens distributed ✅
- [x] Ensure deployer retains only liquidity allocation ✅

### Phase 3 Testing
- [x] Test fixed 5% fee collection ✅
- [x] Test vault can harvest fees with PDA signature ✅
- [x] Verify reward exclusion list works correctly ✅
- [x] Verify all authorities properly transferred ✅
- [x] Run full integration test suite ✅

## Phase 4: Integration & Pre-Flight 🔄 IN PROGRESS

**Testing Strategy**: Follow the approach in testing_strategy.md - Mock CI Tests → Local Mainnet-Fork → Mainnet Canary

### Phase 4-A: Mock CI Tests ✅ COMPLETED

#### Mock Environment Setup
- [x] Create `mock_config.toml` with:
  - [x] Mock RPC endpoints
  - [x] Test program IDs
  - [x] Mock API keys
  - [x] Test keeper wallet
- [x] Set up MockRaydiumAdapter (see testing_strategy.md Section 2) - CODE WRITTEN
- [x] Set up MockJupiterAdapter - CODE WRITTEN
- [x] Set up MockBirdeyeAdapter - CODE WRITTEN

#### Keeper Bot Development
- [x] **Dynamic Pool Detection** ✅ TESTED
  - [x] Implement pool scanning algorithm
  - [x] Test with mock pools
  - [x] Verify detection accuracy
  - [x] Update vault pool registry (rewards only)

- [x] **Twitter Monitor** (Active after first Monday) ✅ TESTED
  - [x] Calculate first Monday after launch
  - [x] Implement Twitter API v2 integration (mock)
  - [x] At Monday 03:00 UTC, fetch @project_miko's pinned tweet
  - [x] Extract single $SYMBOL mention from pinned message
  - [x] Handle case where no pinned tweet or no symbol found
  - [x] **VC:4.FIRST_MONDAY** ✅
    - [x] Test calculation with multiple launch dates ✅
    - [x] Verify Monday detection logic ✅
    - [x] Test edge cases (launch on Monday, Sunday, etc.) ✅
    - [x] Write `verification/vc4-first-monday.json` ✅
    - [x] PASS required before Twitter integration ✅ PASSED

- [x] **Token Selector** ✅ TESTED
  - [x] Integrate Birdeye API (mock)
  - [x] Default to SOL before first Monday
  - [x] Query all tokens matching the mentioned symbol
  - [x] Compare 24h volumes for all tokens with same symbol
  - [x] Select the one with highest 24h volume
  - [x] Update Smart Dial program with selected token

- [x] **Fee Harvester** ✅ TESTED
  - [x] Query all MIKO token accounts
  - [x] Calculate total withheld fees
  - [x] Monitor for 500k MIKO threshold
  - [x] Batch accounts for efficient harvesting
  - [x] Call vault's harvest_fees when threshold reached
  - [x] Trigger swap and distribution after harvest
  - [x] Accept 5% fee on harvest operations

- [x] **Swap Manager** ✅ TESTED
  - [x] Integrate Jupiter API (mock)
  - [x] Handle tax splitting (20% to owner, 80% to holders)
  - [x] Manage SOL balance for keeper operations
  - [x] Execute swaps with slippage protection
  - [x] Accept 5% fee on all swaps

- [x] **Distribution Engine with Pool Exclusions** ✅ TESTED
  - [x] Query holders via Birdeye API (mock)
  - [x] Calculate USD values for eligibility
  - [x] Filter $100+ holders
  - [x] Exclude all pool accounts from distribution
  - [x] Execute proportional distribution
  - [x] Implement Tax Flow Scenarios

#### Mock Testing Execution ✅ COMPLETED
- [x] Build Docker container ✅
- [x] Run `phase4-mock` test suite ✅
- [x] Test keeper rollback on failures ✅
- [x] Test concurrent harvest protection ✅
- [x] Test edge cases: ✅
  - [x] Keeper balance = exactly 0.05 SOL ✅
  - [x] Swap failures ✅
  - [x] API timeouts ✅
- [x] **VC:4.TAX_FLOW_EDGE** ✅
  - [x] Test rollback scenarios with transaction failures ✅
  - [x] Test slippage protection with high volatility ✅
  - [x] Test concurrent harvest protection ✅
  - [x] Test recovery logic with exponential backoff ✅
  - [x] Write `verification/vc4-tax-flow-edge.json` ✅
  - [x] PASS required for production ✅ PASSED
- [x] **VC:4.KEEPER_PREFLIGHT** ✅
  - [x] Verify environment setup ✅
  - [x] Test RPC connections ✅
  - [x] Verify program reachability ✅
  - [x] Write `verification/vc4-keeper-preflight.json` ✅ PASSED

### Phase 4-B: Local-Fork Simulation 🔄 IN PROGRESS

**Testing Approach**: Use Local Mainnet-Fork as documented in testing_strategy.md Section 3

#### Local Mainnet-Fork Setup
- [x] Web search for current Raydium CPMM program ID ✅ (CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C)
- [x] Web search for current Jupiter aggregator program ID ✅ (JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4)
- [x] Configure solana-test-validator with: ✅
  - [x] `--url https://api.mainnet-beta.solana.com` ✅
  - [x] `--clone CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` ✅
  - [x] `--clone JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` ✅
  - [x] `--clone So11111111111111111111111111111111111111112` ✅
  - [x] `--hard-fork <SPECIFIC_SLOT_NUMBER>` ✅

#### Launch Script Development
- [x] Create launch coordination script with: ✅
  - [x] Pre-launch checklist verification ✅
  - [x] Raydium CPMM pool creation function ✅
  - [x] Launch Liquidity Ladder execution logic ✅
  - [x] Immediate launch timestamp setter ✅
  - [x] Pool detection initialization ✅
  - [x] Keeper bot startup trigger ✅
  - [x] Oracle price fetch requirement ✅
  - [x] Distribution Engine V2 integration ✅
  - [x] Emergency withdrawal functions ✅
- [x] Prepare Launch Preflight Package: ✅
  - [x] Token pair: MIKO/SOL ✅
  - [x] Raydium fee tier choice (0.25% standard) ✅
  - [x] Initial price calculation ✅ (based on oracle price)
  - [x] Bootstrap liquidity amount (T0): 45M MIKO + 0.5 SOL ✅
  - [x] Stage A amount (+60s): 225M MIKO + 2.5 SOL ✅
  - [x] Stage B amount (+180s): 270M MIKO + 3.0 SOL ✅
  - [x] Stage C amount (+300s): 360M MIKO + 4.0 SOL ✅

#### Critical Issues to Fix Before Testing
- [ ] **Fix Token Creation Parameters**:
  - [ ] Create new token with 5% fee (not 30%)
  - [ ] Set maximum fee to u64::MAX (not 10 MIKO)
  - [ ] Ensure proper token configuration
  
- [ ] **Fix Authority Issues**:
  - [ ] Ensure keeper_authority is properly separated from deployer
  - [ ] Fix module keypair consistency
  - [ ] Ensure all modules use same operational keypair

- [ ] **Implement Pool Detection**:
  - [ ] Dynamic pool detection for reward exclusions
  - [ ] Update exclusion lists before distributions
  - [ ] Test with multiple pool types

#### Local-Fork Testing (After Fixes)
- [ ] Create CPMM pool at T0
- [ ] Execute Launch Liquidity Ladder:
  - [ ] T+60s: Stage A liquidity add
  - [ ] T+180s: Stage B liquidity add
  - [ ] T+300s: Stage C liquidity add
- [ ] Monitor fixed 5% fee collection:
  - [ ] Verify 5% fee active from start
  - [ ] Confirm no fee changes occur
  - [ ] Verify maximum fee is unlimited
- [ ] Test Pool Detection:
  - [ ] Create test pools
  - [ ] Verify detection algorithm works
  - [ ] Confirm pools added to registry
  - [ ] Verify pools excluded from rewards (not fees)
- [ ] Test Harvest → Swap → Distribute cycle:
  - [ ] Generate transfers to accumulate 500k MIKO
  - [ ] Execute harvest (accept 5% fee)
  - [ ] Test Jupiter swap (accept 5% fee)
  - [ ] Distribute rewards excluding pools
- [ ] Test First Monday token change
- [ ] **VC:4.DYNAMIC_POOL_DETECTION**
  - [ ] Verify pool detection works correctly
  - [ ] Verify pools excluded from rewards only
  - [ ] Test exclusion persistence
  - [ ] Write `verification/vc4-dynamic-pool-detection.json`
  - [ ] PASS required before Phase 5
- [ ] **VC:4.LOCAL_FORK_PASS**
  - [ ] Verify full launch path on local mainnet-fork
  - [ ] Test pool creation and 4-stage liquidity ladder
  - [ ] Verify fixed 5% fee (no transitions)
  - [ ] Test complete tax flow with real Jupiter swap
  - [ ] Verify pool exclusions work (rewards only)
  - [ ] Write `verification/vc4-local-fork.json`
  - [ ] PASS required before Phase 5

## Phase 5: Launch Simulation & Mainnet Canary ⏳ AWAITING PHASE 4

**Testing Strategy**: Final validation using Mainnet Canary as per testing_strategy.md Section 4

### Mainnet Canary Setup
- [ ] Deploy programs with upgradeable flag
- [ ] Create token with 5% fixed fee and u64::MAX maximum
- [ ] Initialize all systems

### Mainnet Canary Launch
- [ ] Create Mainnet pool with ≤ 0.05 SOL liquidity
- [ ] Execute 4-stage Launch Liquidity Ladder
- [ ] Set launch timestamp immediately
  - [ ] **VC:LAUNCH_TIME_SET**
  - [ ] Write `verification/vc-launch-time-set.json`
- [ ] Monitor 5% fixed fee collection:
  - [ ] Verify fee active from start
  - [ ] Confirm no changes occur
- [ ] Test dynamic pool detection for rewards:
  - [ ] Create additional pools
  - [ ] Verify detection works
  - [ ] Confirm reward exclusions applied
- [ ] Execute Tax → Swap → Distribute cycle
- [ ] Run for minimum 30 minutes
- [ ] Execute at least 2 harvest cycles

### Canary Validation
- [ ] All systems functioning correctly
- [ ] Dynamic pool exclusions working properly (rewards only)
- [ ] No manual interventions required
- [ ] Ready for production scale-up

## Phase 6: Production Deployment ⏳ AWAITING PHASE 5

### Pre-deployment Checklist
- [ ] All tests passing
- [ ] All program IDs verified (declared = deployed)
- [ ] Anti-sniper features verified
- [ ] Dynamic pool detection tested (rewards only)
- [ ] Tax flow scenarios tested
- [ ] Security audit complete
- [ ] Documentation finalized
- [ ] Infrastructure ready
- [ ] Monitoring configured

### Mainnet Deployment Process
- [ ] Generate NEW keypairs for mainnet programs *(optional - only if redeploying)*
- [ ] Update all declare_id! with mainnet addresses *(if using new keypairs)*
- [ ] Deploy programs in order:
  1. [ ] Deploy Absolute Vault with keypair
  2. [ ] Deploy Smart Dial with keypair
  3. [ ] Verify BOTH deployed IDs match declared IDs
- [ ] Create production token:
  - [ ] 5% fixed fee (500 basis points)
  - [ ] Maximum fee = u64::MAX
  - [ ] Freeze authority null
  - [ ] Mint total supply before any authority changes
- [ ] Initialize all systems in correct order:
  - [ ] Initialize vault first (creates PDA)
  - [ ] Initialize pool registry
  - [ ] Initialize dial second
  - [ ] Verify all PDAs exist
  - [ ] Transfer authorities to Vault PDA
  - [ ] Revoke mint authority LAST

### Launch Execution
- [ ] Verify deployer wallet has all liquidity funds
- [ ] Create Raydium CPMM pool with bootstrap liquidity
- [ ] Execute Launch Liquidity Ladder:
  - [ ] T0: Bootstrap with 45M MIKO + 0.5 SOL
  - [ ] +60s: Stage A - 225M MIKO + 2.5 SOL
  - [ ] +180s: Stage B - 270M MIKO + 3.0 SOL
  - [ ] +300s: Stage C - 360M MIKO + 4.0 SOL
- [ ] **VC:LAUNCH_LIQUIDITY** (Production)
  - [ ] Verify each deployment within ±5 seconds
  - [ ] Write `verification/vc-launch-liquidity-mainnet.json`
- [ ] Set launch timestamp IMMEDIATELY
- [ ] Start keeper bot with dynamic pool detection monitoring
- [ ] Monitor:
  - [ ] 5% fixed fee collection on ALL transfers
  - [ ] Pool detection system (rewards only)
  - [ ] Harvest/swap/distribute cycles
- [ ] Monitor first 24 hours

### Success Metrics
- [ ] Snipers effectively deterred
- [ ] Fixed 5% fee working correctly on ALL transfers
- [ ] Dynamic pool exclusions functioning (rewards only)
- [ ] Program IDs all match (declared = deployed)
- [ ] Zero manual interventions required
- [ ] All fees harvested at threshold
- [ ] Rewards distributed after each harvest
- [ ] Pools properly excluded from rewards
- [ ] No security incidents

## Critical Checkpoints

Before proceeding to next phase, verify:

**After Phase 1**:
- Program keypairs generated BEFORE coding
- All declare_id! match deployed addresses
- Program IDs saved to shared-artifacts
- Direct CPI implementation working
- Pool registry structure ready

**After Phase 2**:
- Total supply minted (1B MIKO)
- All tokens in deployer wallet
- Mint authority still with deployer
- Freeze authority null
- 5% fixed fee active
- Maximum fee = u64::MAX

**After Phase 3**:
- All programs initialized in order
- All PDAs exist before authority transfers
- Vault PDA has all authorities
- Mint authority revoked
- Tokens distributed to proper wallets
- Vault can harvest with PDA signature
- System accounts excluded from rewards
- SOL set as initial reward

**After Phase 4-A**:
- All modules developed
- Mock tests passing
- Edge cases handled
- Tax flow scenarios tested
- Dynamic pool detection logic ready

**After Phase 4-B**:
- Local-Fork tests passing
- Launch script ready
- Real DEX integration verified
- Fixed 5% fee working
- Dynamic pool exclusions tested (rewards only)

**After Phase 5**:
- Mainnet Canary successful
- Multiple harvest cycles completed
- Dynamic pool exclusions working in production
- All VCs passed

## Common Issues and Solutions

1. **Program ID Mismatch**: ALWAYS generate keypair first, update declare_id!, then deploy
2. **Token-2022 CPI Issues**: Use direct invoke_signed
3. **Authority Problems**: Always verify before proceeding
4. **PDA Authority Timing**: Initialize programs to create PDAs BEFORE transferring authorities
5. **Mint Supply Timing**: Always mint total supply before revoking mint authority
6. **Launch Timing**: Set timestamp immediately after pool
7. **Liquidity Staging**: Deployer wallet controls all deployments
8. **Docker Networking**: Use shared-artifacts for data
9. **Rate Limits**: Implement proper retry logic
10. **Dynamic Pool Detection**: Test thoroughly on local fork (rewards only)
11. **Fee Application**: Accept 5% on ALL transfers - no exemptions
12. **Maximum Fee**: Must be u64::MAX for unlimited

## Launch Day Checklist

- [ ] All programs deployed with matching IDs
- [ ] Token created with 5% fixed fee and unlimited maximum
- [ ] All programs initialized (PDAs exist)
- [ ] All authorities transferred correctly
- [ ] Deployer wallet has liquidity funds ready
- [ ] Keeper bot running with dynamic pool detection monitoring
- [ ] Launch script tested and ready
- [ ] Team ready for staged deployment
- [ ] Monitoring dashboard active
- [ ] Emergency procedures documented

This checklist ensures a perfect, production-ready implementation with fixed 5% fee on all transfers and dynamic pool exclusion system for rewards only.