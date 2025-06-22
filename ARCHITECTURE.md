# MIKO Token System Architecture (Redesigned)

## Overview

The MIKO token system implements an automated 5% tax collection and reward distribution mechanism on Solana. This document describes the corrected architecture that actually works, replacing the flawed Token-2022 transfer fee approach.

## Core Components

### 1. MIKO Token
- **Standard**: SPL Token (NOT Token-2022 with transfer fees)
- **Supply**: 1 billion tokens (immutable)
- **Decimals**: 9

### 2. Transfer Wrapper Program (`miko-transfer`)
A new program that wraps all MIKO token transfers to implement tax collection.

**Key Instructions:**
- `transfer_with_tax`: Handles transfers with automatic 5% tax deduction
- `transfer_checked_with_tax`: Checked version with amount validation

**Features:**
- Checks tax exemption status before applying tax
- Automatically routes tax to holding account
- Single atomic operation (no separate fee collection needed)

### 3. Absolute Vault Program (Updated)
Manages tax collection, holder registry, and reward distribution.

**Key Instructions:**
- `initialize`: Sets up the vault with Smart Dial program reference
- `collect_and_distribute`: Atomic operation that swaps tax to reward token and distributes
- `update_holder_registry`: Updates eligible holders (>$100 USD worth)
- `manage_exclusions`: Add/remove addresses from rewards/tax

**Removed Features:**
- No Token-2022 fee collection logic
- No manual tax processing steps

### 4. Smart Dial Program
Stores the current reward token based on AI agent tweets.

**Key Instructions:**
- `update_reward_token`: Updates the reward token (keeper bot only)
- `get_distribution_config`: Returns current reward token and distribution parameters

### 5. Keeper Bot
Automated service that orchestrates the entire system.

**Responsibilities:**
- Monitor @miko_project tweets every Monday
- Extract token symbol and query Birdeye API
- Update reward token in Smart Dial
- Monitor tax accumulation and trigger distribution
- Manage holder registry updates

## Tax Collection Flow

### Step 1: Transfer Initiation
```
User → Transfer Wrapper Program → transfer_with_tax()
```

### Step 2: Tax Calculation
```rust
if is_tax_exempt(sender) {
    tax = 0
} else {
    tax = amount * 500 / 10000  // 5%
}
net_amount = amount - tax
```

### Step 3: Atomic Transfer
```
1. Transfer net_amount: sender → recipient
2. Transfer tax: sender → tax_holding_account
```

### Step 4: Automated Collection & Distribution
When tax holding balance > threshold:
```
Keeper Bot → Absolute Vault → collect_and_distribute()
    ├── Swap MIKO → Reward Token (via Jupiter)
    ├── Calculate distribution shares
    └── Distribute to eligible holders
```

## Distribution Scenarios

### Scenario 1: Normal Operation (Keeper ≥ 0.05 SOL)
- 100% of tax (5%) → Reward Token
- Distribution: 80% to holders, 20% to owner

### Scenario 2: Low Keeper Balance (Keeper < 0.05 SOL)
- 80% of tax (4%) → Reward Token → Holders
- 20% of tax (1%) → SOL
  - First 0.1 SOL → Keeper Bot
  - Remainder → Owner

### Scenario 3: Reward Token is SOL
- 100% of tax (5%) → SOL
- 80% → Holders
- 20% → Based on keeper balance (Scenario 2 logic)

## Holder Eligibility

### Dynamic Calculation
- Minimum: $100 USD worth of MIKO
- Price fetched from Birdeye API
- Updated before each distribution

### Exclusions
**Always Excluded:**
- MIKO token mint address
- Tax holding account
- Treasury wallet
- Known DEX routers and liquidity pools

**Admin Managed:**
- Can add/remove addresses as needed
- Stored on-chain in ExclusionList accounts

## Integration Points

### Jupiter Integration
```rust
// CPI to Jupiter for token swaps
jupiter::swap_exact_input(
    source_mint: MIKO,
    destination_mint: reward_token,
    amount: tax_collected,
    slippage_bps: 100,  // 1%
)
```

### Birdeye Integration
```typescript
// Get token price for holder eligibility
const mikoPrice = await birdeye.getTokenPrice(MIKO_MINT);
const minTokens = 100 / mikoPrice;  // $100 worth

// Find highest volume token
const tokens = await birdeye.searchTokens(symbol);
const selected = tokens.sort((a, b) => b.volume24h - a.volume24h)[0];
```

## Security Considerations

1. **Authority Controls**
   - Only deployer can manage exclusions
   - Only keeper bot can update reward token
   - Tax rate is immutable (5%)

2. **Atomic Operations**
   - Tax collection happens in same transaction as transfer
   - Distribution swaps and sends in one transaction
   - No intermediate states where funds are stuck

3. **Fail-safes**
   - Keeper bot monitors its own SOL balance
   - Distribution fails gracefully if no eligible holders
   - Slippage protection on swaps

## Deployment Order

1. Deploy Transfer Wrapper Program
2. Deploy updated Absolute Vault Program
3. Deploy Smart Dial Program
4. Create MIKO token (standard SPL token)
5. Initialize all programs
6. Set up exclusions
7. Deploy and start Keeper Bot

## Key Differences from Original Design

1. **No Token-2022 Transfer Fees**
   - Original: Relied on Token-2022's transfer fee extension
   - New: Custom transfer wrapper handles tax collection

2. **Direct Tax Collection**
   - Original: Fees held as "withheld" in token accounts
   - New: Tax sent directly to holding account

3. **Simplified Flow**
   - Original: Multiple steps to collect and process fees
   - New: Single atomic operation for collection and distribution

4. **Better Integration**
   - Original: Complex CPI calls to Token-2022
   - New: Simple SPL token transfers with tax logic

This architecture ensures all requirements are met:
- ✅ Fully automated tax collection
- ✅ AI-driven reward token selection
- ✅ Dynamic holder eligibility ($100+ USD)
- ✅ Comprehensive exclusion system
- ✅ No manual intervention required