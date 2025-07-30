# Phase 4-B Fix Plan

## Overview

This document outlines the systematic approach to resolve critical issues discovered during Phase 4-B testing, as documented in DEVELOPMENT_STATUS.md. The fixes must be implemented in a specific order to ensure each solution builds upon the previous one.

## Critical Issues Summary

1. **Token Configuration**: Maximum fee limited to 10 MIKO, initial fee at 30%
2. **Authority Structure**: Deployer incorrectly set as keeper_authority
3. **Module Consistency**: Different modules using different keypairs
4. **Missing Features**: Dynamic pool detection not implemented
5. **Architectural Issues**: Fee transition logic incompatible with Token-2022

## Fix Implementation Order

### Phase 1: Token Recreation (HIGHEST PRIORITY)

**Problem**: Current token has 10 MIKO maximum fee cap and 30% initial fee

**Solution**:
```typescript
// New token parameters
const tokenConfig = {
  transferFee: 500,           // 5% (500 basis points)
  maximumFee: u64.MAX,        // Unlimited (18446744073709551615)
  freezeAuthority: null,      // Disabled from creation
  decimals: 9
};
```

**Steps**:
1. Create new token creation script with correct parameters
2. Deploy new token mint
3. Mint total supply (1B MIKO)
4. Verify configuration:
   - Run VC:2.FEE_RATE verification
   - Run VC:2.MAX_FEE verification
   - Confirm 5% fee on test transfer

**Files to update**:
- `scripts/phase4b/create-token.ts`
- `minimal-config.json` (with new mint address)

### Phase 2: Program Modifications and Redeployment

**Problem**: Programs contain fee transition logic and incorrect authority initialization

**Solution A - Vault Program Updates**:
```rust
// Remove from vault program:
- Fee transition logic (update_transfer_fee instruction)
- Fee exclusion lists (keep only reward_exclusions)
- Time-based fee calculations

// Modify initialize instruction:
pub fn initialize(
    ctx: Context<Initialize>,
    owner_wallet: Pubkey,
    keeper_authority: Pubkey,  // Must be separate from authority
    min_hold_amount: u64,
    harvest_threshold: u64,
) -> Result<()> {
    // Set authorities correctly
    vault.authority = ctx.accounts.authority.key();
    vault.keeper_authority = keeper_authority;  // Not authority!
}
```

**Solution B - Deployment Process**:
```bash
# 1. Generate new program keypairs
solana-keygen new -o phase4b-vault-v2-keypair.json
solana-keygen new -o phase4b-dial-v2-keypair.json

# 2. Update declare_id! in programs
# 3. Build programs
# 4. Deploy with new keypairs
# 5. Initialize with correct authorities:
#    - authority: deployer
#    - keeper_authority: phase4b-keeper-keypair.json
```

**Files to update**:
- `programs/absolute-vault/src/lib.rs`
- `programs/smart-dial/src/lib.rs`
- `scripts/phase4b/initialize-programs.ts`

### Phase 3: Keeper Bot Architecture Cleanup

**Problem**: Modules using inconsistent keypairs, complex configuration

**Solution - Centralized Configuration**:
```typescript
// config/unified-config.ts
export class UnifiedConfig {
  private static instance: UnifiedConfig;
  private keeper: Keypair;
  
  private constructor() {
    // Load keeper keypair ONCE
    const keeperData = fs.readFileSync('phase4b-keeper-keypair.json', 'utf-8');
    this.keeper = Keypair.fromSecretKey(new Uint8Array(JSON.parse(keeperData)));
  }
  
  static getInstance(): UnifiedConfig {
    if (!this.instance) {
      this.instance = new UnifiedConfig();
    }
    return this.instance;
  }
  
  getKeeper(): Keypair {
    return this.keeper;
  }
}

// All modules use:
const config = UnifiedConfig.getInstance();
const keeper = config.getKeeper();
```

**Module Updates**:
1. Remove all fee update logic
2. Ensure consistent keypair usage
3. Simplify 3-step flow:
   - `harvestFees()` → `withdrawFromMint()` → `distribute()`

**Files to update**:
- `keeper-bot/modules/FeeHarvester.ts`
- `keeper-bot/modules/SwapManager.ts`
- `keeper-bot/modules/DistributionEngine.ts`
- Remove: `keeper-bot/modules/fee-update-*.ts`

### Phase 4: Dynamic Pool Detection Implementation

**Problem**: Pool accounts not excluded from reward distribution

**Solution**:
```typescript
// modules/DynamicPoolDetection.ts
export class DynamicPoolDetection {
  async detectPoolAccounts(tokenMint: PublicKey): Promise<PublicKey[]> {
    const pools: PublicKey[] = [];
    
    // 1. Detect Raydium CPMM pools
    const cpmmAccounts = await this.detectRadiumCPMM(tokenMint);
    pools.push(...cpmmAccounts);
    
    // 2. Detect other AMM pools (future)
    
    return pools;
  }
  
  private async detectRadiumCPMM(mint: PublicKey): Promise<PublicKey[]> {
    // Query pool vaults holding MIKO
    const poolVaults = await connection.getProgramAccounts(
      RAYDIUM_CPMM_PROGRAM,
      {
        filters: [
          { dataSize: POOL_VAULT_SIZE },
          { memcmp: { offset: MINT_OFFSET, bytes: mint.toBase58() }}
        ]
      }
    );
    
    return poolVaults.map(pv => pv.pubkey);
  }
}

// Integration in DistributionEngine
async getEligibleHolders(mint: PublicKey, exclusions: PublicKey[]) {
  // Get all holders
  const allHolders = await this.getTokenHolders(mint);
  
  // Detect pools dynamically
  const poolDetector = new DynamicPoolDetection();
  const pools = await poolDetector.detectPoolAccounts(mint);
  
  // Combine exclusions
  const allExclusions = [...exclusions, ...pools];
  
  // Filter and return
  return allHolders
    .filter(h => !allExclusions.includes(h.address))
    .filter(h => h.valueUsd >= 100);
}
```

**Files to create/update**:
- Create: `keeper-bot/modules/DynamicPoolDetection.ts`
- Update: `keeper-bot/modules/DistributionEngine.ts`

### Phase 5: Unified Testing Environment

**Problem**: Phase separation no longer meaningful, need integrated testing

**Solution - Single Test Flow**:
```typescript
// scripts/phase4b/integrated-test.ts
async function runIntegratedTest() {
  console.log("=== Phase 4-B Integrated Test ===");
  
  // 1. Token Creation
  console.log("\n1. Creating token with correct parameters...");
  const mint = await createToken({
    fee: 500,
    maxFee: u64.MAX,
    authority: deployer
  });
  
  // 2. Program Deployment
  console.log("\n2. Deploying programs...");
  const programs = await deployPrograms();
  
  // 3. Initialization
  console.log("\n3. Initializing with correct authorities...");
  await initializePrograms({
    authority: deployer.publicKey,
    keeperAuthority: keeper.publicKey,
    owner: owner.publicKey
  });
  
  // 4. Pool Creation
  console.log("\n4. Creating CPMM pool...");
  const pool = await createPool(mint);
  
  // 5. Test Transactions
  console.log("\n5. Generating test transactions...");
  await generateTestTransactions(100); // Generate fees
  
  // 6. Full Keeper Cycle
  console.log("\n6. Running keeper bot cycle...");
  await runKeeperCycle();
  
  // 7. Verification
  console.log("\n7. Running all verifications...");
  await runAllVerifications();
}
```

**Files to create**:
- `scripts/phase4b/integrated-test.ts`
- `scripts/phase4b/verification-suite.ts`

## Execution Timeline

### Step 1: Environment Cleanup (30 minutes)
- [ ] Backup existing phase4b work
- [ ] Create clean working directory
- [ ] Document current state

### Step 2: Token Recreation (1 hour)
- [ ] Update token creation script
- [ ] Deploy new token
- [ ] Mint supply
- [ ] Run verifications

### Step 3: Program Updates (2 hours)
- [ ] Remove fee transition logic
- [ ] Generate new keypairs
- [ ] Deploy programs
- [ ] Initialize with correct authorities

### Step 4: Keeper Bot Refactor (2 hours)
- [ ] Implement unified configuration
- [ ] Update all modules
- [ ] Remove deprecated code
- [ ] Test individual modules

### Step 5: Pool Detection (1 hour)
- [ ] Implement detection logic
- [ ] Integrate with distribution
- [ ] Create test cases

### Step 6: Integration Testing (2 hours)
- [ ] Create unified test script
- [ ] Run complete flow
- [ ] Verify all VCs pass
- [ ] Document results

## Priority Rationale

1. **Token First**: Nothing works without correct token parameters
2. **Programs Second**: Correct authority structure enables keeper operations
3. **Keeper Cleanup**: Consistent architecture enables debugging
4. **Pool Detection**: Core feature but requires working foundation
5. **Integration Test**: Final validation of all components

## Success Criteria

- [ ] Token has 5% fee with unlimited maximum
- [ ] Programs use separate authority and keeper_authority
- [ ] All keeper modules use same keypair
- [ ] Pools excluded from reward distribution
- [ ] Complete flow works on local fork
- [ ] All VCs pass

## Common Pitfalls to Avoid

1. **Don't reuse old keypairs** - Generate fresh ones for clean deployment
2. **Don't skip verifications** - Run VCs after each major step
3. **Don't mix authorities** - Keep deployer and keeper separate
4. **Don't rush integration** - Test each component individually first
5. **Don't ignore errors** - Fix issues immediately, don't work around them

---

*This plan ensures systematic resolution of all Phase 4-B issues. Follow the order strictly as each phase depends on the previous one.*