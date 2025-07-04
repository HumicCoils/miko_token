# MIKO Token System

A Solana-native token ecosystem that combines protocol-level transaction fees, dynamic reward distribution, and AI-assisted governance.

---

## 1. Key Features

| Feature | Description |
| ------- | ----------- |
| **5% Transfer Fee (Immutable)** | Implemented with Token-2022 TransferFee extension; permanently fixed at 5% with revoked authority |
| **Automatic Fee Harvesting** | Dedicated Keeper Bot sweeps withheld fees every 5 minutes and sends them to the Absolute Vault program |
| **Split Logic (1% / 4%)** | 1% of each fee batch goes to project owner; 4% is converted to weekly reward token for holders |
| **AI-Driven Reward Selection** | Twitter AI agent (@project_miko) suggests tokens every Monday; Keeper bot selects highest volume token via Birdeye |
| **Dynamic Holder Eligibility** | Holders must maintain ≥ $100 worth of MIKO to receive rewards; checked at distribution time |
| **Dual Exclusion Lists** | Separate lists for fee collection and reward distribution; system accounts auto-excluded |
| **Emergency Withdrawal** | Authority can withdraw tokens/SOL from vault or withheld fees for maintenance |
| **Scenario-Aware SOL Top-Up** | Bot ensures operational wallet always has enough SOL for network fees |

---

## 2. System Architecture

```
┌────────────────────────┐      Harvest / Split        ┌───────────────────────┐
│      Token-2022        │      (5-min cron)          │    Absolute Vault     │
│   with 5% fee          ├─────────────────────────────▶│   (Anchor program)    │
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

1. **MIKO Mint** – Token-2022 mint with TransferFeeConfig (authority revoked)
2. **Absolute Vault** – Harvests fees, manages exclusions, distributes rewards
3. **Smart Dial** – Stores active reward token configuration & history

**Off-Chain Services**

- **Keeper Bot** (TypeScript, Node.js 20+, Docker)
  - 5-min fee harvest cycle
  - Weekly token selection (Monday 03:00 UTC)
  - Real-time eligibility checks
  - SOL balance safeguards

---

## 3. Tax Distribution Workflow

### 3.1 Normal Cycle

1. Users trade MIKO on any Solana DEX; 5% fee is withheld automatically
2. Keeper bot harvests withheld balances and calls Absolute Vault
3. Absolute Vault splits the batch: **1% → Owner**, **4% → Treasury**
4. The 4% share is swapped via Jupiter to current reward token and distributed pro-rata

### 3.2 Eligibility Logic

- Holder eligibility = `MIKO_balance_USD ≥ $100` at distribution time
- Fee exclusion list: Wallets exempt from 5% tax
- Reward exclusion list: Wallets exempt from receiving rewards
- System accounts (owner, treasury, keeper, programs) auto-excluded from both

---

## 4. Special Handling Rules

### 4.1 Reward Token = **SOL**

| Condition | Action |
| --------- | ------ |
| Bot's SOL < 0.05 | Swap all 5% tax to SOL. 4% → holders, 1% retained until SOL ≥ 0.10, then excess → owner |
| Bot's SOL ≥ 0.05 | Swap all 5% tax to SOL. 4% → holders, 1% → owner |

### 4.2 Reward Token ≠ SOL

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
# Create Token-2022 mint with 5% fee
# Revoke transfer fee authority
# Initialize programs
```

---

## 7. Security Features

- **Immutable 5% Tax**: Transfer fee authority revoked after token creation
- **Authority Controls**: All admin functions require program authority
- **Exclusion Management**: Separate controls for fee and reward exclusions
- **Emergency Access**: Authority can withdraw funds if needed
- **Checked Arithmetic**: Overflow/underflow protection in all programs
- **Batch Processing**: Prevents transaction size limits and CU exhaustion

---

## 8. License

MIT © 2025 MIKO Labs