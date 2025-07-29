# VERIFICATION_GUIDE.md
Process-First Verification Layer for MIKO Token System  
Revision: 2025-07-28

---
## 0. Context
Verification Contracts ensure production-ready deployment by creating machine-checkable gates between phases. Each VC produces a boolean artifact that must PASS before proceeding.

---
## 1. Goals
- Tool-agnostic (works with Claude Code or any pipeline)
- Machine-gated phases (boolean artifacts)
- Non-destructive doc edits (anchors only)
- Auditable artifact history
- Zero interpretation ambiguity

---
## 2. Verification Contract (VC) Structure
Each VC defines:
- **Goal** – what must be proven true
- **Inputs** – artifacts / pubkeys / config
- **Action Guidance** – exact steps, no interpretation
- **Success Criteria** – comparison rules, thresholds
- **Artifact** – JSON written to `shared-artifacts/verification/`
- **Block Rule** – whether next phase may proceed

### Common JSON Skeleton
```json
{
  "vc_id": "VC:2.FEE_RATE",
  "observed": {},
  "expected": {},
  "passed": false,
  "checked_at": "<ISO8601>",
  "notes": ""
}
```

### Testing Environment Considerations
Due to devnet DEX limitations, VCs adapt to different test environments (see testing_strategy.md):
- **Devnet/Testnet**: Accept mock adapter events when `NETWORK_PROFILE != mainnet`
- **Mock CI Tests (Phase 4-A)**: Use mock adapters for rapid development
- **Local Mainnet-Fork (Phase 4-B)**: Full verification with real DEX programs cloned from mainnet
- **Mainnet Canary (Phase 5)**: Full verification with minimal liquidity (~1.5 SOL)

---
## 3. Core VC Set
| VC | Phase | Asserts | Block? |
|---|---|---|---|
| VC:2.NO_UNSUPPORTED_EXT | 2 | Mint has no incompatible extensions | YES |
| VC:2.FEE_RATE | 2 | Transfer fee == 500 basis points (5%) | YES |
| VC:2.MAX_FEE | 2 | Maximum fee == u64::MAX (unlimited) | YES |
| VC:2.AUTHORITIES | 2 | All authorities set correctly before Phase 3 | YES |
| VC:3.PDA_CALCULATION | 3 | Vault PDA matches expected derivation | YES |
| VC:3.VAULT_EXCLUSIONS | 3 | Vault auto-exclusion arrays contain all system accounts | YES |
| VC:3.AUTH_SYNC | 3 | Token-2022 fee/withdraw authorities -> Vault PDA | YES |
| VC:3.TRANSFER_TEST | 3 | Standard token transfer works with 5% fee | YES |
| VC:4.KEEPER_PREFLIGHT | 4 | Keeper env/program reachability | YES |
| VC:4.FIRST_MONDAY | 4 | First Monday calculation correct | YES |
| VC:4.TAX_FLOW_LOGIC | 4 | Tax flow scenarios correctly implemented | YES |
| VC:4.TAX_FLOW_EDGE | 4 | Mock CI tests must trigger rollback, slippage, concurrent harvest edge cases and pass recovery logic | YES |
| VC:4.DYNAMIC_EXCLUSIONS | 4-B | Pool detection and router exclusion work correctly | YES |
| VC:4.LOCAL_FORK_PASS | 4-B | Full launch path succeeds on local mainnet-fork | YES |
| VC:LAUNCH_LIQUIDITY | 5 | Launch Liquidity Ladder executed at exact times | YES |
| VC:ELIGIBILITY_SAMPLE | 5 | $100 holder eligibility calc validated vs sample | YES |

---
## 4. VC Definitions

### VC:2.NO_UNSUPPORTED_EXT
**Goal**: Verify mint uses only compatible Token-2022 extensions.  
**Inputs**: 
- `token-info.json` → `mint`
- List of incompatible extensions: TransferHook, PermanentDelegate, NonTransferable, DefaultAccountState, ConfidentialTransfer

**Action**:
```
1. Fetch mint account
2. Parse Token-2022 extension TLV data
3. List all enabled extensions
4. Verify none match incompatible list
5. Confirm TransferFeeConfig is present
```

**Success**: No incompatible extensions found  
**Artifact**: `verification/vc2-no-unsupported-ext.json`  
**Block**: YES - blocks Phase 3 if fail

### VC:2.FEE_RATE
**Goal**: Transfer fee is exactly 5% (500 basis points).  
**Inputs**: 
- `token-info.json` → `mint`

**Action**:
```
1. Fetch mint account
2. Find TransferFeeConfig extension
3. Read transferFeeBasisPoints field
4. Must equal 500 (5%)
```

**Success**: transferFeeBasisPoints === 500  
**Artifact**: `verification/vc2-fee-rate.json`  
**Block**: YES - blocks Phase 3 if fail

### VC:2.MAX_FEE
**Goal**: Maximum fee is set to u64::MAX (unlimited).  
**Inputs**: 
- `token-info.json` → `mint`

**Action**:
```
1. Fetch mint account
2. Find TransferFeeConfig extension
3. Read maximumFee field
4. Must equal 18446744073709551615 (u64::MAX)
```

**Success**: maximumFee === u64::MAX  
**Artifact**: `verification/vc2-max-fee.json`  
**Block**: YES - blocks Phase 3 if fail

### VC:2.AUTHORITIES
**Goal**: All token authorities correctly set to deployer.  
**Inputs**: 
- `token-info.json` → `mint`
- Deployer wallet address

**Action**:
```
1. Fetch mint account
2. Check mintAuthority === deployer
3. Check freezeAuthority === null
4. Check TransferFeeConfig.withdrawWithheldAuthority === deployer
5. Check TransferFeeConfig.transferFeeConfigAuthority === deployer
```

**Success**: All match expected  
**Artifact**: `verification/vc2-authorities.json`  
**Block**: YES - blocks Phase 3 if fail

### VC:3.PDA_CALCULATION
**Goal**: Vault PDA calculation is correct.  
**Inputs**:
- Vault program ID
- Token mint address
- Seed: "vault"

**Action**:
```
1. Calculate PDA using findProgramAddressSync
2. seeds: [Buffer.from("vault"), mint.toBuffer()]
3. Program ID: vault program ID
4. Record the calculated PDA
```

**Success**: PDA calculation deterministic  
**Artifact**: `verification/vc3-pda-calculation.json`  
**Block**: YES - blocks initialization if fail

### VC:3.VAULT_EXCLUSIONS
**Goal**: Vault auto-excluded all system accounts.  
**Inputs**: 
- Vault PDA
- Expected exclusions: owner, keeper, vault program, vault PDA

**Action**:
```
1. Query vault account data
2. Decode fee_exclusions array
3. Decode reward_exclusions array
4. Verify all system accounts in both arrays
```

**Success**: All system accounts found in both arrays  
**Artifact**: `verification/vc3-vault-exclusions.json`  
**Block**: YES - blocks authority transfer if fail

### VC:3.AUTH_SYNC
**Goal**: All authorities transferred to Vault PDA.  
**Inputs**: 
- Token mint
- Vault PDA

**Action**:
```
1. Fetch mint account
2. Check TransferFeeConfig.withdrawWithheldAuthority === vault PDA
3. Check TransferFeeConfig.transferFeeConfigAuthority === vault PDA
```

**Success**: Both authorities === vault PDA  
**Artifact**: `verification/vc3-auth-sync.json`  
**Block**: YES - blocks token distribution if fail

### VC:3.TRANSFER_TEST
**Goal**: Standard transfer works with 5% fee.  
**Inputs**:
- Two test wallets with SOL
- MIKO token mint

**Action** (CRITICAL - NO custom transfer scripts):
```
1. Send 100 MIKO from wallet A to wallet B using:
   - Standard SPL token transfer instruction
   - NO custom scripts or special parameters
2. Verify wallet B received 95 MIKO
3. Verify 5 MIKO withheld as fee
4. Use same method any DEX or wallet would use
```

**Success**: 
- Sender balance decreased by 100
- Receiver balance increased by 95
- Withheld fees increased by 5  
**Artifact**: `verification/vc3-transfer-test.json`  
**Block**: YES - blocks Phase 4 if fail

### VC:4.KEEPER_PREFLIGHT
**Goal**: Keeper ready to operate.  
**Inputs**:
- Environment configuration
- Program IDs
- RPC endpoints

**Action**:
```
1. Verify all program IDs loaded from artifacts
2. Test RPC connection (primary and backup)
3. Query vault state - must be initialized
4. Query dial state - must have SOL as reward token
5. Verify NO private keys in config (except keeper's own)
```

**Success**: All checks pass  
**Artifact**: `verification/vc4-keeper-preflight.json`  
**Block**: YES - blocks keeper development if fail  
**Note**: Launch timestamp testing occurs in Phase 4-B with Local-Fork

### VC:4.FIRST_MONDAY
**Goal**: First Monday calculation correct.  
**Inputs**:
- Launch timestamp

**Action**:
```
1. Calculate days since launch
2. Find next Monday (0 = Sunday, 1 = Monday)
3. If launch on Monday, first Monday = launch + 7 days
4. Else, first Monday = next Monday after launch
5. Verify calculation with multiple test dates
```

**Success**: Calculation matches manual verification  
**Artifact**: `verification/vc4-first-monday.json`  
**Block**: YES - blocks Twitter integration if fail

### VC:4.TAX_FLOW_LOGIC
**Goal**: Tax flow scenarios correctly handle keeper SOL and reward tokens.  
**Inputs**:
- Keeper wallet SOL balance
- Current reward token (SOL or other)
- Tax amount to distribute
- MIN_KEEPER_SOL = 0.05

**Action**:
```
1. Test Scenario 1 - Reward Token is SOL:
   - If keeper < 0.05 SOL:
     * Verify keeper receives up to 20% (until 0.10 SOL)
     * Verify owner receives excess of 20%
     * Verify holders receive 80%
   - If keeper ≥ 0.05 SOL:
     * Verify owner receives 20%
     * Verify holders receive 80%

2. Test Scenario 2 - Reward Token is NOT SOL:
   - If keeper < 0.05 SOL:
     * Verify 20% swapped to SOL
     * Verify keeper topped up (max 0.10 SOL)
     * Verify owner receives excess
     * Verify 80% swapped to reward token for holders
   - If keeper ≥ 0.05 SOL:
     * Verify all tax swapped to reward token
     * Verify 20% to owner, 80% to holders
```

**Success**: All scenarios execute correctly  
**Artifact**: `verification/vc4-tax-flow-logic.json`  
**Block**: YES - blocks distribution if fail

### VC:4.TAX_FLOW_EDGE
**Goal**: Mock CI tests must trigger rollback, slippage, concurrent harvest edge cases and pass recovery logic.  
**Inputs**:
- Mock keeper wallet with test balances
- Simulated swap failures and API errors
- Multiple concurrent harvest requests

**Action**:
```
1. Test keeper balance = exactly 0.05 SOL:
   - Verify no keeper top-up occurs
   - Verify full 20% goes to owner
   - Verify behavior matches >= 0.05 SOL scenario

2. Test swap failure scenarios:
   - Simulate Jupiter API failure
   - Verify transaction rollback
   - Verify no partial distributions
   - Verify withheld fees remain intact

3. Test slippage protection:
   - Simulate high slippage conditions
   - Verify swap aborts when slippage exceeds threshold
   - Verify keeper retries with adjusted parameters

4. Test concurrent harvest attempts:
   - Simulate multiple harvest calls in same block
   - Verify only one succeeds
   - Verify no double-spending
   - Verify proper mutex/locking

5. Test recovery logic:
   - Verify keeper can recover from all failure modes
   - Test exponential backoff on retries
   - Verify state consistency after recovery
```

**Success**: All edge cases handled gracefully with proper recovery  
**Artifact**: `verification/vc4-tax-flow-edge.json`  
**Block**: YES - blocks production deployment if fail

### VC:4.DYNAMIC_EXCLUSIONS
**Goal**: Pool detection and router exclusion work correctly.  
**Inputs**:
- Local Mainnet-Fork environment
- Test liquidity pools
- Test swap transactions

**Action**:
```
1. Test pool detection:
   - Create multiple test pools (CPMM, CLMM)
   - Verify keeper bot detects all pools
   - Verify pool registry updated in vault
   - Confirm pools excluded from fee collection
   - Confirm pools excluded from reward distribution

2. Test router detection during swaps:
   - Execute keeper swap through Jupiter
   - Monitor transaction accounts
   - Verify router accounts detected
   - Verify temporary exclusion applied
   - Confirm no fees charged on keeper swaps

3. Test exclusion persistence:
   - Verify pool exclusions saved in vault state
   - Verify exclusions persist across harvests
   - Test adding new pools dynamically
   - Verify old pools remain excluded

4. Test edge cases:
   - Create pool after harvest starts
   - Multiple pools created simultaneously
   - Pool with minimal liquidity
   - Complex routing paths
```

**Success**: All pools detected and excluded correctly  
**Artifact**: `verification/vc4-dynamic-exclusions.json`  
**Block**: YES - blocks Phase 5 if fail

### VC:4.LOCAL_FORK_PASS
**Goal**: Full launch path succeeds on local mainnet-fork.  
**Inputs**:
- Local Mainnet-Fork environment
- Real Raydium CPMM program (use web_search for current ID)
- Real Jupiter aggregator (use web_search for current ID)
- Complete launch parameters from LAUNCH_LIQUIDITY_PARAMS.md

**Action**:
```
1. Create CPMM pool at T0:
   - Verify pool created with correct parameters
   - Confirm initial liquidity
   - Record pool creation timestamp

2. Execute full Launch Liquidity Ladder:
   - T+60s: Stage A liquidity (verify timing ±5s)
   - T+180s: Stage B liquidity (verify timing ±5s)
   - T+300s: Stage C liquidity (verify timing ±5s)
   - Confirm all adds from deployer wallet

3. Verify fixed 5% fee:
   - Set launch timestamp immediately after pool
   - Confirm 5% fee active from start
   - Verify no fee changes occur
   - Verify maximum fee is unlimited

4. Execute complete tax flow:
   - Generate transfers to accumulate 500k MIKO fees
   - Trigger harvest when threshold reached
   - Verify pool accounts excluded from harvest
   - Verify 20%/80% split calculation
   - Execute Jupiter swap (real program)
   - Verify router accounts excluded during swap
   - Verify reward distribution to holders
   - Verify pools excluded from distribution

5. Test First Monday token change:
   - Simulate Monday condition
   - Test reward token update via Smart Dial
```

**Success**: All operations complete with proper exclusions  
**Artifact**: `verification/vc4-local-fork-pass.json`  
**Block**: YES - blocks Phase 5 if fail

### VC:LAUNCH_LIQUIDITY
**Goal**: Launch Liquidity Ladder executed at exact times.  
**Inputs**:
- Pool creation timestamp
- 4 liquidity deployment transactions
- Deployer wallet address
- Raydium fee tier configuration
- Parameters from LAUNCH_LIQUIDITY_PARAMS.md

**Action**:
```
1. Record CPMM pool creation timestamp
2. Verify bootstrap liquidity at T0
3. Verify Stage A at T+60s (±5 seconds)
4. Verify Stage B at T+180s (±5 seconds)
5. Verify Stage C at T+300s (±5 seconds)
6. Confirm all deployments from deployer wallet
7. Verify Raydium fee tier (0.25% standard)
8. Compare execution logs against LAUNCH_LIQUIDITY_PARAMS.md Section 6
```

**Success**: All stages within time windows and match parameters  
**Artifact**: `verification/vc-launch-liquidity.json` (test) or `verification/vc-launch-liquidity-mainnet.json` (production)  
**Block**: YES - blocks mainnet deployment if fail  
**Note**: This VC applies to BOTH test simulations AND production mainnet deployment

### VC:ELIGIBILITY_SAMPLE
**Goal**: $100 holder filter works correctly.  
**Inputs**:
- Sample holder balances
- MIKO/USD price
- Exclusion lists
- Pool registry

**Action**:
```
1. Calculate USD value for each holder
2. Filter holders >= $100
3. Remove excluded addresses
4. Remove all pool accounts
5. Calculate reward shares
6. Compare to manual calculation
```

**Success**: Automated matches manual exactly  
**Artifact**: `verification/vc-eligibility-sample.json`  
**Block**: YES - blocks first distribution if fail

---
## 5. Embedding Strategy
Append "VC Gate:" anchors in existing docs at natural steps.

**Template**:
> VC Gate:NAME – purpose; see VERIFICATION_GUIDE.md §4; blocks next phase if fail

---
## 6. Critical Rules
1. **NO custom transfer scripts** - test like real users
2. **NO interpretation** - exact steps only
3. **NO proceeding on failure** - stop and fix
4. **NO manual overrides** - artifacts must show pass
5. **Deployer wallet controls all liquidity operations**
6. **Dynamic exclusions must be thoroughly tested**
7. **Follow testing_strategy.md pipeline** - Mock CI → Local Fork → Canary
8. **Use web_search for program IDs** - before Local-Fork setup

---
*End VERIFICATION_GUIDE.md*