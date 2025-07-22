# LAUNCH_LIQUIDITY_PARAMS.md
MIKO Launch Liquidity Ladder Parameter Template  
(5-Minute, Single Operations Wallet, Raydium CLMM)

**Purpose**  
To quantify the 4-stage time-staggered liquidity deployment plan at formal launch, and to generate pre/post execution verification artifacts.  
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
| **Initial Transfer Fee** | 30% | Launch to +5m. |
| **Fee @+5m** | 15% | Automatic transition. |
| **Fee @+10m** | 5% (permanent) | Automatic transition. |

> These fields are finalized during Launch Preflight phase and included in VC:4.LAUNCH_PREFLIGHT artifact.

---

## 2. Market Context Assumptions (pre-launch)

| Metric | Value | Source/Method | Freeze Time |
|---|---|---|---|
| SOL USD Mid | $190 (test) / Live price (prod) | Test: Fixed value / Prod: Oracle updates | Pre-launch prep |
| Desired FDV at Launch | ~$19,000 | Based on 10 SOL @ current price | Calculated at execution |
| Target Circulating % @5m | 90% of TS | 900M MIKO in pool | Aligns w/ ladder sizing |
| Target Initial Depth @±30% | ~$5,700 | Liquidity resilience goal | Preflight sim |

*For mainnet canary and production:*
- *Start fetching SOL price when launch preparation begins*
- *Continue updating price until pool creation command*
- *If oracle fetch fails, use last successful price*
- *Final price locked at pool creation execution*

*For mainnet canary and production:*
- *SOL price updates at T-30m, T-10m, T-5m, T-1m*
- *If oracle fetch fails, use last successful price*
- *Final price locked at pool creation*

---

## 3. Stage Allocation Model

**Definitions**

- `C_stage[i]` = MIKO quantity to add to pool in Stage i.
- `%TS_stage[i]` = `C_stage[i] / TS * 100`.
- SOL quantities calculated based on target mid-price (P_mid_i) just before staging.
- Price bands specified as Raydium CLMM position ranges (lower/upper bounds).

---

### 3.1 Quick Allocation Worksheet

| Stage | Offset | %TS Target | MIKO Qty | SOL Qty (Test) | SOL Qty (Canary) | Lower Price | Upper Price | Band Width | Intent |
|---|---|---|---|---|---|---|---|---|---|
| **Bootstrap** | T0 | 1% | 10M | 0.2 | 0.02 | P₀×0.7 | P₀×1.3 | Narrow | Pool creation minimum liquidity / price discovery |
| **A** | +60s | 4% | 40M | 0.8 | 0.08 | P₀×0.5 | P₀×1.5 | Mid | Form initial trading band |
| **B** | +180s | 15% | 150M | 3.0 | 0.3 | P₀×0.3 | P₀×2.0 | Wide | Absorb volatility |
| **C** | +300s (~5m) | 70% | 700M | 6.0 | 0.6 | P₀×0.005 | P₀×160 | Near-Infinite | Stability backstop |

> **Note:** For Mainnet Canary, use 1/10th of test SOL quantities. Production uses full quantities.

---

### 3.2 Derived Totals

| Metric | Test Value | Canary Value | Formula |
|---|---|---|---|
| ΣMIKO_bootstrap..C | 900M | 900M | sum of stage MIKO |
| Σ%TS_bootstrap..C | 90% | 90% | ΣMIKO / TS |
| Approx Circulating @5m | 900M | 900M | ΣMIKO minus team/treasury locks (none) |
| SOL Total Deployed | 10 SOL | 1 SOL | ΣSOL |

---

## 4. Price Band Selection Aids

> Raydium CLMM is a **concentrated liquidity** model: positions are only active within specified price ranges, and assets convert to single-sided when price moves outside the range. Therefore, *range selection* is crucial for each stage.

### 4.1 Reference Price Inputs
- `P_oracle` (SOL/USD): 
  - Test: $190 (fixed)
  - Prod: Must fetch from oracle before pool creation
  - Pool creation blocked until successful price fetch
- `P_fdv` (Desired FDV ÷ Circulating MIKO): Calculated after price fetch
- `P₀` (Initial MIKO/SOL): Final calculation when creating pool with fetched price

### 4.2 Band Sizing Rationale
- **Bootstrap (T0):** ±30% band — Tight control during price discovery
- **Stage A (+60s):** ±50% band — Allow moderate price movement
- **Stage B (+180s):** -70% to +100% band — Asymmetric to prevent dumps
- **Stage C (+300s):** -99.5% to +15,900% band — Effectively infinite range

---

## 5. Calculation Steps (Manual / Spreadsheet Friendly)

**Inputs needed per Stage:** `%TS_target`, `P_lower`, `P_upper`, `P_ref` (center estimate), `sol_decimals = 9`, `miko_decimals = 9`.

1. **MIKO Qty**  
   Already specified in Section 3.1

2. **SOL Qty**  
   Already specified in Section 3.1 based on target liquidity

3. **Liquidity Coverage Check**  
   Total depth of 10 SOL provides ~$1,900 liquidity at $190/SOL

4. **Fee Interaction**  
   30% tax during first 5 minutes naturally deters sniping

5. **Rounding**  
   All quantities already rounded to avoid dust

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
- MIKO Added:
- SOL Added:
- Lower/Upper:
- Notes (prompt shown? warnings?):

### 6.2 +60s Stage A Log
[repeat fields]

### 6.3 +180s Stage B Log
[repeat fields]

### 6.4 +300s Stage C Log
[repeat fields]

---

## 7. Timing Validation Window

Recommended tolerances:  
- Stage A: +60s ±5s  
- Stage B: +180s ±5s  
- Stage C: +300s ±5s (must settle *before* fee drop at +5m)  

In production, allow ±block tolerance during network congestion. VERIFICATION_GUIDE only performs time window comparison.

---

## 8. Pre-Launch Checklist Tie-In

Check items map to TO_DO.md Phase 4 / Phase 5 sections:

| Template Field | TO_DO.md Item | Verified By |
|---|---|---|
| SOL Price Fetch | Pre-pool creation requirement | Oracle availability check |
| Raydium Fee Tier | Phase 4-B Launch Parameters | VC:4.LAUNCH_PREFLIGHT |
| Program IDs Discovery | Phase 4-B Local-Fork Setup | web_search + testing_strategy.md |
| Stage Size Rows | Phase 4-B Launch Parameters | VC:4.LAUNCH_PREFLIGHT |
| Launch Time | Phase 5 T0 | VC:LAUNCH_TIME_SET |
| Stage Logs | Phase 5 stages | VC:LAUNCH_LIQUIDITY |
| Fee Transition Times | Keeper config | VC:LAUNCH_TIMING |

---

## 9. Governance Notes
- Pool creation requires successful SOL price fetch from oracle.
- No fallback to stale prices - must have fresh price data.
- Document update required when Ops Wallet signer changes.
- Community notice required minimum T-10m before stage value changes.
- Stage non-execution (e.g., network error) → Emergency procedures: Document "Skip Remaining Adds / Hold Fee Drop / Manual Re-center" options.

---

## 10. Changelog
- 2025-07-17: Initial template (post Transfer Hook removal; 5-Minute Liquidity Ladder).
- 2025-07-19: Updated to clarify MIKO/SOL as the fixed liquidity pair.
- 2025-07-20: Added testing_strategy.md reference and web_search for program ID discovery.
- 2025-07-21: Added concrete default values for all stages, price bands, and SOL quantities.
- 2025-07-21: Changed to require successful oracle price fetch before pool creation.
