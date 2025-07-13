# MIKO Token Development Checklist - Final Architecture

## Core Development Principles

1. **Programs First, Token Second**: Deploy programs to get IDs before creating token
2. **Phase Isolation**: Each phase in separate Docker container
3. **No Compromises**: Production-ready architecture with anti-sniper protection
4. **Shared Artifacts**: Program IDs and critical data shared between phases

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
  └── README.md
  ```
- [ ] Understand volume mounting for artifact sharing

## Phase 1: Core Programs Development

### Container Setup
- [ ] Create Dockerfile with Rust 1.88.0, Solana 1.18.23, Anchor 0.30.1
- [ ] Configure docker-compose.yml with shared-artifacts volume
- [ ] Verify SPL Token-2022 dependencies work

### Absolute Vault Program Development
- [ ] Initialize Anchor workspace for programs
- [ ] Implement VaultState with:
  - [ ] Multi-token support via mint-based PDA derivation
  - [ ] Dual exclusion lists (fee_exclusions, reward_exclusions)
  - [ ] Launch timestamp tracking
  - [ ] Fee finalization flag
  - [ ] Harvest threshold (500k MIKO)
  - [ ] Emergency withdrawal capabilities
  - [ ] Batch operation support
  
- [ ] Implement instructions with direct CPI:
  - [ ] `initialize` - Set up vault with auto-exclusions
  - [ ] `set_launch_time` - Record Raydium pool creation timestamp
  - [ ] `update_transfer_fee` - Handle 30% → 15% → 5% transitions
  - [ ] `harvest_fees` - Using spl_token_instruction::harvest_withheld_tokens_to_mint
  - [ ] `distribute_rewards` - With SOL balance management
  - [ ] `manage_exclusions` - Add/remove from lists
  - [ ] `update_config` - Modify vault parameters
  - [ ] `emergency_withdraw_vault` - Withdraw tokens/SOL
  - [ ] `emergency_withdraw_withheld` - Recover stuck fees

- [ ] Build and deploy:
  ```bash
  anchor build
  anchor deploy --provider.cluster devnet
  ```

- [ ] Save deployment info:
  ```json
  {
    "absoluteVaultProgramId": "...",
    "deployedAt": "...",
    "network": "devnet"
  }
  ```

### Transfer Hook Program Development
- [ ] Create separate Anchor program for transfer hooks
- [ ] Implement TransferHookConfig with:
  - [ ] Launch time storage
  - [ ] Token mint reference
  - [ ] Total supply tracking
  
- [ ] Implement hook logic:
  - [ ] `initialize` - Set configuration
  - [ ] `process_transfer` - Enforce 1% limit for 10 minutes
  - [ ] Auto-deactivation after anti-sniper period

- [ ] Build, deploy, and save program ID

### Smart Dial Program Development
- [ ] Implement DialState with:
  - [ ] Current reward token storage (default SOL)
  - [ ] Launch timestamp for first Monday calculation
  - [ ] Update history tracking
  - [ ] 24-hour update constraint (after first Monday)
  
- [ ] Implement instructions:
  - [ ] `initialize` - Set SOL as initial reward token
  - [ ] `update_reward_token` - Change reward token (Monday only)
  - [ ] `update_treasury` - Modify treasury wallet
  - [ ] `get_current_config` - Read configuration

- [ ] Build, deploy, and save program ID

### Validation
- [ ] All three programs successfully deployed
- [ ] Program IDs saved to shared-artifacts
- [ ] No compilation errors with Token-2022 integration

## Phase 2: MIKO Token Creation

### Container Setup
- [ ] Reuse Phase 1 container or create similar environment
- [ ] Mount shared-artifacts to access program IDs

### Token Creation Script Development
- [ ] Create comprehensive token creation script that:
  - [ ] Loads all program IDs from shared-artifacts
  - [ ] Generates new mint keypair
  - [ ] Calculates Vault PDA deterministically
  - [ ] Creates mint with freeze authority null
  - [ ] Sets Vault PDA as both fee authorities
  - [ ] Initializes with 30% transfer fee (3000 basis points)
  - [ ] Adds transfer hook extension
  - [ ] Revokes mint authority immediately

### Execution and Verification
- [ ] Run token creation script
- [ ] Verify token created with correct authorities:
  ```
  mintAuthority: null (revoked) ✓
  freezeAuthority: null (never set) ✓
  withdrawWithheldAuthority: Vault PDA ✓
  transferFeeConfigAuthority: Vault PDA (temporary) ✓
  transferHookAuthority: Vault PDA ✓
  ```
- [ ] Test 30% transfer fee collection
- [ ] Test 1% transaction limit via hook
- [ ] Save comprehensive token info to shared-artifacts

## Phase 3: System Initialization

### Container Setup
- [ ] Create initialization environment
- [ ] Access program IDs and token info from shared-artifacts

### Vault Initialization
- [ ] Create initialization script
- [ ] Initialize vault with:
  - [ ] Treasury wallet address
  - [ ] Owner wallet address
  - [ ] Minimum hold amount ($100 worth)
  - [ ] Keeper wallet address
  - [ ] Harvest threshold (500k MIKO)
- [ ] Verify auto-exclusions applied:
  - [ ] Owner wallet excluded
  - [ ] Treasury excluded
  - [ ] Keeper wallet excluded
  - [ ] Vault program excluded
  - [ ] Vault PDA excluded

### Transfer Hook Initialization
- [ ] Initialize with token mint and total supply
- [ ] Set launch configuration
- [ ] Verify 1% limit calculation correct

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
- [ ] Test vault can harvest fees with PDA signature
- [ ] Test dynamic fee updates work
- [ ] Test transaction limits enforced
- [ ] Verify exclusion lists work correctly

## Phase 4: Keeper Bot Development

### Container Setup
- [ ] Create Node.js 20+ environment
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
- [ ] Parse @project_miko tweets for $SYMBOL mentions
- [ ] Filter tweets from Monday 00:00-02:00 UTC
- [ ] Extract mentioned tokens

#### Token Selector
- [ ] Integrate Birdeye API
- [ ] Default to SOL before first Monday
- [ ] Compare 24h volumes for mentioned tokens
- [ ] Select highest volume token
- [ ] Update Smart Dial program

#### Fee Harvester
- [ ] Query all MIKO token accounts
- [ ] Calculate total withheld fees
- [ ] Monitor for 500k MIKO threshold
- [ ] Batch accounts for efficient harvesting
- [ ] Call vault's harvest_fees when threshold reached
- [ ] Trigger swap and distribution after harvest

#### Swap Manager
- [ ] Integrate Jupiter API v6
- [ ] Handle tax splitting (1% owner, 4% holders)
- [ ] Manage SOL balance for keeper operations
- [ ] Execute swaps with slippage protection

#### Distribution Engine
- [ ] Query holders via Birdeye API
- [ ] Calculate USD values for eligibility
- [ ] Filter $100+ holders
- [ ] Execute proportional distribution

### Scheduler Setup
- [ ] One-time fee updates at 5 and 10 minutes
- [ ] Monday 03:00 UTC: Check tweets (after first Monday)
- [ ] Every minute: Check harvest threshold (500k MIKO)
- [ ] Health monitoring and alerts

### Critical Validation
- [ ] Bot operates without ANY private keys
- [ ] All operations use program authorities
- [ ] Launch-aware scheduling works
- [ ] First Monday calculation correct

## Phase 5: Integration Testing

### Anti-Sniper Testing
- [ ] Launch simulation test:
  - [ ] Create pool and set timestamp
  - [ ] Verify 30% initial tax active
  - [ ] Test 1% transaction rejection
  - [ ] Wait 5 minutes, verify 15% tax
  - [ ] Wait 10 minutes, verify 5% tax
  - [ ] Verify transaction limits removed
  - [ ] Confirm fee authority revoked

### Reward Token Testing
- [ ] Verify SOL rewards from launch
- [ ] Simulate first Monday arrival
- [ ] Test AI token selection activation
- [ ] Verify 24-hour constraint applies

### Full System Testing
- [ ] Complete tax cycle test:
  - [ ] Create transfers to generate fees
  - [ ] Monitor threshold accumulation
  - [ ] Verify harvest triggers at 500k MIKO
  - [ ] Fees split correctly (1%/4%)
  - [ ] Rewards distributed proportionally

### Scenario Testing
- [ ] SOL reward token scenario
- [ ] Non-SOL reward token scenario
- [ ] Keeper SOL balance management
- [ ] Large holder count (1000+)
- [ ] API failure recovery

### Security Testing
- [ ] Verify all authorities:
  - [ ] Mint authority null
  - [ ] Freeze authority null
  - [ ] Transfer fee locked after 10 min
  - [ ] Hook still active but permissive

### Performance Testing
- [ ] Harvest 100+ accounts in one transaction
- [ ] Distribution to 500+ holders
- [ ] Threshold monitoring efficiency
- [ ] Launch period load testing

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
- Vault PDA is withdraw_withheld_authority ✓
- Mint authority revoked ✓
- Freeze authority null ✓
- 30% initial fee active ✓

**After Phase 3**:
- Vault can harvest with PDA signature ✓
- System accounts excluded ✓
- Launch script ready ✓
- SOL set as initial reward ✓

**After Phase 4**:
- Keeper bot has NO private keys ✓
- Fee update scheduling works ✓
- Threshold monitoring active ✓
- First Monday logic implemented ✓
- Automation fully working ✓

## Common Issues and Solutions

1. **Token-2022 CPI Issues**: Use direct invoke_signed
2. **Authority Problems**: Always verify before proceeding
3. **Launch Timing**: Set timestamp immediately after pool
4. **Hook Failures**: Ensure proper initialization
5. **Docker Networking**: Use shared-artifacts for data
6. **Rate Limits**: Implement proper retry logic

## Launch Day Checklist

- [ ] All programs deployed and verified
- [ ] Token created with 30% initial fee
- [ ] Keeper bot running and monitoring
- [ ] Launch script tested and ready
- [ ] Team ready for launch sequence
- [ ] Monitoring dashboard active
- [ ] Emergency procedures documented

This checklist ensures a perfect, production-ready implementation with robust anti-sniper protection and no compromises.