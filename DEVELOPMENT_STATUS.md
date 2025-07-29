# MIKO Token Development Status

## Overview
**Project**: MIKO Token System  
**Current Phase**: Phase 4-B - Local Mainnet-Fork Testing  
**Started**: 2025-07-15  
**Current Date**: 2025-07-28  
**Status**: Phase 1-3 complete ✅, Phase 4-A complete ✅, Phase 4-B IN PROGRESS 🔄 (critical issues found, requires fixes)

## Current Program Addresses

### Devnet Deployment (Phase 1-3)
| Program | Address | Status |
|---------|---------|--------|
| Absolute Vault | `4ieMsf7qFmh1W5FwcaX6M3fz3NNyaGy3FyuXoKJLrRDq` | Deployed ✅ |
| Smart Dial | `DggkQFbBnkMCK43y5JTHfYdX3CKw2H3m177TbLC7Mjdz` | Deployed ✅ |
| Transfer Hook | `4E8NzqDaN76o7zXjLo8hYetmiBKmAXPs6vUMFaqFfmg4` | Deployed ✅ (NOT USED) |

### Phase 4-B Fork Deployment (Current)
| Program | Address | Status |
|---------|---------|--------|
| Absolute Vault | `9qPiWoJJdas55cMZqa8d62tVHP9hbYX6NwT34qbHe9pt` | Deployed ✅ |
| Smart Dial | `9YGb2ebiKNu6tHjhJAzm4cWCTfGBxMLoPJAWatYD2mwF` | Deployed ✅ |

### Mainnet
| Program | Address | Status |
|---------|---------|--------|
| Absolute Vault | - | Not deployed |
| Smart Dial | - | Not deployed |

## Token Information

### Devnet MIKO Token (Phase 2-3)
- **Mint Address**: `A9xZnPo2SvSgWiSxh4XApZyjyYRcH1ES8zTCvhzogYRE`
- **Created**: 2025-07-19
- **Status**: Completed Phase 3 testing ✅

### Phase 4-B Fork Token (Current Deployment)
- **Mint Address**: `EkgPtCLLsbWxhdYrCpqWej2ULoytu6QcygpnyFeiT4Gs`
- **Created**: 2025-07-23 
- **Status**: Deployed with active liquidity pool ✅
- **Total Supply**: 1,000,000,000 MIKO
- **Decimals**: 9
- **Initial Transfer Fee**: 30% → 5% (Updated 2025-07-24)
- **Current Transfer Fee**: 5% (500 basis points) ✅
- **Extensions**: TransferFeeConfig ONLY (NO transfer hook)
- **Authority Status**:
  - Mint Authority: Revoked ✅
  - Freeze Authority: Already null ✅
  - Transfer Fee Config: Vault PDA ✅
  - Withdraw Withheld: Vault PDA ✅
- **CPMM Pool**: `Ato64e2AkmeoUTv93nCbcKJtmZkypZ9xesBpwbCyvUp7`
  - Bootstrap: 45M MIKO + 0.5 SOL ✅
  - Stage A: 225M MIKO + 2.5 SOL ✅
  - Stage B/C: Not completed (2-min timeout)

## Development Progress

### Phase 0: Prerequisites ✅ COMPLETE
- [x] Docker and Docker Compose installed (v28.3.0 / v2.38.2)
- [x] Project directory structure created
- [x] Shared artifacts system configured
- [x] Docker containers built successfully

### Phase 1: Core Programs Development ✅ COMPLETE
- [x] Docker environment configured with Solana 2.1.20 and Anchor 0.31.1
- [x] Anchor workspace initialized
- [x] Program keypairs generated BEFORE coding
- [x] All programs implemented with full functionality
- [x] All programs built successfully
- [x] Programs deployed to devnet (3/3 complete)
- [x] Program IDs saved to shared-artifacts
- [x] Integration testing completed

### Phase 2: Token Creation ✅ COMPLETE
- [x] Pre-creation verification
- [x] Token creation with ONLY transfer fee extension (NO transfer hook)
- [x] Initial supply minting (1B MIKO to deployer)
- [x] Authority structure setup
- [x] All Phase 2 verification contracts PASSED

### Phase 3: System Initialization ✅ COMPLETE
- [x] PDAs calculated
- [x] Vault program initialized
- [x] Smart Dial program initialized
- [x] Authority transfers completed
- [x] Token distribution verified
- [x] All verification contracts PASSED
- [x] Phase 3 testing complete

### Phase 4: Keeper Bot Development 🔄 IN PROGRESS

#### Phase 4-A: Mock CI Tests ✅ COMPLETE
- [x] Core modules development
- [x] Mock API integrations
- [x] Scheduler setup
- [x] All verification contracts PASSED
- [x] Fixed SwapManager design flaw (MIKO tokens, not SOL)
- [x] Fixed test vulnerabilities

#### Phase 4-B: Local Mainnet-Fork Testing 🔄 IN PROGRESS - REQUIRES FIXES
- [x] Discovered mainnet program IDs
  - Raydium CPMM: `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`
  - Jupiter V6: `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`
- [x] Created mainnet fork startup scripts
- [x] Implemented Distribution Engine V2 with rollover support
- [x] Tax flow issue resolved (3-step flow implemented)
- [x] declare_id! mismatch resolved
- [x] Removed treasury from all programs and scripts
- [x] Programs rebuilt with latest changes
- [x] Phase 4-B folder cleaned and organized
- [x] CPMM pool creation implementation (WSOL ATA issue resolved)
- [x] Fresh deployment with new program keypairs (2025-07-23)
- [x] Programs deployed with matching declare_id!
- [x] MIKO token created with correct fee configuration
- [x] Programs initialized successfully
- [x] Authorities transferred to Vault PDA
- [x] Mint and freeze authorities revoked
- [x] CPMM pool created with correct amounts
- [x] Bootstrap and Stage A liquidity added
- [x] Launch time set in Vault
- [x] Implement automatic fee updates in keeper bot ✅
- [x] Test fee transition from 30% to 5% ✅
- [x] Fix manual configuration system with ConfigManager ✅
- [x] Add liquidity to pool (900M MIKO + 10 SOL total) ✅
- [x] Implement harvest operations (harvest_fees, withdraw_fees_from_mint) ✅
- [x] Implement Jupiter adapter for tax swaps ✅
- [x] Implement mock Birdeye adapter for holder eligibility ✅
- [x] Implement distribution engine with rollover support ✅
- [ ] Test tax collection with swap script ❌ FAILED - Critical issues found
- [ ] Test harvest → withdraw → distribute cycle ❌ FAILED - Multiple failures
- [ ] Fix all critical issues discovered
- [ ] Redo ALL Phase 4-B tests from scratch
- [ ] Generate VC:4.LOCAL_FORK_PASS verification ❌ NOT POSSIBLE - Must fix first

### Phase 5: Integration Testing ⏳ NOT STARTED
- [ ] Pre-launch testing
- [ ] Launch simulation
- [ ] Post-launch testing
- [ ] Load testing

### Phase 6: Production Deployment ⏳ NOT STARTED
- [ ] Mainnet program deployment
- [ ] Token creation on mainnet
- [ ] Launch execution

## Verification Contract Status

### Phase 1-3 Verifications ✅ ALL PASSED
| Phase | VC ID | Description | Status |
|-------|-------|-------------|--------|
| 1 | Program ID Match | All deployed IDs match declared IDs | ✅ PASSED |
| 2 | VC:2.NO_UNSUPPORTED_EXT | Only TransferFeeConfig extension present | ✅ PASSED |
| 2 | VC:2.FEE_RATE | Transfer fee is exactly 30% | ✅ PASSED |
| 2 | VC:2.AUTHORITIES | All authorities correctly set | ✅ PASSED |
| 3 | VC:3.PDA_CALCULATION | Vault PDA derivation correct | ✅ PASSED |
| 3 | VC:3.VAULT_EXCLUSIONS | System accounts auto-excluded | ✅ PASSED |
| 3 | VC:3.AUTH_SYNC | All authorities transferred to Vault PDA | ✅ PASSED |
| 3 | VC:3.TRANSFER_TEST | Standard transfers work with 30% fee | ✅ PASSED |

### Phase 4 Verifications
| Phase | VC ID | Description | Status |
|-------|-------|-------------|--------|
| 4-A | VC:4.KEEPER_PREFLIGHT | Keeper environment ready | ✅ PASSED |
| 4-A | VC:4.FIRST_MONDAY | Reward token schedule calculation | ✅ PASSED |
| 4-A | VC:4.TAX_FLOW_EDGE | Edge cases handled | ✅ PASSED |
| 4-B | VC:4.LOCAL_FORK_PASS | Fork testing complete | ⏳ Pending |

### Phase 5 Verifications
| VC ID | Description | Status |
|-------|-------------|--------|
| VC:LAUNCH_TIMING | Fee transitions at exact times | ⏳ Not started |
| VC:ELIGIBILITY_SAMPLE | $100 holder filtering correct | ⏳ Not started |

## Technical Stack
- **Solana CLI**: 2.1.20 (compatible with Anchor 0.31.1)
- **Anchor Framework**: 0.31.1
- **Rust**: Latest stable
- **Docker**: 28.3.0
- **Docker Compose**: 2.38.2
- **Token Program**: Token-2022

## SOL Usage Tracking

### Devnet
| Phase | Operation | SOL Used | Date |
|-------|-----------|----------|------|
| Phase 1 | Program deployments (3 programs) | ~5.2 SOL | 2025-07-15/16 |
| Phase 2 | Token creation with metadata | ~0.02 SOL | 2025-07-19 |
| Phase 3 | System initialization & tests | ~0.02 SOL | 2025-07-19 |
| **Total** | **All devnet operations** | **~5.24 SOL** | - |

### Mainnet
Not deployed yet - 0 SOL used

### Local Fork (Phase 4-B)
No real SOL consumption - using local test validator

## Critical Deployer Information
- **Deployer Address**: `AnCL6TWEGYo3zVhrXckfFiAqdQpo158JUCWPFQJEpS95` (Phase 1-3)
- **Phase 4-B Deployer**: `CDTSFkBB1TuRw7WFZj4ZQpagwBhw5iURjC13kS6hEgSc`
- **Location**: Shared across all phase containers
- **Critical**: Same keypair must be used for all operations within each phase

## Current Status Summary

### What's Complete ✅
1. All core programs deployed and tested on devnet
2. Token created with proper fee configuration
3. System initialized with correct authorities
4. Mock keeper bot tests passed
5. Phase 4-B infrastructure ready
6. Tax flow fixed with 3-step process
7. Treasury removed from all components
8. Programs rebuilt with latest changes
9. Phase 4-B folder cleaned and organized
10. WSOL ATA issue resolved
11. Production configuration system (ConfigManager) implemented
12. All keeper bot modules implemented and ready for testing
13. Liquidity added to pool (900M MIKO + 10 SOL)

### Session 2025-07-25 Accomplishments
1. **Fixed Manual Config System**: Created ConfigManager that auto-derives PDAs and queries chain state
2. **Implemented Jupiter Adapter**: Full Jupiter v6 integration with proper tax flow scenarios
3. **Created Mock Birdeye Adapter**: Clearly labeled mock for $100 holder eligibility on local fork
4. **Enhanced SwapManager**: Implements all scenarios from PLAN.md with keeper top-up logic
5. **Completed Distribution Engine**: Token distribution with rollover support for early launch
6. **Added Pool Liquidity**: Successfully added 630M MIKO + 7 SOL (total 900M + 10 SOL)
7. **Ready for Testing**: All keeper bot functionality implemented, awaiting integration tests

### Current Focus 🔄
**Phase 4-B Keeper Bot Implementation**
- Pool created successfully: `Ato64e2AkmeoUTv93nCbcKJtmZkypZ9xesBpwbCyvUp7` ✅
- Liquidity added: 900M MIKO + 10 SOL total (270M + 630M additions) ✅
- Launch time set in Vault: 2025-07-24T12:09:32Z (blockchain time) ✅
- **Fee Update Implemented**: Successfully updated from 30% to 5% ✅
  - Transaction: `cYKdxjR9KcLvYZ1hHr6ZyGrFf4MrnuQ6BqUcvkGDv3Edex9QzTFULYrZU1bjYgmS2c5gUx1vT2eANnJEFfRehG2`
  - Keeper bot now has working fee update implementation
  - Fee finalized at 5% (permanent)
- **BLOCKCHAIN TIME**: ~19 hours ahead of system time (known fork issue)
- **Config System Fixed**: Production-ready ConfigManager replaces manual JSON editing ✅
- **All Keeper Bot Modules Implemented**: Ready for harvest → swap → distribute testing ✅

### Keeper Bot Implementation Status (2025-07-25)
**Root `/keeper-bot/` Status**:
- Built for Phase 4-A mock testing only
- All on-chain operations throw "Real X not implemented in mock phase" errors
- Has complete decision-making logic but no execution capability
- Uses only MockRaydiumAdapter, MockJupiterAdapter, MockBirdeyeAdapter

**Phase 4-B `/scripts/phase4b/phase4b-keeper/` Status**:
- Created standalone implementation independent of root keeper bot
- All modules ported to phase4b-keeper directory
- Fee update functionality successfully implemented and tested ✅
- Uses blockchain time for accurate fee transitions
- **ALL MODULES NOW IMPLEMENTED** ✅

**Completed Implementations**:
1. **Fee Updates**: ✅ COMPLETE - Successfully calls vault's `update_transfer_fee`
2. **Harvest**: ✅ COMPLETE - Implements `harvest_fees` for 500k MIKO threshold
3. **Withdraw**: ✅ COMPLETE - Implements `withdraw_fees_from_mint` (3-step flow)
4. **Swaps**: ✅ COMPLETE - Jupiter adapter with tax flow scenarios from PLAN.md
5. **Holder Data**: ✅ COMPLETE - Mock Birdeye adapter for $100+ holder filtering
6. **Distribution**: ✅ COMPLETE - Token distribution with rollover support
7. **Twitter**: ✅ COMPLETE - Mock implementation (sufficient for local fork)
8. **SOL Management**: ✅ COMPLETE - Keeper top-up logic in SwapManager

**Key Implementation Details**:
- **ConfigManager**: Auto-derives PDAs, queries pool from chain
- **SwapManager**: Implements all tax flow scenarios (SOL/non-SOL reward tokens)
- **JupiterAdapter**: Full Jupiter v6 integration for Token-2022 swaps
- **MockBirdeyeAdapter**: Clearly labeled mock for local fork testing
- **DistributionEngine**: Rollover mechanism for early launch phase
- **Keeper Top-up**: Automatically uses up to 20% of tax when keeper < 0.05 SOL

### Immediate Next Steps

**Phase 4-B Diagnostic Results (2025-07-26)**:
- ✅ Found critical issues during testing
- ✅ Swap test generated 2.7M MIKO fees
- ✅ Harvest and swap executed 
- ❌ Distribution failed (keypair mismatch between modules)
- ❌ Multiple architecture flaws discovered

**Required Actions**:
1. Fix all discovered issues (see Issues 1-4 below)
2. Redesign deployment with proper architecture
3. Redo all tests after fixes are implemented

## 🚫 CRITICAL DESIGN FLAWS DISCOVERED (2025-07-26)

**IMPORTANT**: Phase 4-B diagnostic testing completed. Multiple critical issues found. All components require fixes before production use.

### Issue 1: Token-2022 Transfer Fee Timing Constraints
**Problem**: Transfer fee changes only take effect in the NEXT epoch, not immediately  
**Impact**: Dynamic fee transitions (30% → 15% → 5% every 5 minutes) are IMPOSSIBLE  
**Current State**:
- Current epoch: 556 (with 30% fee and 10 MIKO maximum cap)
- New epoch: 557 (with 5% fee and unlimited maximum) - starts in ~812 minutes
- Fee already finalized in vault, no updates allowed

**Root Causes**:
1. Token created with 30% initial fee and 10 MIKO maximum cap
2. Token-2022 protocol limitation: fee changes require epoch transition
3. Maximum fee cap of 10 MIKO limiting all transfers to 10 MIKO fee max

**Solution (TO BE IMPLEMENTED AFTER KEEPER BOT TESTING)**:
- Abandon dynamic fee transitions completely
- Create new token with fixed 5% fee from the start
- Set maximum fee to u64::MAX (unlimited) during token creation
- Keep fee constant throughout entire token lifecycle

### Issue 2: Transfer Fee Strategy Update
**Clarification**: Transfer fee exemptions impossible, but reward distribution exclusions fully implementable  
**Strategy**: Accept 5% transfer fee while implementing dynamic reward exclusions  

**Key Points**:

#### 2.1 Transfer Fees Are Universal (Protocol Level)
- Token-2022 enforces 5% fee on ALL transfers - no exemptions possible
- Pool operations, keeper swaps, all transfers incur 5% tax
- This is acceptable since taxes are redistributed to owner/holders
- Not a flaw - working as designed

#### 2.2 Reward Distribution Exclusions (Application Level)
- Vault program CAN exclude accounts from receiving distributions
- Current exclusions are hardcoded (deployer, owner, programs, keeper)
- Pool vaults hold significant MIKO but shouldn't receive rewards
- Need dynamic detection during holder filtering

#### 2.3 Dynamic Exclusion Implementation
**Current (Hardcoded)**:
- Fee exclusions: [owner, treasury, keeper, program, vault]
- Reward exclusions: [owner, treasury, keeper, program, vault]

**Improved (Dynamic)**:
- During holder eligibility filtering in Distribution Engine:
  1. Query all pool accounts holding MIKO
  2. Add pool vaults to exclusion list dynamically
  3. Filter out excluded accounts before distribution
  4. Distribute only to genuine holders

**Implementation Location**: 
- `DistributionEngine.ts` - during `getEligibleHolders()` filtering
- Detect and exclude pool accounts before calculating distributions

### Testing Results (FAILED 2025-07-28)
**Testing revealed critical failures requiring complete redesign:**
1. ❌ Harvest logic partially works but has 10 MIKO fee cap limitation
2. ❌ Swap logic fails due to keypair inconsistencies
3. ❌ Distribution logic fails - wrong keypair, insufficient funds
4. ❌ Overall keeper bot flow BROKEN - multiple architectural flaws

**Critical Issues Found During Testing**:
- Maximum 10 MIKO fee per transaction blocks proper operation
- Authority initialization error forces unsafe workarounds
- Module keypair inconsistencies cause operational failures
- Token-2022 fee timing constraints make dynamic fees impossible
- All tests must be redone after fixing core issues

### Issue 3: Vault Authority Initialization Error
**Problem**: Vault was initialized with deployer as keeper_authority instead of separate keeper keypair  
**Impact**: Keeper bot cannot perform its operations without using deployer's private key  
**Current State**: Using deployer keypair in keeper bot as TEMPORARY WORKAROUND  

**What Happened**:
1. During vault initialization, the deployer keypair was used for BOTH:
   - `authority` (admin control - correct)
   - `keeper_authority` (operational control - INCORRECT)
2. This means only the deployer can call keeper-specific functions like:
   - `harvest_fees`
   - `withdraw_fees_from_mint`
   - Distribution operations
3. The dedicated keeper keypair (phase4b-keeper-keypair.json) is now useless

**Security Risk**:
- Deployer keypair contains full admin privileges
- Using it in automated keeper bot is a MAJOR security vulnerability
- If keeper bot is compromised, attacker gets admin control
- Proper separation of concerns violated

**Temporary Workaround (TESTING ONLY)**:
```typescript
// CRITICAL BUG: Vault was initialized with deployer as keeper_authority
// This SHOULD have been the keeper keypair from phase4b-keeper-keypair.json
// Using deployer keypair here is ONLY FOR TESTING - this is a SECURITY RISK
// TODO: Fix vault initialization to properly separate authorities:
//   - authority: deployer (admin control)
//   - keeper_authority: keeper keypair (operational control)
const deployerData = JSON.parse(fs.readFileSync('../phase4b-deployer.json', 'utf-8'));
this.keeper = Keypair.fromSecretKey(new Uint8Array(deployerData));
```

**Proper Authority Structure (TO BE IMPLEMENTED)**:
- `authority`: Deployer/Admin keypair - for program upgrades, emergency functions
- `keeper_authority`: Dedicated keeper keypair - for automated operations only
- Clear separation prevents single point of failure

### Issue 4: Module Keypair Inconsistency
**Problem**: Different keeper bot modules use different keypairs  
**Impact**: Swapped rewards go to one wallet, distribution attempts from another  
**Current State**: SwapManager uses deployer, DistributionEngine uses keeper  

**What Happened**:
1. SwapManager was updated to use deployer keypair (due to Issue 3)
2. DistributionEngine still used original keeper keypair
3. Result: Swapped SOL went to deployer, distribution tried from keeper
4. Distribution failed - keeper had 0.028 SOL, needed 0.037 SOL

**Solution (TO BE IMPLEMENTED)**:
- Ensure ALL modules use the same operational keypair
- Single source of truth for keypair loading
- Proper configuration management

### Implementation Plan (Testing Complete - Ready for Fixes)

#### Phase 1: Immediate Fixes Required
- ✅ Testing completed - critical issues identified
- [ ] Update all keeper modules to use consistent keypair
- [ ] Implement dynamic pool detection in DistributionEngine
- [ ] Fix authority separation in vault initialization
- [ ] Create consistent configuration management

#### Phase 2: Token Architecture Redesign
1. Create new token mint with:
   - Fixed 5% transfer fee (no transitions)
   - Maximum fee set to u64::MAX (no cap)
   - Accept universal 5% tax on all operations
2. Update vault program to remove fee transition logic
3. Simplify launch coordinator (no fee monitoring needed)

#### Phase 3: Dynamic Reward Exclusion System
1. Update DistributionEngine to detect pool accounts dynamically:
   - Query all token accounts holding MIKO
   - Identify pool vaults by program ownership
   - Add to exclusion list before distribution
2. Implement in `getEligibleHolders()` method
3. Test dynamic detection with multiple pools

#### Phase 4: Authority Structure Fix
1. Update vault initialization to accept separate authorities:
   - `authority`: Admin control (deployer)
   - `keeper_authority`: Operational control (keeper)
2. Re-deploy vault with proper separation
3. Update all keeper modules to use dedicated keypair
4. Verify keeper operations with correct permissions

#### Phase 5: Final Integration
1. Deploy redesigned architecture to fresh fork
2. Complete end-to-end testing with all fixes
3. Prepare for production deployment

## Key Architecture Decisions

### 1. No Transfer Hook
- Decision: Use only TransferFeeConfig extension
- Reason: Transfer hooks break wallet/DEX compatibility
- Result: Token works with all standard infrastructure

### 2. Tax Flow Design
- 3-step process: Harvest → Withdraw from Mint → Distribute
- All fees flow through Token-2022 withheld accounts
- Distribution Engine V2 handles undistributed funds

### 3. CPMM for Token-2022
- Decision: Use CPMM instead of CLMM
- Reason: CLMM doesn't support Token-2022 tokens
- Solution: Pre-create WSOL ATA before pool creation

### 4. No Treasury
- Treasury concept removed from all programs
- Tax distribution: 20% to owner, 80% to holders
- Simplifies architecture and reduces complexity

### 5. Production Configuration System
- Decision: Use ConfigManager with auto-derived values
- Minimal config contains only: RPC URL, program IDs, token mint, keeper path
- All PDAs and pool info derived from chain
- Result: No manual JSON editing during deployment flow

## Phase 4-B Configuration
| Wallet Type | Public Key | Purpose |
|-------------|------------|----------|
| Deployer | `CDTSFkBB1TuRw7WFZj4ZQpagwBhw5iURjC13kS6hEgSc` | Deployment and initial operations |
| Owner | `D24rokM1eAxWAU9MQYuXK9QK4jnT1qJ23VP4dCqaw5uh` | Receives 20% of tax |
| Keeper | `6LTnRkPHh27xTgpfkzibe7XcUSGe3kVazvweei1D3syn` | Bot operations |

## Key Files for Continuation
| File | Purpose |
|------|---------|
| `minimal-config.json` | Essential configuration (RPC, programs, token mint) |
| `phase4b-keeper/keeper-bot-phase4b.ts` | Main keeper bot entry point |
| `swap-test.ts` | Generate tax fees for testing |
| `phase4b-keeper/rollover-state.json` | Tracks undistributed rewards (created on first run) |
| `phase4b-init-info.json` | Contains vault initialization details |
| `launch-execution.log` | Pool creation details |

## Launch Parameters
- **Pool Type**: Raydium CPMM (Token-2022 compatible)
- **Liquidity**: 90% supply (900M MIKO) + 10 SOL
- **Stages**: Bootstrap → A → B → C (over 5 minutes)
- **Fee Schedule**: 30% → 15% (5min) → 5% (10min)
- **Oracle**: Pyth SOL/USD price feed required

## Phase 4-B Test Results
- **Test Pool Created**: `BJshJ58WUTC9bKar7QidUJM278rrMrmqSgj4SbKve44`
- **LP Mint**: `AK9F3w4yA6c2PbmN4GP6XBBJc6ZENmvVYko48zdQmmxg`
- **Issue**: Decimal calculation error (0.045 MIKO instead of 45M)
- **Liquidity Removal**: Successfully tested and removed all liquidity

## Important Reminders
- ⚠️ NEVER change program keypairs after generation
- ⚠️ Always verify declare_id! matches deployed program
- ⚠️ Test everything on fork before mainnet
- ⚠️ WSOL ATA must be created before CPMM pool creation
- ⚠️ All verification contracts must PASS before proceeding

## Critical Lessons Learned (Mistakes to Avoid)

### 1. IDL File Management
**Mistake**: Deleted `target/` directory thinking IDL files were regeneratable  
**Impact**: Nearly blocked Phase 3 progress - Anchor requires IDL for client interactions  
**Lesson**: IDL files are CRITICAL deployment artifacts that must be preserved  
**Prevention**: Copy IDL files to shared-artifacts immediately after generation

### 2. Program ID Handling
**Mistake**: Running `anchor build` changed all program IDs in source files  
**Impact**: Could have broken entire deployment if not caught  
**Lesson**: Build process modifies declare_id! statements  
**Prevention**: Always backup source files before rebuilds

### 3. declare_id! Mismatch (CATASTROPHIC)
**Mistake**: Source code declare_id! didn't match deployed program IDs  
**Impact**: FORCED REDEPLOYMENT - Would lose ALL FUNDS on mainnet  
**What Happened**:
- Deployed programs had different IDs than source code
- Result: DeclaredProgramIdMismatch error → forced to redeploy
**Why This Is CATASTROPHIC**:
- Redeploying resets ALL program state
- All user funds would be LOST
- All authorities would be RESET
- Token authorities would be BROKEN forever
**Prevention Protocol**:
1. ALWAYS verify declare_id! matches deployed program BEFORE operations
2. NEVER modify declare_id! after deployment
3. Create pre-flight check script:
```bash
solana program show <deployed-id> | grep "Program Id"
grep "declare_id!" src/lib.rs
# These MUST match EXACTLY
```

### 4. Transfer Hook Incompatibility
**Mistake**: Initially included transfer hook extension  
**Impact**: Token unusable with all wallets and DEXs  
**Root Cause**: Transfer hooks require extra accounts that wallets don't provide  
**Solution**: Removed transfer hook, use only TransferFeeConfig  
**Lesson**: Standard compatibility > advanced features

### 5. Tax Flow Design Flaw
**Mistake**: harvest_fees sent fees to mint, distribute_rewards tried to use vault account  
**Impact**: Entire tax system non-functional  
**Solution**: Added withdraw_fees_from_mint step (3-step flow)  
**Lesson**: Always trace fund flow completely before implementation

### 6. Anchor Program Constructor Changes
**Mistake**: Used old Anchor syntax with programId parameter  
**Impact**: DeclaredProgramIdMismatch error preventing initialization  
**Solution**: Override IDL address field instead:
```typescript
// WRONG (old syntax):
const program = new Program(idl, programId, provider);

// CORRECT (v0.30.0+):
idl.address = actualDeployedProgramId;
const program = new Program(idl, provider);
```

### 7. CPMM vs CLMM Requirements
**Mistake**: Assumed CPMM works like CLMM for WSOL handling  
**Impact**: Pool creation fails with missing WSOL account  
**Lesson**: CPMM requires manual WSOL ATA creation, CLMM does it automatically  
**Solution**: Pre-create WSOL ATA before pool creation (documented in `cpmm_wsol_fix.md`)

### 8. Treasury Over-Engineering
**Mistake**: Initially included treasury concept in architecture  
**Impact**: Added unnecessary complexity with no actual function  
**Solution**: Removed treasury from all programs and scripts  
**Lesson**: Simpler architecture is better - avoid unused features

### 9. Program Deployment Order and ID Management
**Mistake**: Deployed programs without ensuring declare_id! matched the deployment keypair  
**Impact**: DeclaredProgramIdMismatch error preventing program initialization  
**Root Cause**: Used different keypairs for deployment than what was in source code  
**What Happened**:
- Phase 4-B programs had declare_id! with old addresses from previous phase
- Deployed with new keypairs but source still referenced old IDs
- Result: Program ID in deployed binary didn't match runtime expectation
**Solution**: Complete fresh deployment:
1. Generate NEW program keypairs
2. Update declare_id! in source with the new keypair addresses
3. Rebuild programs (anchor build)
4. Deploy with the SAME keypairs used in declare_id!
**Lesson**: Program ID must be consistent across three places:
- Keypair used for deployment
- declare_id! in source code
- Deployed program on chain
**Prevention**: Always verify before deployment:
```bash
solana-keygen pubkey phase4b-vault-keypair.json  # Should match...
grep "declare_id!" programs/absolute-vault/src/lib.rs  # ...this address
```

### 10. Critical Decimal Calculation Error
**Mistake**: Forgot to multiply MIKO amounts by 1e9 when creating CPMM pool
**Impact**: Only 0.045 MIKO deposited instead of 45,000,000 MIKO
**What Happened**:
- MIKO has 9 decimals like SOL
- Passed raw amounts without converting to smallest units
- Result: 45000000 became 0.045 MIKO
**Lesson**: ALWAYS convert token amounts to smallest units:
```typescript
// WRONG:
mintBAmount: new BN(bootstrap.mikoAmount)  // 45000000 = 0.045 MIKO

// CORRECT:
mintBAmount: new BN(bootstrap.mikoAmount * 1e9)  // 45000000 * 1e9 = 45M MIKO
```
**Prevention**: Create helper functions for token amount conversions

### 11. CPMM Liquidity Removal Success
**Achievement**: Successfully removed liquidity from Raydium CPMM pool
**Method**: Used Raydium SDK v2 withdrawLiquidity function
**Key Steps**:
1. Initialize Raydium SDK with deployer keypair
2. Get pool info using getPoolInfoFromRpc
3. Find LP token balance in deployer's ATA
4. Call withdrawLiquidity with full LP amount
**Important**: This capability is critical for mainnet emergency situations
**Script Location**: `/scripts/phase4b/debug/remove-cpmm-liquidity.ts`

### 12. Phase 4-B Directory Isolation
**Mistake**: Tried to modify files in `/programs/` directory during Phase 4-B
**Impact**: Confusion between Phase 4-B isolated programs and root programs
**What Happened**:
- Phase 4-B has its own copy of programs in `/scripts/phase4b/phase4b-programs/`
- Tried to edit `declare_id!` in root `/programs/` directory
- Root `/programs/` are from Phase 1-3 and should NOT be touched during Phase 4-B
**Lesson**: During Phase 4-B, ONLY work with files in `/scripts/phase4b/` directory
**Prevention**: 
- Phase 4-B programs: `/scripts/phase4b/phase4b-programs/programs/`
- Phase 4-B scripts: `/scripts/phase4b/`
- NEVER touch root `/programs/` during Phase 4-B unless referencing past work

### 13. Missing Fee Update Implementation
**Mistake**: Assumed fee updates would happen automatically
**Impact**: Fees stuck at 30% instead of transitioning to 15% → 5%
**What Happened**:
- Vault program has `update_transfer_fee` function that validates time-based fees
- Launch coordinator only monitors fee transition times but doesn't call update
- Keeper bot has no fee update logic implemented
- Result: Fees never change from initial 30%
**Root Cause**: PLAN.md specified "Fee Update Manager" but it was never implemented
**Lesson**: Always verify critical features are actually implemented, not just designed
**Fix Required**:
- Keeper bot needs to call `update_transfer_fee` at 5 and 10 minutes
- Must pass correct fee for time period (1500 at 5min, 500 at 10min)
- After 10 minutes, fee is finalized and locked permanently

### 14. Keeper Bot Mock-Only Implementation
**Discovery**: Phase 4-B testing revealed keeper bot cannot execute any on-chain operations
**Impact**: All automated functionality non-functional - fees, harvests, swaps, distributions
**What Happened**:
- Phase 4-A built keeper bot with mock adapters for CI testing
- All real implementations left as TODOs with "Real X not implemented in mock phase" errors
- Phase 4-B wrapper tried to use Phase 4-A bot but constructor incompatible
- Result: Keeper bot knows WHEN to act but cannot actually DO anything on-chain
**Root Cause**: Phase isolation principle taken too literally - no real implementations created
**Lesson**: Mock testing is valuable but real implementations must follow immediately
**Fix Required**: Implement all 8 keeper bot functions for actual on-chain operations

### 15. Keeper Bot Fee Update Implementation Success
**Achievement**: Successfully implemented automated fee updates in Phase 4-B keeper bot
**What Happened**:
- Created standalone keeper bot in `/scripts/phase4b/phase4b-keeper/`
- Ported all necessary modules from root keeper bot
- Implemented real vault program calls for fee updates
- Used blockchain time (not system time) for accurate transitions
- Successfully updated fee from 30% to 5% after 10+ minutes elapsed
**Key Implementation Details**:
- Created FeeUpdateImpl class to handle actual on-chain transactions
- Enhanced FeeUpdateManagerPhase4B to check actual mint fee state
- Parsed Token-2022 mint extensions to read current fee
- Keeper bot runs checks every 30 seconds
**Lesson**: Always use blockchain time for time-based logic, not system time

### 16. Manual Configuration System Issues
**Mistake**: Built test-level config system requiring manual JSON updates throughout deployment
**Impact**: Production deployment would require hand-editing config files after each step
**What Happened**:
- Initial implementation used phase4b-config.json with hardcoded values
- Required manual updates after: token creation, pool creation, PDA calculation
- Extremely error-prone and unprofessional for production use
**Solution**: Created ConfigManager system:
- `minimal-config.json` contains only essential non-derivable values
- `config-manager.ts` auto-derives PDAs from program IDs and seeds
- Pool info queried from chain when needed
- Token creation script updates minimal config automatically
**Key Components**:
- **Minimal Config**: RPC URL, program IDs, token mint, keeper path
- **Auto-Derived**: Vault PDA, Smart Dial PDA, pool ID, owner/keeper wallets
- **Dynamic Queries**: Pool state, vault state, accumulated fees
**Result**: Production-ready configuration that minimizes manual intervention
**Lesson**: Always design for production deployment flow, not just testing convenience

## Project Structure
- `/programs/` - Anchor workspace with program source
- `/scripts/phase4b/` - Current working directory for Phase 4-B
  - `/debug/` - Debugging scripts for Phase 4-B testing
  - `/phase4b-keeper/` - Standalone keeper bot implementation
    - `/modules/` - All keeper bot modules
      - `jupiter-adapter.ts` - Jupiter v6 integration
      - `mock-birdeye-adapter.ts` - Mock holder data for testing
      - `SwapManager.ts` - Tax flow scenario handler
      - `DistributionEngine.ts` - Token distribution with rollover
  - `config-manager.ts` - Production configuration system
  - `minimal-config.json` - Essential configuration values
  - `swap-test.ts` - Generate tax fees for testing
  - `add-liquidity-to-pool.ts` - Add liquidity to existing pool
- `/docker/shared-artifacts/` - Shared data between phases
- `cpmm_wsol_fix.md` - Solution for WSOL ATA issue (IMPLEMENTED)

---
*Last Updated: 2025-07-25 - All keeper bot modules implemented, ready for integration testing*