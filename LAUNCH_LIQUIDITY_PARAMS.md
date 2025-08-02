# LAUNCH_LIQUIDITY_PARAMS.md
MIKO Launch Liquidity Ladder Parameter Template  
(5-Minute, Single Operations Wallet, Raydium CPMM)

**Purpose**  
To quantify the 4-stage time-staggered liquidity deployment plan at formal launch, accounting for the 5% transfer tax on all MIKO transfers. All quantities shown include necessary adjustments to achieve target pool liquidity after tax deductions.  
All quantities, prices, and range values should be recorded in this template and referenced when completing `PLAN.md` Phase 5 and `TO_DO.md` Launch Execution items.  
Actual scripts/code are not included in documentation.

---

## 0. Context Links
- Project Overview: README.md
- Development Plan: PLAN.md
- Detailed Checklist: TO_DO.md
- Verification Procedures: VERIFICATION_GUIDE.md
- Testing Strategy: testing_strategy.md
- Current Status: DEVELOPMENT_STATUS.md

---

## 1. Global Launch Inputs

| Field | Value | Notes |
|---|---|---|
| **Total Supply (TS)** | 1,000,000,000 MIKO | Fixed. |
| **Quote Asset** | SOL | Fixed for MIKO/SOL pair. |
| **Ops Wallet** | `deployer` | All 4 stages executed from this wallet. |
| **Raydium Fee Tier** | 0.25% | Standard tier for MIKO/SOL pair. |
| **Launch Slot / Time (UTC)** | `<YYYY-MM-DD HH:MM:SS>` | Based on pool creation confirmation block. Written to Vault. |
| **Transfer Fee** | 5% | Fixed permanent rate. |
| **Maximum Fee** | u64::MAX | Unlimited (no cap on fee amount). |

> These fields are finalized during Launch Preflight phase and included in VC:4.LAUNCH_PREFLIGHT artifact.

---

## 2. Market Context Assumptions (pre-launch)

| Metric | Value | Source/Method | Freeze Time |
|---|---|---|---|
| SOL USD Mid | $190 (test) / Live price (prod) | Test: Fixed value / Prod: Oracle updates | Pre-launch prep |
| Desired FDV at Launch | ~$19,000 | Based on 10 SOL @ current price | Calculated at execution |
| Target Pool Liquidity @5m | 90% of TS | 900M MIKO in pool (after 5% tax) | Aligns w/ ladder sizing |
| Required Send Amount | 94.74% of TS | 947.37M MIKO (includes tax) | Calculated from target |
| Target Initial Depth @±30% | ~$5,700 | Liquidity resilience goal | Preflight sim |

*For mainnet canary and production:*
- *Start fetching SOL price when launch preparation begins*
- *Continue updating price until pool creation command*
- *If oracle fetch fails, use last successful price*
- *Final price locked at pool creation execution*

---

## 3. Stage Allocation Model

**Definitions**

- `C_send[i]` = MIKO quantity to send in Stage i (includes tax).
- `C_pool[i]` = MIKO quantity arriving in pool after 5% tax.
- `%TS_send[i]` = `C_send[i] / TS * 100`.
- `%TS_pool[i]` = `C_pool[i] / TS * 100`.
- SOL quantities calculated to maintain balanced liquidity.
- CPMM uses constant product formula without price ranges.

**Important**: All MIKO transfers incur 5% fee. To achieve target pool amounts, send amounts must be grossed up by dividing by 0.95.

---

### 3.1 Quick Allocation Worksheet

| Stage | Offset | Pool Target | MIKO Send | Actual to Pool | SOL Qty (Test) | SOL Qty (Canary) | Intent |
|---|---|---|---|---|---|---|---|
| **Bootstrap** | T0 | 45M (4.5%) | **47.37M** | 45M | 0.5 | 0.05 | Pool creation with balanced initial liquidity |
| **A** | +60s | 225M (22.5%) | **236.84M** | 225M | 2.5 | 0.25 | Major liquidity injection |
| **B** | +180s | 270M (27%) | **284.21M** | 270M | 3.0 | 0.3 | Further depth building |
| **C** | +300s (~5m) | 360M (36%) | **378.95M** | 360M | 4.0 | 0.4 | Final liquidity backstop |

> **Note:** For Mainnet Canary, use 1/10th of test SOL quantities. Production uses full quantities.  
> **Fee Calculation:** Send amounts include 5% tax. Formula: `Send Amount = Pool Target ÷ 0.95`  
> **Total Required:** 947.37M MIKO to achieve 900M in pool after taxes

---

### 3.2 Derived Totals

| Metric | Test Value | Canary Value | Formula | Notes |
|---|---|---|---|---|
| Total MIKO Sent | 947.37M | 947.37M | sum of send amounts | Includes 5% tax |
| Total Tax Paid | 47.37M | 47.37M | total sent × 0.05 | Goes to withheld accounts |
| MIKO in Pool | 900M | 900M | total sent × 0.95 | Actual pool liquidity |
| % of Supply Sent | 94.74% | 94.74% | sent amount / TS | Higher due to tax |
| % in Pool | 90% | 90% | pool amount / TS | Target achieved |
| Deployer Remaining | 52.63M | 52.63M | 1B - 947.37M | For operations |
| SOL Total Deployed | 10 SOL | 1 SOL | ΣSOL | No tax on SOL |

---

## 4. CPMM Price Discovery

> Raydium CPMM uses a **constant product** model (x * y = k): liquidity is always active across the entire price range, automatically rebalancing as trades occur. No manual range management required.

### 4.1 Reference Price Inputs
- `P_oracle` (SOL/USD): 
  - Test: $190 (fixed)
  - Prod: Must fetch from oracle before pool creation
  - Pool creation blocked until successful price fetch
- `P₀` (Initial MIKO/SOL): Determined by initial liquidity ratio (45M MIKO in pool : 0.5 SOL)
  - Note: 47.37M sent → 45M arrives in pool after 5% tax

### 4.2 CPMM Advantages
- **Automatic Rebalancing:** Assets automatically adjust to maintain constant product
- **Always Active:** No liquidity going out of range
- **Simpler Management:** No need to adjust price ranges
- **Token-2022 Support:** Full compatibility with transfer fee tokens

---

## 5. Calculation Steps (Manual / Spreadsheet Friendly)

**Inputs needed per Stage:** `Target_Pool_Amount`, `sol_amount`, `tax_rate = 0.05`

1. **Required Send Amount**  
   ```
   Send_Amount = Target_Pool_Amount ÷ (1 - tax_rate)
   Send_Amount = Target_Pool_Amount ÷ 0.95
   ```

2. **Tax Calculation**  
   ```
   Tax_Amount = Send_Amount × tax_rate
   Tax_Amount = Send_Amount × 0.05
   ```

3. **Verification**  
   ```
   Pool_Amount = Send_Amount - Tax_Amount
   Pool_Amount should equal Target_Pool_Amount
   ```

4. **Price Impact**  
   Initial price P₀ = 0.5 SOL / 45M MIKO (pool amount) = ~0.0000000111 SOL/MIKO
   At $190/SOL: ~$0.00000211/MIKO

5. **Stage Examples**
   - Bootstrap: Want 45M in pool → Send 47.37M → 2.37M tax → 45M arrives
   - Stage A: Want 225M in pool → Send 236.84M → 11.84M tax → 225M arrives
   - Stage B: Want 270M in pool → Send 284.21M → 14.21M tax → 270M arrives
   - Stage C: Want 360M in pool → Send 378.95M → 18.95M tax → 360M arrives

---

## 6. Execution Binder (to be filled live)

Complete the following log immediately after each stage execution.  
*This table is referenced in VERIFICATION_GUIDE VC:LAUNCH_LIQUIDITY checks.*

### 6.0 Pre-Launch Oracle Check
- Oracle fetch time:
- SOL/USD price fetched:
- Price fetch success: YES/NO
- If NO, retry count:

### 6.1 T0 Bootstrap Execution Log
- Tx Sig:
- Slot:
- Confirm Time:
- MIKO Sent: (47.37M planned)
- MIKO Tax Paid:
- MIKO to Pool: (45M target)
- SOL Added: (0.5 planned)
- Pool ID:
- 5% Fee Applied: YES (automatic)
- Notes (prompt shown? warnings?):

### 6.2 +60s Stage A Log
- Tx Sig:
- Slot:
- Confirm Time:
- MIKO Sent: (236.84M planned)
- MIKO Tax Paid:
- MIKO to Pool: (225M target)
- SOL Added: (2.5 planned)
- 5% Fee Applied: YES (automatic)
- Notes:

### 6.3 +180s Stage B Log
- Tx Sig:
- Slot:
- Confirm Time:
- MIKO Sent: (284.21M planned)
- MIKO Tax Paid:
- MIKO to Pool: (270M target)
- SOL Added: (3.0 planned)
- 5% Fee Applied: YES (automatic)
- Notes:

### 6.4 +300s Stage C Log
- Tx Sig:
- Slot:
- Confirm Time:
- MIKO Sent: (378.95M planned)
- MIKO Tax Paid:
- MIKO to Pool: (360M target)
- SOL Added: (4.0 planned)
- 5% Fee Applied: YES (automatic)
- Notes:

---

## 7. Timing Validation Window

Recommended tolerances:  
- Stage A: +60s ±5s  
- Stage B: +180s ±5s  
- Stage C: +300s ±5s  

In production, allow ±block tolerance during network congestion. VERIFICATION_GUIDE only performs time window comparison.

---

## 8. Pre-Launch Checklist Tie-In

Check items map to TO_DO.md Phase 4 / Phase 5 sections:

| Template Field | TO_DO.md Item | Verified By |
|---|---|---|
| SOL Price Fetch | Pre-pool creation requirement | Oracle availability check |
| Raydium Fee Tier | Phase 4-B Launch Parameters | VC:4.LAUNCH_PREFLIGHT |
| Program IDs Discovery | Phase 4-B Local-Fork Setup | web_search + testing_strategy.md |
| Stage Send Amounts | Phase 4-B Launch Parameters | VC:4.LAUNCH_PREFLIGHT |
| Tax Calculations | Phase 4-B Testing | Verify 5% deduction on all sends |
| Deployer Balance | Phase 5 Pre-launch | Must have 947.37M+ MIKO |
| Launch Time | Phase 5 T0 | VC:LAUNCH_TIME_SET |
| Stage Logs | Phase 5 stages | VC:LAUNCH_LIQUIDITY |
| Transfer Fee | Fixed at 5% | VC:2.FEE_RATE |

---

## 9. Governance Notes
- Pool creation requires successful SOL price fetch from oracle.
- No fallback to stale prices - must have fresh price data.
- Document update required when Ops Wallet signer changes.
- Community notice required minimum T-10m before stage value changes.
- Stage non-execution (e.g., network error) → Emergency procedures: Document "Skip Remaining Adds / Manual Re-center" options.
- Transfer fee is permanently fixed at 5% - applies to ALL transfers including pool operations.
- Dynamic pool detection ensures pools are excluded from reward distributions (application level).
- **Liquidity calculations account for 5% tax**: Send amounts are ~5.26% higher than target pool amounts.
- **Deployer must hold sufficient buffer**: 947.37M MIKO required for 900M pool target plus operational reserves.

---

## 10. Changelog
- 2025-07-17: Initial template (post Transfer Hook removal; 5-Minute Liquidity Ladder).
- 2025-07-19: Updated to clarify MIKO/SOL as the fixed liquidity pair.
- 2025-07-20: Added testing_strategy.md reference and web_search for program ID discovery.
- 2025-07-21: Added concrete default values for all stages, price bands, and SOL quantities.
- 2025-07-21: Changed to require successful oracle price fetch before pool creation.
- 2025-07-22: Switched from CLMM to CPMM for Token-2022 support, removed price bands, updated liquidity amounts.
- 2025-07-29: Updated to reflect fixed 5% transfer fee on ALL transfers, added maximum fee as u64::MAX, clarified pool exclusions are reward-only.
- 2025-07-29: Adjusted liquidity amounts to account for 5% tax - total 947.37M MIKO required to achieve 900M in pool.