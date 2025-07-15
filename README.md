# MIKO Token System

A Solana-native token ecosystem that combines protocol-level transaction fees, dynamic reward distribution, AI-assisted governance, and anti-sniper protection.

---

## 1. Key Features

| Feature | Description |
| ------- | ----------- |
| **Dynamic Transfer Fee** | Starts at 30% on launch, reduces to 15% after 5 min, then 5% after 10 min (permanently fixed) |
| **Transaction Size Limit** | Maximum 1% of supply per transaction for first 10 minutes, then unlimited |
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
4. **Transfer Hook** – Enforces transaction size limits during anti-sniper period

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

**Launch Sequence:**
- **0-5 minutes**: 30% tax, max 1% per transaction
- **5-10 minutes**: 15% tax, max 1% per transaction  
- **10+ minutes**: 5% tax (permanent), no transaction limits

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
│   ├── smart-dial/         # Reward token configuration
│   └── transfer-hook/      # Anti-sniper transaction limits
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

```bash
# Phase 1: Deploy programs
# - Deploy Absolute Vault program
# - Deploy Smart Dial program  
# - Deploy Transfer Hook program

# Phase 2: Create token
# - Create Token-2022 mint with temporary authority
# - Initialize extensions (30% fee, hook)
# - Mint total supply (1B MIKO)

# Phase 3: Initialize and transfer
# - Initialize all programs (creates PDAs)
# - Transfer authorities to Vault PDA
# - Revoke mint authority
# - Distribute tokens to wallets

# Phase 4: Launch
# - Create Raydium pool
# - Set launch timestamp
# - Start keeper bot
```

---

## 7. Security Features

- **Dynamic then Immutable Tax**: Starts at 30%, reduces to 5% after 10 min, then permanently fixed
- **Anti-Sniper Protection**: High initial tax and transaction limits for first 10 minutes
- **No Freeze/Mint**: Freeze authority null, mint authority revoked - truly immutable supply
- **Authority Controls**: All admin functions require program authority
- **Exclusion Management**: Separate controls for fee and reward exclusions
- **Emergency Access**: Authority can withdraw funds if needed
- **Checked Arithmetic**: Overflow/underflow protection in all programs
- **Batch Processing**: Prevents transaction size limits and CU exhaustion

---

## 8. License

MIT © 2025 MIKO Labs