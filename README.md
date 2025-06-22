# MIKO Token System

A Solana-based token with automated 5% tax on DEX trades, AI-driven reward distribution, and dynamic holder eligibility.

## Overview

MIKO Token implements an automated tax and reward system that works seamlessly with Solana DEXs (Raydium, Meteora, Orca, etc.):

- **5% Tax on All DEX Trades**: Using Token-2022 transfer fees
- **AI-Driven Rewards**: @project_miko selects weekly reward tokens
- **Automated Distribution**: Tax collected and distributed every 5 minutes
- **Dynamic Eligibility**: $100+ USD minimum holding requirement

## Tax Distribution

- **1% to Owner**: Direct payment for project maintenance
- **4% to Treasury**: Converted to reward tokens and distributed to holders

## System Components

### 1. MIKO Token (Token-2022)
- SPL Token-2022 with 5% transfer fee extension
- Fees automatically collected on ALL transfers (including DEX trades)
- Withheld fees accumulate in token accounts

### 2. Absolute Vault Program
- Harvests accumulated transfer fees
- Splits: 1% to owner, 4% to treasury
- Maintains holder registry with USD-based eligibility
- Manages exclusions for non-user wallets

### 3. Smart Dial Program  
- Stores current reward token selection
- Updated weekly by keeper bot
- Maintains treasury wallet configuration

### 4. Keeper Bot
- **Monday 03:00 UTC**: Checks @project_miko tweets for reward token
- **Every 5 minutes**: Harvests fees, swaps to rewards, distributes
- **Continuous**: Updates holder eligibility based on USD value
- **Automated**: No manual intervention required

## Technical Architecture

### Token-2022 Transfer Fees
```rust
// 5% fee on every transfer (including DEX trades)
transfer_fee_config {
    transfer_fee_basis_points: 500,  // 5%
    maximum_fee: u64::MAX,
}
```

### Fee Collection Flow
1. Users trade on any DEX (Raydium, Meteora, etc.)
2. 5% fee automatically withheld in their token accounts
3. Keeper bot harvests fees every 5 minutes
4. Fees sent to Absolute Vault for distribution

### Reward Distribution Flow
1. AI tweets reward token selection (Monday 00:00-02:00 UTC)
2. Keeper bot detects tweet at 03:00 UTC
3. Extracts $SYMBOL mentions, queries Birdeye
4. Selects token with highest 24h volume
5. Updates Smart Dial with new reward token
6. Every 5 minutes: swaps treasury to rewards and distributes

## Programs

- **Absolute Vault**: Tax collection and distribution
- **Smart Dial**: Reward token configuration
- **Token-2022**: MIKO token with transfer fees

## Requirements

- Solana CLI 2.0+
- Rust 1.70+
- Anchor 0.29.0
- Node.js 18+
- Twitter API access
- Birdeye API key