# MIKO End‑to‑End Testing Strategy

> Revision 2025‑07‑20 (Asia/Seoul) — Devnet DEX 제한 대응용

This document formalises how we will validate **every contract path** — Raydium CLMM liquidity ladder, Keeper fee logic, harvest/swap/distribute, reward‑token weekly rotation — in a cost‑efficient, deterministic way **without relying on Devnet DEX infrastructure**.

---

## 1 ‒ Three‑Step Pipeline Overview

| Step                                       | Environment                                                 | Purpose                                               | Key Tools                                  | SOL Cost           | Used In Phases     |
| ------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------ | ------------------ | ------------------ |
| **Mock CI Tests**                          | Local dev environment with mock adapters                    | Rapid iteration, edge case testing                    | MockRaydiumAdapter, MockJupiterAdapter     | 0 SOL              | Phase 4-A          |
| **Local Mainnet‑Fork**                     | `solana-test-validator` with `--url mainnet-beta --clone …` | Full functional parity (Raydium, Jupiter)             | Local ledger, cloned programs & mints      | 0 SOL              | Phase 4-B          |
| **Mainnet‑Beta Canary**                    | Live chain, minimal stake                                   | Final sanity; real Raydium/Jupiter; minimal liquidity | Upgradable program, small liquidity ladder | ≈ 1.5 SOL          | Phase 5            |

---

## 2 ‒ Step 1 : Mock CI Tests (Phase 4-A)

Rapid development and edge case testing without infrastructure dependencies.

```toml
# mock_config.toml
[adapters]
raydium = "MockRaydiumAdapter"
jupiter = "MockJupiterAdapter"
birdeye = "MockBirdeyeAdapter"

[test_data]
launch_timestamp = 1234567890
keeper_balance = 0.05
```

Key tests:
- Tax flow edge cases (keeper balance = exactly 0.05 SOL)
- Swap failure rollback
- Concurrent harvest protection
- API timeout handling

## 3 ‒ Step 2 : Local Mainnet‑Fork (Phase 4-B)

**IMPORTANT**: Use web_search to find current mainnet program IDs before setup:
- "Raydium CLMM program ID mainnet"
- "Jupiter aggregator v6 program ID mainnet"
- "WSOL mint address mainnet"

```bash
solana-test-validator \
  --ledger .test-ledger \
  --url https://api.mainnet-beta.solana.com \
  --clone <RAYDIUM_CLMM_PROGRAM_ID> \
  --clone <JUPITER_AGGREGATOR_ID> \
  --clone <USDC_MINT> --clone <WSOL_MINT> \
  --hard-fork <SPECIFIC_SLOT_NUMBER> \
  --limit-ledger-size
```

- Gives us real program code + accounts with deterministic state.
- Airdrop fake SOL to deploy programs and run Raydium liquidity ladder exactly as on mainnet.
- Validate:
  1. Vault init + authority transfer.
  2. 4‑stage liquidity adds (T0/+60/+180/+300).
  3. Keeper harvest → split → swap (Jupiter) → distribute.
  4. Weekly reward‑token rotation script.
  5. High-frequency transfer simulation for load testing.

Artifacts stored under `verify/localfork/YYYY‑MM‑DD/`.

---

## 4 ‒ Step 3 : Mainnet‑Beta Canary (Phase 5)

**Goals**

- Prove end‑to‑end on real infra.
- Keep burn rate minimal; allow safe rollback via program upgrade.

### 4.1 Cost Breakdown

| Item                      | Est Lamports  |
| ------------------------- | ------------- |
| Program deploy (≤ 120 kB) | \~1.3 SOL     |
| CLMM pool create          | 0.02 SOL      |
| Bootstrap liquidity       | 0.05 SOL      |
| Buffer                    | 0.10 SOL      |
| **Total**                 | **≈ 1.5 SOL** |

### 4.2 Procedure (abbrev.)

1. Deploy upgradable program with minimal size.
2. Mint 1 M test‑supply → Ops wallet.
3. Execute 4‑stage liquidity ladder with tiny amounts.
4. Run Keeper for ≥ 30 m; observe two harvest cycles.
5. If all VC gates pass ➜ `program upgrade` with final build; issue real supply; expand liquidity.

---

## 5 ‒ Verification Contract Matrix

| VC ID                              | Mock CI | Local Fork | Mainnet Canary | Production |
| ---------------------------------- | ------- | ---------- | -------------- | ---------- |
| VC:4.TAX\_FLOW\_EDGE               | ✓       | ✓          | -              | -          |
| VC:4.LOCAL\_FORK\_PASS             | -       | ✓          | -              | -          |
| VC:LAUNCH\_TIME\_SET               | -       | ✓          | ✓              | ✓          |
| VC:FEE\_TRANSITIONS\_CONFIRMED     | -       | ✓          | ✓              | ✓          |
| VC:LAUNCH\_LIQUIDITY               | -       | ✓          | ✓              | ✓          |
| VC:LAUNCH\_TIMING                  | -       | ✓          | ✓              | ✓          |

---

## 6 ‒ Runbook Summary

1. **Phase 4-A** – Mock CI tests for rapid development
2. **Phase 4-B** – Local Mainnet-Fork full integration
3. **Phase 5** – Mainnet Canary validation
4. **Phase 6** – Production deployment

---

## Changelog

- **2025‑07‑20:** Initial document created.
- **2025‑07‑20:** Added hard-fork slot fixing, TAX_FLOW_LOGIC edge cases, and load testing.
- **2025‑07‑20:** Restructured to align with Phase 4-A/4-B split.
