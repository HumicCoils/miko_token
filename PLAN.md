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
   - Reward distribution mechanics
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
   - Twitter API integration for AI token selection (after first Monday)
   - Jupiter swap integration
   - Birdeye API integration for holder data
   - No wallet private key required

## Technical Stack

### On-chain Development
- **Language**: Rust 1.75+
- **Framework**: Anchor 0.30.1
- **Token Standard**: SPL Token-2022 with extensions
- **Program Development**: Solana CLI 1.18+

### Off-chain Development
- **Language**: TypeScript 5.0+
- **Runtime**: Node.js 20+
- **Web3 Library**: @solana/web3.js 1.91+
- **Scheduler**: node-cron
- **APIs**: Twitter API v2, Birdeye API, Jupiter API v6

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
```dockerfile
FROM rust:1.75
# Install Solana 1.18.23, Anchor 0.30.1
# Mount volumes: ./workspace:/workspace, ../shared-artifacts:/artifacts
```

#### Absolute Vault Program

1. **Data Structures**:
   ```rust
   pub struct VaultState {
       pub authority: Pubkey,           // Admin authority
       pub treasury: Pubkey,            // Treasury wallet
       pub owner_wallet: Pubkey,        // Owner (1% recipient)
       pub token_mint: Pubkey,          // MIKO token mint
       pub min_hold_amount: u64,        // Min $100 USD in tokens
       pub fee_exclusions: Vec<Pubkey>, // Fee harvest exclusions
       pub reward_exclusions: Vec<Pubkey>, // Reward exclusions
       pub keeper_authority: Pubkey,    // Keeper bot authority
       pub launch_timestamp: i64,       // Raydium pool creation time
       pub fee_finalized: bool,         // Tax locked at 5%
       pub harvest_threshold: u64,      // 500,000 MIKO (0.05% of supply)
       // ... statistics fields
   }
   ```

2. **Launch Time Management**:
   ```rust
   pub fn set_launch_time(ctx: Context<SetLaunchTime>) -> Result<()> {
       let vault = &mut ctx.accounts.vault;
       require!(
           vault.launch_timestamp == 0,
           ErrorCode::AlreadyLaunched
       );
       vault.launch_timestamp = Clock::get()?.unix_timestamp;
       Ok(())
   }
   ```

3. **Dynamic Fee Updates**:
   ```rust
   pub fn update_transfer_fee(ctx: Context<UpdateTransferFee>) -> Result<()> {
       let vault = &mut ctx.accounts.vault;
       let clock = Clock::get()?;
       let elapsed = clock.unix_timestamp - vault.launch_timestamp;
       
       let new_fee = match elapsed {
           0..=300 => 3000,      // 0-5 min: 30%
           301..=600 => 1500,    // 5-10 min: 15%
           _ => {
               // 10+ min: 5% forever
               if !vault.fee_finalized {
                   update_fee_to_5_percent()?;
                   revoke_fee_authority()?;
                   vault.fee_finalized = true;
               }
               return Ok(());
           }
       };
       
       update_transfer_fee_cpi(new_fee)?;
       Ok(())
   }
   ```

4. **Instructions with Direct CPI**:
   ```rust
   // harvest_fees.rs - Direct CPI implementation
   use spl_token_2022::instruction as spl_instruction;
   
   pub fn handler(ctx: Context<HarvestFees>) -> Result<()> {
       let vault_seeds = &[VAULT_SEED, vault.token_mint.as_ref(), &[vault.bump]];
       
       // Build instruction manually
       let harvest_ix = spl_instruction::harvest_withheld_tokens_to_mint(
           &spl_token_2022::ID,
           &ctx.accounts.token_mint.key(),
           &ctx.remaining_accounts.iter().map(|a| a.key).collect::<Vec<_>>(),
       )?;
       
       // Execute with invoke_signed
       invoke_signed(
           &harvest_ix,
           &[/* accounts */],
           &[vault_seeds],
       )?;
   }
   ```

5. **Authority Design**:
   - `authority`: Program admin (can update configs)
   - `keeper_authority`: Bot wallet (can harvest/distribute/update fees)
   - Separate authorities prevent single point of failure

#### Transfer Hook Program

1. **Transaction Limit Enforcement**:
   ```rust
   pub struct TransferHookConfig {
       pub launch_time: i64,
       pub token_mint: Pubkey,
       pub total_supply: u64,
   }
   
   pub fn process_transfer(
       ctx: Context<TransferHook>,
       amount: u64,
   ) -> Result<()> {
       let config = &ctx.accounts.config;
       let clock = Clock::get()?;
       
       // 10 minute anti-sniper period
       if clock.unix_timestamp < config.launch_time + 600 {
           let max_allowed = config.total_supply / 100; // 1%
           require!(
               amount <= max_allowed,
               ErrorCode::ExceedsMaxTransaction
           );
       }
       
       Ok(())
   }
   ```

#### Smart Dial Program

1. **Simple State Management**:
   ```rust
   pub struct DialState {
       pub authority: Pubkey,
       pub current_reward_token: Pubkey,
       pub last_update: i64,
       pub update_history: Vec<UpdateRecord>,
       pub launch_timestamp: i64,  // For first Monday calculation
   }
   ```

2. **24-hour Update Constraint** (active after first Monday):
   ```rust
   require!(
       clock.unix_timestamp >= dial.last_update + 86400,
       DialError::UpdateTooSoon
   );
   ```

### Phase 2: MIKO Token Creation (Week 4)
**Objective**: Create token with proper authority structure and anti-sniper configuration

1. **Load Program IDs**:
   ```typescript
   const programs = JSON.parse(
     fs.readFileSync('/artifacts/programs.json', 'utf-8')
   );
   const VAULT_PROGRAM_ID = new PublicKey(programs.absoluteVault.programId);
   const HOOK_PROGRAM_ID = new PublicKey(programs.transferHook.programId);
   ```

2. **Calculate PDAs**:
   ```typescript
   const [vaultPDA, vaultBump] = PublicKey.findProgramAddressSync(
     [Buffer.from('vault'), mintKeypair.publicKey.toBuffer()],
     VAULT_PROGRAM_ID
   );
   ```

3. **Token Creation with Dynamic Fee**:
   ```typescript
   // Create mint with freeze authority null
   const initMintIx = createInitializeMint2Instruction(
     mintKeypair.publicKey,
     9,                          // decimals
     walletKeypair.publicKey,    // mint authority (temporary)
     null,                       // freeze authority (permanently null)
     TOKEN_2022_PROGRAM_ID
   );
   
   // Initialize transfer fee extension
   const initTransferFeeIx = createInitializeTransferFeeConfigInstruction(
     mintKeypair.publicKey,
     vaultPDA,                   // transfer_fee_config_authority
     vaultPDA,                   // withdraw_withheld_authority
     3000,                       // 30% initial fee
     BigInt('18446744073709551615'), // No max fee limit
     TOKEN_2022_PROGRAM_ID
   );
   
   // Initialize transfer hook
   const initHookIx = createInitializeTransferHookInstruction(
     mintKeypair.publicKey,
     vaultPDA,                   // hook authority
     HOOK_PROGRAM_ID,
     TOKEN_2022_PROGRAM_ID
   );
   ```

4. **Mint Authority Revocation**:
   ```typescript
   // Revoke mint authority immediately
   await setAuthority(
     connection,
     payer,
     mintKeypair.publicKey,
     walletKeypair,
     AuthorityType.MintTokens,
     null  // Revoke permanently
   );
   ```

5. **Save Token Info**:
   ```json
   // shared-artifacts/token.json
   {
     "mint": "...",
     "vaultPDA": "...",
     "withdrawWithheldAuthority": "... (should match vaultPDA)",
     "transferFeeConfigAuthority": "... (vaultPDA, will be revoked after 10 min)",
     "mintAuthority": null,
     "freezeAuthority": null,
     "createdAt": "..."
   }
   ```

### Phase 3: System Initialization (Week 5)
**Objective**: Initialize all programs and verify integration

1. **Initialize Vault**:
   ```typescript
   await vaultProgram.methods
     .initialize(
       new BN(100_000_000), // min hold amount
       keeperWallet.publicKey, // keeper authority
       new BN(500_000_000_000) // harvest threshold: 500k MIKO
     )
     .accounts({
       vault: vaultPDA,
       authority: authority.publicKey,
       treasury: treasuryWallet,
       ownerWallet: ownerWallet,
       tokenMint: mint,
       systemProgram: SystemProgram.programId,
     })
     .rpc();
   ```

2. **Initialize Transfer Hook**:
   ```typescript
   await hookProgram.methods
     .initialize(
       mint,
       totalSupply
     )
     .rpc();
   ```

3. **Initialize Smart Dial with SOL**:
   ```typescript
   await dialProgram.methods
     .initialize(
       new PublicKey("So11111111111111111111111111111111111111112"), // SOL
       treasuryWallet
     )
     .rpc();
   ```

4. **Create Launch Script**:
   ```typescript
   // scripts/launch.ts
   async function launchMIKO() {
     // 1. Create Raydium pool
     const poolKeys = await createRaydiumPool(...);
     
     // 2. Set launch timestamp immediately
     await vaultProgram.methods
       .setLaunchTime()
       .accounts({
         vault: vaultPDA,
         authority: deployerWallet.publicKey,
       })
       .rpc();
     
     // 3. Schedule fee updates
     setTimeout(() => updateFee(), 5 * 60 * 1000);  // 5 min
     setTimeout(() => finalizeFee(), 10 * 60 * 1000); // 10 min
   }
   ```

### Phase 4: Keeper Bot Development (Week 6-7)
**Objective**: Automated operations with launch-aware scheduling

1. **Configuration**:
   ```typescript
   export const config = {
     vaultProgramId: process.env.VAULT_PROGRAM_ID,
     dialProgramId: process.env.DIAL_PROGRAM_ID,
     hookProgramId: process.env.HOOK_PROGRAM_ID,
     keeperPublicKey: process.env.KEEPER_PUBLIC_KEY,
     launchTimestamp: process.env.LAUNCH_TIMESTAMP,
     // NO PRIVATE KEYS!
   };
   ```

2. **Fee Update Manager**:
   ```typescript
   class FeeUpdateManager {
     async checkAndUpdateFee() {
       const elapsed = Date.now() - this.launchTime;
       
       if (elapsed >= 5 * 60 * 1000 && elapsed < 6 * 60 * 1000) {
         // Update to 15%
         await this.updateTransferFee();
       } else if (elapsed >= 10 * 60 * 1000 && elapsed < 11 * 60 * 1000) {
         // Finalize at 5%
         await this.updateTransferFee();
       }
     }
   }
   ```

3. **Fee Harvest Monitor**:
   ```typescript
   class FeeHarvestMonitor {
     private readonly HARVEST_THRESHOLD = 500_000_000_000; // 500k MIKO with decimals
     
     async checkAndHarvest() {
       // Get accumulated withheld fees
       const totalWithheld = await this.getTotalWithheldFees();
       
       if (totalWithheld >= this.HARVEST_THRESHOLD) {
         console.log(`Threshold reached: ${totalWithheld / 1e9} MIKO`);
         await this.executeFeeHarvest();
       }
     }
     
     async getTotalWithheldFees(): Promise<number> {
       // Query all token accounts and sum withheld amounts
       const accounts = await this.getTokenAccounts();
       return accounts.reduce((sum, acc) => 
         sum + (acc.withheldAmount || 0), 0
       );
     }
     
     async executeFeeHarvest() {
       const accounts = await this.getAccountsWithFees();
       const batches = chunk(accounts, 20);
       
       for (const batch of batches) {
         await vaultProgram.methods
           .harvestFees()
           .accounts({
             authority: keeperAuthority,
             vault: vaultPDA,
             tokenMint: mint,
           })
           .remainingAccounts(batch)
           .signers([keeperKeypair])
           .rpc();
       }
       
       // Proceed with swap and distribution
       await this.swapAndDistribute();
     }
   }
   ```

4. **Twitter AI Integration** (Active after first Monday):
   ```typescript
   async function checkRewardTokenUpdate() {
     const now = new Date();
     const firstMonday = getFirstMondayAfterLaunch(LAUNCH_TIMESTAMP);
     
     // Before first Monday, keep SOL
     if (now < firstMonday) {
       return;
     }
     
     // Monday 00:00-02:00 UTC window
     if (isMonday && now.getUTCHours() < 2) {
       const tweets = await twitter.getTweets('@project_miko');
       const tokens = extractTokenMentions(tweets);
       const winner = await selectHighestVolume(tokens);
       await updateRewardToken(winner);
     }
   }
   ```

5. **Distribution Engine**:
   ```typescript
   async function distributeRewards() {
     // Get current reward token (SOL initially)
     const rewardToken = await getActiveRewardToken();
     
     // Get holders and prices
     const holders = await birdeye.getTokenHolders(MIKO_MINT);
     const price = await birdeye.getTokenPrice(MIKO_MINT);
     
     // Filter eligible holders
     const eligible = holders.filter(h => 
       h.balance * price >= 100
     );
     
     // Distribute
     await distribute(eligible, rewardToken);
   }
   ```

6. **Scheduler**:
   ```typescript
   // Fee updates (one-time)
   setTimeout(() => feeManager.updateTo15(), 5 * 60 * 1000);
   setTimeout(() => feeManager.finalizeTo5(), 10 * 60 * 1000);
   
   // Every Monday at 03:00 UTC (after first Monday)
   cron.schedule('0 3 * * 1', async () => {
     if (Date.now() >= getFirstMondayAfterLaunch()) {
       await updateRewardToken();
     }
   });
   
   // Every minute - check if harvest threshold reached
   cron.schedule('* * * * *', async () => {
     await harvestMonitor.checkAndHarvest();
   });
   ```

### Phase 5: Integration & Testing (Week 8-9)
**Objective**: Complete system validation with anti-sniper features

1. **Anti-Sniper Test Scenarios**:
   - Launch pool and verify 30% initial tax
   - Test 1% transaction limit enforcement
   - Verify tax reduction at 5 and 10 minutes
   - Confirm transaction limits removed after 10 minutes
   - Test fee authority revocation after 10 minutes

2. **Reward Token Scenarios**:
   - SOL rewards work from launch
   - First Monday trigger works correctly
   - AI token selection activates properly

3. **Security Tests**:
   - Mint authority properly revoked
   - Freeze authority is null
   - Transfer fee locked after 10 minutes

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
- **First Monday onwards**: AI-selected tokens via Twitter

### Tax Flow Scenarios

#### Scenario 1: Reward Token is SOL
```typescript
if (keeperBalance < MIN_KEEPER_SOL) {
  // Use part of tax to top up keeper
  const needed = TARGET_KEEPER_SOL - keeperBalance;
  await topUpKeeper(Math.min(needed, taxAmount * 0.01));
  // Remaining to distributions
} else {
  // Normal distribution: 1% owner, 4% holders
}
```

#### Scenario 2: Reward Token is NOT SOL
```typescript
if (keeperBalance < MIN_KEEPER_SOL) {
  // Swap minimum needed to SOL first
  const solNeeded = TARGET_KEEPER_SOL - keeperBalance;
  await swapToSol(calculateMinimumSwap(solNeeded));
}
// Swap remainder to reward token
await swapToRewardToken(remaining);
```

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
   - ✅ 1%/4% split logic
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