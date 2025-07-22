# MIKO Token System

A Solana-native token ecosystem that combines protocol-level transaction fees, dynamic reward distribution, AI-assisted governance, and multi-stage anti-sniper protection.

---

## 1. Key Features

| Feature | Description |
| ------- | ----------- |
| **Dynamic Transfer Fee** | Starts at 30% on launch, reduces to 15% after 5 min, then 5% after 10 min (permanently fixed) |
| **Launch Liquidity Ladder** | Single wallet deploys CLMM liquidity in 4 stages: T0, +60s, +180s, +300s to create defensive depth |
| **Automatic Fee Harvesting** | Keeper Bot monitors and harvests withheld fees when accumulated amount reaches 500,000 MIKO (0.05% of supply) |
| **Split Logic (20% / 80%)** | 20% of collected tax goes to project owner; 80% of collected tax is converted to weekly reward token for holders |
| **AI-Driven Reward Selection** | Twitter AI agent (@project_miko) posts pinned tweet with $SYMBOL (Mon 00:00-02:00 UTC); Keeper bot checks at 03:00 UTC and selects the token with that symbol having highest 24h volume |
| **Initial Reward Token** | SOL is the reward token from launch until the first Monday after launch |
| **Dynamic Holder Eligibility** | Holders must maintain ≥ $100 worth of MIKO to receive rewards; checked at distribution time |
| **Dual Exclusion Lists** | Separate lists for fee collection and reward distribution; system accounts auto-excluded |
| **Emergency Withdrawal** | Authority can withdraw tokens/SOL from vault or withheld fees for maintenance |
| **Scenario-Aware SOL Top-Up** | Bot ensures operational wallet always has enough SOL for network fees |
| **Immutable Token** | Freeze authority disabled, mint authority revoked - token supply cannot be changed |

---

## 2. System Architecture

```
┌────────────────────────┐      Harvest / Split        ┌───────────────────────┐
│      Token-2022        │      (at threshold)        │    Absolute Vault     │
│   with dynamic fee     ├─────────────────────────────▶│   (Anchor program)    │
└────────────────────────┘                              │ 1% Owner | 4% Treasury│
        ▲      ▲                                        └────────────┬──────────┘
        │      │ Swap via Jupiter API                                │
        │      │ (Keeper Bot)                                        ▼
┌───────┴──────┴───────┐                              ┌───────────────────────┐
│      DEX Users       │                              │      Smart Dial       │
│ (Raydium, Orca...)   │    Weekly token update      │ (Reward token PDA)    │
└──────────────────────┘◀──────────────────────────────┴───────────────────────┘
```

**On-Chain Programs**

1. **MIKO Mint** – Token-2022 mint with TransferFeeConfig (authority managed by Vault initially, then revoked)
2. **Absolute Vault** – Harvests fees, manages exclusions, distributes rewards, controls tax schedule
3. **Smart Dial** – Stores active reward token configuration & history

**Off-Chain Services**

- **Keeper Bot** (TypeScript, Node.js, Docker)
  - Threshold-based harvest (triggers at 500,000 MIKO accumulated)
  - Tax rate updates (5 min, 10 min marks)
  - Weekly token selection from pinned tweet (First Monday after launch onwards)
  - Real-time eligibility checks
  - SOL balance safeguards

---

## 3. Tax Distribution Workflow

### 3.1 Normal Cycle

1. Users trade MIKO on any Solana DEX; dynamic fee is withheld automatically
2. When accumulated fees reach 500,000 MIKO (0.05% of supply), Keeper bot harvests and calls Absolute Vault
3. Absolute Vault splits the batch: **20% of collected tax → Owner**, **80% of collected tax → Treasury**
4. The 80% share is swapped via Jupiter to current reward token and distributed pro-rata

### 3.2 Anti-Sniper Protection

**Launch Liquidity Ladder Timeline:**

| Time | Action | Details |
|------|--------|---------|
| **T0** | Create Raydium CLMM pool | Bootstrap with minimal liquidity, narrow price range (±5%) for MIKO/SOL |
| **+60s** | Stage A liquidity add | Narrow/midband depth to absorb initial trades |
| **+180s** | Stage B liquidity add | Broader range, re-center if needed based on price action |
| **+300s** | Stage C liquidity add | Stability backstop before fee reduction |
| **+5 min** | Fee reduction | 30% → 15% (automatic via Keeper) |
| **+10 min** | Final fee reduction | 15% → 5% (permanent) |

**Key Features:**
- Deployer wallet controls all staged deployments
- Raydium CLMM allows manual price range configuration per stage
- Combined with high initial tax for economic deterrent
- Liquidity pair: **MIKO/SOL**

### 3.3 Eligibility Logic

- Holder eligibility = `MIKO_balance_USD ≥ $100` at distribution time
- Fee exclusion list: Wallets exempt from dynamic tax
- Reward exclusion list: Wallets exempt from receiving rewards
- System accounts (owner, treasury, keeper, programs) auto-excluded from both

---

## 4. Special Handling Rules

### 4.1 Reward Token = **SOL** (Default from launch until first Monday)

| Condition | Action |
| --------- | ------ |
| Bot's SOL < 0.05 | Keep all tax as SOL. 80% of tax → holders, use up to 20% of tax for keeper (until 0.10 SOL), excess → owner |
| Bot's SOL ≥ 0.05 | Keep all tax as SOL. 80% of tax → holders, 20% of tax → owner |

### 4.2 Reward Token ≠ SOL (After first Monday AI selection)

| Condition | Action |
| --------- | ------ |
| Bot's SOL < 0.05 | Swap owner's portion (20% of collected tax) to SOL for keeper until 0.10, excess to owner. Swap holders' portion (80% of collected tax) to reward token → holders |
| Bot's SOL ≥ 0.05 | Swap all collected tax to reward token: 80% of tax → holders, 20% of tax → owner |

---

## 5. Repository Layout

```
.
├── programs/
│   ├── absolute-vault/     # Core tax & distribution logic
│   └── smart-dial/         # Reward token configuration
├── keeper-bot/             # TypeScript automation service
├── scripts/                # Deployment & admin helpers
├── tests/                  # Anchor localnet e2e tests
├── miko-development-plan.md
├── miko-todo-checklist.md
└── README.md
```

---

## 6. Getting Started

### 6.1 Prerequisites

- Rust (latest stable), Anchor framework, Solana CLI
- Node.js LTS, TypeScript
- Docker for keeper bot deployment

### 6.2 Local Build & Test

```bash
# Install required toolchains
# - Rust toolchain
# - Solana development tools
# - Anchor framework

# Clone & bootstrap
# Initialize anchor project
# Build programs
# Run tests on localnet
```

### 6.3 Deploy to Devnet

**CRITICAL DEPLOYMENT PROCESS - Follow this exact order to prevent program ID mismatches:**

```bash
# Phase 1: Deploy programs with proper ID management
# CRITICAL: Generate program keypairs BEFORE any coding
# - Generate keypair for each program first
# - Update declare_id! in source code to match generated addresses
# - Build programs with correct IDs
# - Deploy using the SAME keypairs
# - Verify: deployed ID = declared ID (MUST match exactly)

# Phase 2: Create token with correct program references
# - Verify both program IDs exist and are accessible
# - Load deployed program IDs from Phase 1
# - Create Token-2022 mint with temporary authority
# - Initialize extensions (30% fee)
# - Mint total supply (1B MIKO) BEFORE any authority changes
# - Verify all tokens minted to deployer wallet

# Phase 3: Initialize and transfer authorities in correct order
# - Initialize vault program first (creates PDA)
# - Initialize smart dial
# - Transfer all authorities to Vault PDA
# - THEN revoke mint authority (must be last)
# - Distribute tokens from deployer wallet

# Phase 4: Integration & Pre-Flight
# - Phase 4-A: Mock CI tests for rapid development
# - Phase 4-B: Local Mainnet-Fork full integration testing
# - Create launch coordination script
# - Test all scenarios with real DEX programs

# Phase 5: Launch Simulation & Mainnet Canary
# - Deploy with minimal stake (1.5 SOL)
# - Execute 4-stage liquidity ladder
# - Verify fee transitions and harvest cycles
# - Validate in production environment

# Phase 6: Production deployment
# - Prepare MIKO/SOL liquidity in deployer wallet
# - Create Raydium CLMM pool with initial liquidity
# - Execute staged liquidity additions at T+60s, T+180s, T+300s
# - Immediately set launch timestamp in vault
# - Start keeper bot with scheduled fee updates
# - Monitor: 30% → 15% (5 min) → 5% (10 min)
```

---

## 7. Security Features

- **Dynamic then Immutable Tax**: Starts at 30%, reduces to 5% after 10 min, then permanently fixed
- **Anti-Sniper Protection**: High initial tax and staged liquidity deployment over 5 minutes
- **No Freeze/Mint**: Freeze authority null, mint authority revoked - truly immutable supply
- **Authority Controls**: All admin functions require program authority
- **Exclusion Management**: Separate controls for fee and reward exclusions
- **Emergency Access**: Authority can withdraw funds if needed
- **Checked Arithmetic**: Overflow/underflow protection in all programs
- **Batch Processing**: Prevents transaction size limits and CU exhaustion

---

## 8. License

MIT © 2025 MIKO Labs

---

## 9. Verification Contracts

This project uses machine-checkable Verification Contracts (see VERIFICATION_GUIDE.md) to gate phase progression. No phase may proceed without passing all required verifications.

### Core Verification Gates

| VC ID | Phase | Verifies | Blocks Progress |
|-------|-------|----------|-----------------|
| VC:2.FEE_RATE | 2 | Transfer fee is exactly 30% | YES |
| VC:2.AUTHORITIES | 2 | All authorities correctly set | YES |
| VC:3.PDA_CALCULATION | 3 | Vault PDA derivation correct | YES |
| VC:3.VAULT_EXCLUSIONS | 3 | System accounts auto-excluded | YES |
| VC:3.AUTH_SYNC | 3 | All authorities transferred to Vault PDA | YES |
| VC:3.TRANSFER_TEST | 3 | Standard transfers work with 30% fee | YES |
| VC:4.KEEPER_PREFLIGHT | 4 | Keeper environment ready | YES |
| VC:4.FIRST_MONDAY | 4 | Reward token schedule calculation | YES |
| VC:4.TAX_FLOW_LOGIC | 4 | Tax flow scenarios correctly implemented | YES |
| VC:4.TAX_FLOW_EDGE | 4-A | Edge cases handled (0.05 SOL, rollback, concurrent) | YES |
| VC:4.LOCAL_FORK_PASS | 4-B | Full DEX integration works | YES |
| VC:LAUNCH_TIME_SET | 5 | Launch timestamp set within 30 seconds | YES |
| VC:FEE_TRANSITIONS_CONFIRMED | 5 | Fee transitions at exact times | YES |
| VC:LAUNCH_LIQUIDITY | 6 | Staged liquidity deployed at exact times | YES |
| VC:LAUNCH_TIMING | 6 | Fee transitions at exact times (production) | YES |
| VC:ELIGIBILITY_SAMPLE | 5 | $100 holder filtering correct | YES |

### Critical Rule
**NO custom transfer scripts for testing** - All transfer tests must use standard SPL token transfer instructions that any wallet or DEX would use. Custom scripts that "make transfers work" are meaningless.

### Critical Reminders
- ⚠️ NEVER change program keypairs after generation
- ⚠️ Always verify deployed ID matches declared ID
- ⚠️ Initialize programs BEFORE transferring authorities
- ⚠️ Mint total supply BEFORE revoking mint authority
- ⚠️ Follow exact order in TO_DO.md checklist
- ⚠️ ALL verification gates must PASS before proceeding to next phase
- ⚠️ Deployer wallet controls all staged liquidity deployments
- ⚠️ Phase 4-A uses mocks, Phase 4-B uses real DEX programs