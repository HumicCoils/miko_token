# MIKO Token Development Checklist - Final Architecture

## Core Development Principles

1. **Programs First, Token Second**: Deploy programs to get IDs before creating token
2. **Phase Isolation**: Each phase in separate Docker container
3. **No Compromises**: Production-ready architecture with anti-sniper protection
4. **Shared Artifacts**: Program IDs and critical data shared between phases

## Prerequisites

### Docker Environment Setup
- [x] Install Docker and Docker Compose
- [x] Create project directory structure:
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
  └── README.md
  ```
- [x] Understand volume mounting for artifact sharing

## Phase 1: Core Programs Development ✅ COMPLETE

### Container Setup
- [x] Create Dockerfile with Rust, Solana, and Anchor
- [x] Configure docker-compose.yml with shared-artifacts volume
- [x] Verify SPL Token-2022 dependencies work

### Absolute Vault Program Development
- [x] Initialize Anchor workspace for programs
- [x] Implement VaultState with:
  - [x] Multi-token support via mint-based PDA derivation
  - [x] Dual exclusion lists (fee_exclusions, reward_exclusions)
  - [x] Launch timestamp tracking
  - [x] Fee finalization flag
  - [x] Harvest threshold (500k MIKO)
  - [x] Emergency withdrawal capabilities
  - [x] Batch operation support
  
- [x] Implement instructions with direct CPI:
  - [x] `initialize` - Set up vault with auto-exclusions
  - [x] `set_launch_time` - Record Raydium pool creation timestamp
  - [x] `update_transfer_fee` - Handle 30% → 15% → 5% transitions
  - [x] `harvest_fees` - Using SPL Token harvest instruction
  - [x] `distribute_rewards` - With SOL balance management
  - [x] `manage_exclusions` - Add/remove from lists
  - [x] `update_config` - Modify vault parameters
  - [x] `emergency_withdraw_vault` - Withdraw tokens/SOL
  - [x] `emergency_withdraw_withheld` - Recover stuck fees

- [x] Build and deploy:
  - [x] Run anchor build
  - [x] Deploy to devnet
  - [x] Save program ID to shared-artifacts

### Transfer Hook Program Development
- [x] Create separate Anchor program for transfer hooks
- [x] Implement TransferHookConfig with:
  - [x] Launch time storage
  - [x] Token mint reference
  - [x] Total supply tracking
  
- [x] Implement hook logic:
  - [x] `initialize` - Set configuration
  - [x] `process_transfer` - Enforce 1% limit for 10 minutes
  - [x] Auto-deactivation after anti-sniper period

- [x] Build, deploy, and save program ID

### Smart Dial Program Development
- [x] Implement DialState with:
  - [x] Current reward token storage (default SOL)
  - [x] Launch timestamp for first Monday calculation
  - [x] Update history tracking
  - [x] 24-hour update constraint (after first Monday)
  
- [x] Implement instructions:
  - [x] `initialize` - Set SOL as initial reward token
  - [x] `update_reward_token` - Change reward token (Monday only)
  - [x] `update_treasury` - Modify treasury wallet
  - [x] `update_authority` - Transfer authority control (implemented)

- [x] Build, deploy, and save program ID

### Validation
- [x] All three programs successfully deployed
- [x] Program IDs saved to shared-artifacts
- [x] No compilation errors with Token-2022 integration

## Phase 2: MIKO Token Creation ✅ COMPLETE

### Container Setup
- [x] Create a new environment dedicated to Phase 2
- [x] Mount shared-artifacts to access program IDs

### Token Creation Script Development
- [x] Create comprehensive token creation script that:
  - [x] Loads all program IDs from shared-artifacts
  - [x] Generates new mint keypair
  - [x] Creates mint with deployer as temporary authorities
  - [x] Sets freeze authority to null (permanent)
  - [x] Initializes with 30% transfer fee (3000 basis points)
  - [x] Adds transfer hook extension
  - [x] Mints total supply of 1,000,000,000 MIKO
  - [x] Stores tokens in deployer wallet temporarily

### Execution and Verification
- [x] Run token creation script
- [x] Verify token created with correct setup:
  - [x] mintAuthority: deployer (temporary)
  - [x] freezeAuthority: null (never set)
  - [x] withdrawWithheldAuthority: deployer (temporary)
  - [x] transferFeeConfigAuthority: deployer (temporary)
  - [x] transferHookAuthority: deployer (temporary)
  - [x] totalSupply: 1,000,000,000 MIKO
- [x] Verify extensions properly initialized
- [x] Save comprehensive token info to shared-artifacts
- [x] Note: Transfer testing not possible until Phase 3 hook initialization

## Phase 3: System Initialization & Authority Transfer ⚠️ BLOCKED

### Container Setup
- [x] Create initialization environment
- [x] Access program IDs and token info from shared-artifacts

### Calculate PDAs
- [x] Calculate Vault PDA using mint address and 'vault' seed
- [x] Save PDA addresses for use in transfers

### ⚠️ CRITICAL BLOCKER: Program ID Mismatch
- [x] IDL generation issue RESOLVED with manual construction
- [ ] Transfer Hook has mismatched declared vs deployed program IDs
- [ ] Smart Dial has mismatched declared vs deployed program IDs  
- [ ] See DEVELOPMENT_STATUS.md for detailed blocker description

### Vault Initialization (PARTIAL COMPLETE)
- [x] Create initialization script
- [x] Initialize vault (creates PDA) with:
  - [x] Treasury wallet address
  - [x] Owner wallet address
  - [x] Minimum hold amount ($100 worth)
  - [x] Keeper wallet address
  - [x] Harvest threshold (500k MIKO)
- [x] Verify auto-exclusions applied:
  - [x] Owner wallet excluded
  - [x] Treasury excluded
  - [x] Keeper wallet excluded
  - [x] Vault program excluded
  - [x] Vault PDA excluded

### Transfer Hook Initialization
- [ ] Must be done BEFORE any transfers
- [ ] Initialize with token mint and total supply
- [ ] Set launch_time to 0 (not launched)
- [ ] Verify hook is active
- [ ] Verify no transfer limits before launch

### Authority Transfers
- [x] Transfer fee config authority from deployer to Vault PDA
- [x] Transfer withdraw withheld authority from deployer to Vault PDA
- [x] Transfer hook authority from deployer to Vault PDA
- [x] Verify all authorities transferred correctly

### Initial Transfer Testing
- [ ] Test small transfer between test wallets
- [ ] Verify 30% fee is collected
- [ ] Verify no transaction size limit (launch_time = 0)
- [ ] Verify fees accumulate as withheld amounts

### Finalize Token Setup
- [x] Revoke mint authority permanently
- [x] Verify mint authority is null

### Token Distribution
- [ ] Send tokens from deployer wallet to:
  - [ ] Liquidity provision wallet
  - [ ] Team wallets (if applicable)
  - [ ] Marketing wallet (if applicable)
- [ ] Verify all tokens distributed
- [ ] Ensure deployer has no remaining tokens

### Smart Dial Initialization
- [ ] Set initial reward token to SOL
- [ ] Configure treasury wallet
- [ ] Record initialization timestamp
- [ ] Set update constraints

### Launch Script Preparation
- [ ] Create Raydium pool creation script
- [ ] Add launch timestamp setter
- [ ] Add fee update schedulers
- [ ] Test in simulation mode

### Testing
- [ ] Test dynamic fee collection (30% rate)
- [ ] Test vault can harvest fees with PDA signature
- [ ] Test fee updates work (will test at launch)
- [ ] Test transaction limits work (will activate at launch)
- [ ] Verify exclusion lists work correctly
- [ ] Verify all authorities properly transferred
- [ ] Run full integration test suite

## Phase 4: Keeper Bot Development

### Container Setup
- [ ] Create Node.js environment
- [ ] Install TypeScript and required packages
- [ ] NO WALLET PRIVATE KEYS in configuration

### Core Module Development

#### Fee Update Manager
- [ ] Track launch timestamp
- [ ] Schedule 5-minute update (30% → 15%)
- [ ] Schedule 10-minute update (15% → 5%)
- [ ] Implement fee finalization logic
- [ ] Add authority revocation after 10 minutes

#### Twitter Monitor (Active after first Monday)
- [ ] Calculate first Monday after launch
- [ ] Implement Twitter API v2 integration
- [ ] At Monday 03:00 UTC, fetch @project_miko's pinned tweet
- [ ] Extract single $SYMBOL mention from pinned message
- [ ] Handle case where no pinned tweet or no symbol found

#### Token Selector
- [ ] Integrate Birdeye API
- [ ] Default to SOL before first Monday
- [ ] Query all tokens matching the mentioned symbol
- [ ] Compare 24h volumes for all tokens with same symbol
- [ ] Select the one with highest 24h volume
- [ ] Update Smart Dial program with selected token

#### Fee Harvester
- [ ] Query all MIKO token accounts
- [ ] Calculate total withheld fees
- [ ] Monitor for 500k MIKO threshold
- [ ] Batch accounts for efficient harvesting
- [ ] Call vault's harvest_fees when threshold reached
- [ ] Trigger swap and distribution after harvest

#### Swap Manager
- [ ] Integrate Jupiter API
- [ ] Handle tax splitting (20% to owner, 80% to holders)
- [ ] Manage SOL balance for keeper operations
- [ ] Execute swaps with slippage protection

#### Distribution Engine
- [ ] Query holders via Birdeye API
- [ ] Calculate USD values for eligibility
- [ ] Filter $100+ holders
- [ ] Execute proportional distribution

### Scheduler Setup
- [ ] One-time fee updates at 5 and 10 minutes
- [ ] Monday 03:00 UTC: Check pinned tweet (after first Monday)
- [ ] Every minute: Check harvest threshold (500k MIKO)
- [ ] Health monitoring and alerts

### Critical Validation
- [ ] Bot operates without ANY private keys
- [ ] All operations use program authorities
- [ ] Launch-aware scheduling works
- [ ] Threshold monitoring active
- [ ] First Monday calculation correct

## Phase 5: Integration Testing

### Pre-Launch Testing
- [ ] Test token transfers with 30% fee
- [ ] Test fee accumulation mechanism
- [ ] Test harvest with accumulated fees
- [ ] Verify all authorities correctly set
- [ ] Test exclusion lists
- [ ] Test keeper bot operations (no launch features)

### Launch Simulation
- [ ] Create test pool on devnet
- [ ] Set launch timestamp
- [ ] Verify 30% tax active
- [ ] Test 1% transaction limit
- [ ] Monitor tax reduction:
  - [ ] 5 min: 30% → 15%
  - [ ] 10 min: 15% → 5%
- [ ] Verify fee authority revoked at 10 min
- [ ] Verify transaction limits removed at 10 min

### Post-Launch Testing
- [ ] Test harvest at 500k MIKO threshold
- [ ] Test reward distribution
- [ ] Test SOL reward scenario
- [ ] Test non-SOL reward scenario  
- [ ] Simulate first Monday token change
- [ ] Test keeper SOL management

### Load & Stress Testing
- [ ] 1000+ holder simulation
- [ ] High-frequency transfers
- [ ] API rate limit testing
- [ ] Network congestion handling

## Phase 6: Production Deployment

### Pre-deployment Checklist
- [ ] All tests passing
- [ ] Anti-sniper features verified
- [ ] Security audit complete
- [ ] Documentation finalized
- [ ] Infrastructure ready
- [ ] Monitoring configured

### Mainnet Deployment
- [ ] Deploy programs in order:
  1. [ ] Absolute Vault
  2. [ ] Smart Dial
  3. [ ] Transfer Hook
- [ ] Create production token:
  - [ ] 30% initial fee
  - [ ] Freeze authority null
  - [ ] Mint authority to revoke
  - [ ] Hook enabled
- [ ] Initialize all systems
- [ ] Prepare launch sequence

### Launch Execution
- [ ] Fund liquidity wallets
- [ ] Create Raydium pool
- [ ] Set launch timestamp immediately
- [ ] Start keeper bot
- [ ] Monitor fee updates:
  - [ ] 5 min: 30% → 15%
  - [ ] 10 min: 15% → 5% (permanent)
- [ ] Verify anti-sniper protection active
- [ ] Monitor first 24 hours

### Success Metrics
- [ ] Snipers effectively deterred
- [ ] Fee transitions executed on time
- [ ] Zero manual interventions required
- [ ] All fees harvested at threshold
- [ ] Rewards distributed after each harvest
- [ ] No security incidents

## Critical Checkpoints

Before proceeding to next phase, verify:

**After Phase 1**:
- Program IDs saved to shared-artifacts ✓
- Transfer hook program deployed ✓
- Direct CPI implementation working ✓

**After Phase 2**:
- Total supply minted (1B MIKO) ✓
- Mint authority still with deployer ✓
- Freeze authority null ✓
- 30% initial fee active ✓
- All tokens in deployer wallet ✓

**After Phase 3**:
- Vault PDA has all authorities ✓
- Mint authority revoked ✓
- Tokens distributed to proper wallets ❏
- Vault can harvest with PDA signature ❏ (blocked by Transfer Hook init)
- System accounts excluded ✓
- Launch script ready ❏
- SOL set as initial reward ❏ (blocked by Smart Dial init)

**After Phase 4**:
- Keeper bot has NO private keys ❏
- Fee update scheduling works ❏
- Threshold monitoring active ❏
- First Monday logic implemented ❏
- Automation fully working ❏

## Common Issues and Solutions

1. **Token-2022 CPI Issues**: Use direct invoke_signed
2. **Authority Problems**: Always verify before proceeding
3. **PDA Authority Timing**: Never set PDA as authority before it exists
4. **Mint Supply Timing**: Always mint total supply before revoking mint authority
5. **Launch Timing**: Set timestamp immediately after pool
6. **Hook Failures**: Ensure proper initialization
7. **Docker Networking**: Use shared-artifacts for data
8. **Rate Limits**: Implement proper retry logic

## Launch Day Checklist

- [ ] All programs deployed and verified
- [ ] Token created with 30% initial fee
- [ ] Keeper bot running and monitoring
- [ ] Launch script tested and ready
- [ ] Team ready for launch sequence
- [ ] Monitoring dashboard active
- [ ] Emergency procedures documented

This checklist ensures a perfect, production-ready implementation with robust anti-sniper protection and no compromises.
