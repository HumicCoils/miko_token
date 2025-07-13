# MIKO Token System

A Solana-native token ecosystem that combines protocol-level transaction fees, dynamic reward distribution, AI-assisted governance, and anti-sniper protection.

---

## 1. Key Features

| Feature | Description |
| ------- | ----------- |
| **Dynamic Transfer Fee** | Starts at 30% on launch, reduces to 15% after 5 min, then 5% after 10 min (permanently fixed) |
| **Transaction Size Limit** | Maximum 1% of supply per transaction for first 10 minutes, then unlimited |
| **Automatic Fee Harvesting** | Keeper Bot monitors and harvests withheld fees when accumulated amount reaches 500,000 MIKO (0.05% of supply) |
| **Split Logic (1% / 4%)** | 1% of each fee batch goes to project owner; 4% is converted to weekly reward token for holders |
| **AI-Driven Reward Selection** | Twitter AI agent (@project_miko) suggests tokens every Monday; Keeper bot selects highest volume token via Birdeye |
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
│      Token-2022        │      (5-min cron)          │    Absolute Vault     │
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

- **Keeper Bot** (TypeScript, Node.js 20+, Docker)
  - Threshold-based harvest (triggers at 500,000 MIKO accumulated)
  - Tax rate updates (5 min, 10 min marks)
  - Weekly token selection (First Monday after launch onwards)
  - Real-time eligibility checks
  - SOL balance safeguards

---

## 3. Tax Distribution Workflow

### 3.1 Normal Cycle

1. Users trade MIKO on any Solana DEX; dynamic fee is withheld automatically
2. When accumulated fees reach 500,000 MIKO (0.05% of supply), Keeper bot harvests and calls Absolute Vault
3. Absolute Vault splits the batch: **1% → Owner**, **4% → Treasury**
4. The 4% share is swapped via Jupiter to current reward token and distributed pro-rata

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
| Bot's SOL < 0.05 | Swap all 5% tax to SOL. 4% → holders, 1% retained until SOL ≥ 0.10, then excess → owner |
| Bot's SOL ≥ 0.05 | Swap all 5% tax to SOL. 4% → holders, 1% → owner |

### 4.2 Reward Token ≠ SOL (After first Monday AI selection)

| Condition | Action |
| --------- | ------ |
| Bot's SOL < 0.05 | Swap 1% of tax to SOL until ≥ 0.10; swap remaining 4% to reward token → holders |
| Bot's SOL ≥ 0.05 | Swap full 5% tax to reward token: 4% → holders, 1% → owner |

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

- Rust 1.75+, Anchor 0.30.1, Solana CLI 1.18+
- Node.js 20+, TypeScript 5.0+
- Docker for keeper bot deployment

### 6.2 Local Build & Test

```bash
# Install toolchains
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked

# Clone & bootstrap
anchor init miko-token --javascript
anchor build
anchor test          # runs localnet e2e suite
```

### 6.3 Deploy to Devnet

```bash
solana airdrop 2
anchor deploy --provider.cluster devnet
# Create Token-2022 mint with 30% initial fee
# Deploy transfer hook program
# Initialize programs
# Set launch timestamp on liquidity addition
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