# MIKO Token System Development Plan

## Overview

This document outlines the comprehensive development plan for the MIKO token system on Solana, featuring automated tax collection, AI-driven reward distribution, and dynamic holder eligibility.

## Architecture Overview

### System Components

1. **MIKO Token (Token-2022)**
   - SPL Token-2022 with 5% transfer fee extension
   - Automatic fee collection on all transfers
   - Withheld fees accumulate in token accounts

2. **Absolute Vault Program**
   - Core tax collection and distribution logic
   - Holder registry management
   - Reward distribution mechanics

3. **Smart Dial Program**
   - Reward token configuration storage
   - Update authorization management
   - Treasury configuration

4. **Keeper Bot**
   - Automated task scheduler
   - Twitter API integration
   - Jupiter swap integration
   - Birdeye API integration

## Technical Stack

### On-chain Development
- **Language**: Rust 1.75+
- **Framework**: Anchor 0.30.1
- **Token Standard**: SPL Token-2022
- **Program Development**: Solana CLI 1.18+

### Off-chain Development
- **Language**: TypeScript 5.0+
- **Runtime**: Node.js 20+
- **Web3 Library**: @solana/web3.js 1.91+
- **Scheduler**: node-cron
- **APIs**: Twitter API v2, Birdeye API, Jupiter API v6

## Development Phases

### Phase 1: Foundation (Week 1-2)
**Objective**: Set up development environment and create MIKO token

1. **Environment Setup**
   - Install Rust, Solana CLI, Anchor
   - Configure local validator for testing
   - Set up TypeScript project structure

2. **MIKO Token Creation**
   - Deploy Token-2022 with transfer fee extension
   - Configure 5% transfer fee (500 basis points)
   - Revoke transfer fee config authority to make tax permanently fixed
   - Test fee collection mechanics
   - Verify DEX compatibility

### Phase 2: Core Programs (Week 3-5)
**Objective**: Develop and test on-chain programs

1. **Absolute Vault Program**
   - **Data Structures**:
     - VaultState: Must store authority, treasury, owner_wallet, token_mint, min_hold_amount, fee_exclusions, reward_exclusions
     - ExclusionEntry: Structure to track exclusion type (FEE_EXCLUDED, REWARD_EXCLUDED, BOTH_EXCLUDED)
     - HolderInfo: Structure for off-chain holder tracking with wallet address, balance, eligibility status, and last update timestamp
   
   - **Instructions**:
     - `initialize`: Set up vault with initial configuration
       - Automatically add system accounts (owner, treasury, keeper, vault program) to both exclusion lists
     - `harvest_fees`: Collect withheld fees from token accounts
       - Skip accounts in fee_exclusions list
     - `distribute_rewards`: Send rewards to eligible holders (eligibility checked at distribution time)
       - Skip accounts in reward_exclusions list
     - `manage_exclusions`: Add/remove wallet from exclusion lists
       - Support exclusion types: FEE_ONLY, REWARD_ONLY, BOTH
       - Validate authority for changes
     - `update_min_hold`: Update minimum holding requirement
     - `emergency_withdraw_vault`: Withdraw tokens/SOL from vault accounts
       - Authority-only access
       - Support any SPL token and native SOL
     - `emergency_withdraw_withheld`: Withdraw withheld fees from token accounts
       - Authority-only access
       - Useful for recovering stuck fees

   - **Key Logic**:
     - Fee splitting: 20% to owner (1% of 5%), 80% to treasury (4% of 5%)
     - Dynamic SOL balance management for transaction fees
     - Real-time holder eligibility check at distribution time
     - Separate exclusion lists for fee collection and reward distribution
     - System accounts automatically excluded from both
     - Emergency withdrawal capabilities for maintenance
     - Batch processing for large holder counts

2. **Smart Dial Program**
   - **Data Structures**:
     - DialState: Must include authority, current_reward_token, treasury_wallet, last_update timestamp, and update_history
     - UpdateRecord: Must track timestamp, reward_token address, and updater identity
   
   - **Instructions**:
     - `initialize`: Set up dial with initial configuration
     - `update_reward_token`: Change current reward token
     - `update_treasury`: Update treasury wallet
     - `get_current_config`: Read current configuration

### Phase 3: Keeper Bot Development (Week 6-7)
**Objective**: Build automated service for system operations

1. **Core Modules**
   - **Twitter Monitor**:
     - Connect to Twitter API v2
     - Monitor @project_miko tweets
     - Extract $SYMBOL mentions from tweets posted between 00:00-02:00 UTC Monday
     - Parse tweet timestamps
   
   - **Token Selector**:
     - Query Birdeye API for mentioned tokens
     - Compare 24h volumes for each mentioned token
     - Select highest volume token
     - Validate token liquidity threshold
   
   - **Fee Harvester**:
     - Scan all MIKO token accounts
     - Identify accounts with withheld fees
     - Batch harvest transactions for efficiency
     - Handle transaction failures gracefully
   
   - **Swap Manager**:
     - Integrate Jupiter API v6 for token swaps
     - Calculate optimal swap routes
     - Execute swaps with 1% slippage protection
     - Handle SOL balance scenarios based on tax flow logic
   
   - **Distribution Engine**:
     - Query eligible holders using Birdeye API at distribution time
     - Calculate proportional rewards based on holder balances
     - Batch distribution transactions
     - Track distribution history

2. **Scheduler Configuration**
   - Monday 03:00 UTC: Check AI tweets and update reward token
   - Every 5 minutes: Harvest fees, check holder eligibility, and distribute rewards
   - Continuous: Monitor system health

### Phase 4: Integration & Testing (Week 8-9)
**Objective**: Integrate all components and comprehensive testing

1. **Integration Testing**
   - Program interaction tests
   - Bot automation tests
   - API integration tests
   - Error handling scenarios

2. **Scenario Testing**
   - SOL balance management scenarios
   - Large holder count performance
   - Network congestion handling
   - API failure recovery

3. **Security Audit Preparation**
   - Code review
   - Access control verification
   - Economic attack vectors
   - Front-running protection

### Phase 5: Deployment (Week 10)
**Objective**: Deploy to mainnet-beta

1. **Pre-deployment**
   - Final security review
   - Configuration verification
   - Keeper bot infrastructure setup
   - API keys and credentials

2. **Deployment Steps**
   - Deploy programs to mainnet
   - Create MIKO token
   - Initialize programs
   - Start keeper bot
   - Monitor initial operations

## Key Implementation Details

### Transfer Fee Mechanics
- Configure Token-2022 transfer fee at 500 basis points (5%) - permanently fixed
- Set maximum fee to u64::MAX for no upper limit
- After token creation, revoke transfer fee config authority to ensure 5% tax cannot be changed
- Ensure fees accumulate in withheld accounts for harvest

### Tax Flow Scenarios
The system must handle different scenarios based on keeper bot's SOL balance and reward token type to ensure continuous operation:

#### Scenario 1: Reward Token is SOL
- **When Keeper SOL < 0.05**:
  - Swap all accumulated 5% tax to SOL
  - Distribute 4% to eligible holders
  - Use 1% to top up keeper account to 0.1 SOL
  - Send any excess from the 1% to owner
  
- **When Keeper SOL ≥ 0.05**:
  - Swap all accumulated 5% tax to SOL
  - Distribute 4% to eligible holders
  - Send 1% to owner

#### Scenario 2: Reward Token is NOT SOL
- **When Keeper SOL < 0.05**:
  - Swap 1% of tax to SOL to top up keeper to 0.1 SOL
  - Send any excess SOL to owner
  - Swap remaining 4% to reward token
  - Distribute reward tokens to eligible holders
  
- **When Keeper SOL ≥ 0.05**:
  - Swap all 5% tax to reward token
  - Distribute 4% worth to eligible holders
  - Send 1% worth to owner

### Holder Eligibility System
- Use Birdeye API to fetch current MIKO token price in USD
- Query all token holders and their balances
- Calculate USD value for each holder (balance × price)
- Mark holders with ≥ $100 USD value as eligible
- Filter out wallets in reward_exclusions list
- Use eligible holder list directly for distribution
- System accounts (owner, treasury, keeper, programs) are automatically excluded from both fees and rewards

### Reward Distribution Algorithm
- Calculate total balance of all eligible holders
- For each eligible holder, calculate their proportion of total balance
- Distribute rewards proportionally based on balance percentage
- Process in batches to handle large holder counts efficiently

### Birdeye API Integration
- **Price Data**: Use `/defi/price` endpoint to get MIKO token USD price
- **Holder Data**: Use `/defi/token_holders` endpoint with pagination to get all holders
- **Volume Data**: Use `/defi/volume` endpoint to compare reward token candidates
- **Rate Limiting**: Implement proper rate limiting and error handling
- **Caching**: Cache frequently accessed data to reduce API calls

## Testing Strategy

### Unit Tests
- Program instruction tests
- Bot module tests
- Utility function tests

### Integration Tests
- End-to-end flow tests
- Multi-program interaction tests
- External API mock tests

### Stress Tests
- High transaction volume
- Large holder counts (10,000+)
- Network congestion simulation

## Security Considerations

1. **Program Security**
   - Authority checks on all admin functions
   - Overflow/underflow protection
   - Reentrancy guards
   - PDA seed validation

2. **Bot Security**
   - API key encryption
   - Rate limiting
   - Error recovery mechanisms
   - Transaction retry logic

3. **Economic Security**
   - MEV protection
   - Sandwich attack prevention
   - Fair distribution verification

## Monitoring & Maintenance

1. **System Monitoring**
   - Transaction success rates
   - API response times
   - Holder count tracking
   - Distribution accuracy

2. **Alerting**
   - Failed transactions
   - Low SOL balance
   - API failures
   - Unusual activity

## Risk Mitigation

1. **Technical Risks**
   - API downtime: Implement fallback mechanisms
   - Network congestion: Dynamic fee adjustment
   - Program bugs: Comprehensive testing suite

2. **Operational Risks**
   - Key management: Use secure key storage
   - Bot failures: Implement redundancy
   - Data consistency: Regular state verification

## Success Criteria

1. **Functional Requirements**
   - 5% tax collection on all transfers ✓
   - Automated reward distribution every 5 minutes ✓
   - AI-driven token selection ✓
   - Dynamic holder eligibility ✓

2. **Performance Requirements**
   - Process 1000+ holders in single distribution
   - Complete harvest cycle in < 30 seconds
   - 99.9% uptime for keeper bot

3. **Security Requirements**
   - No unauthorized access to admin functions
   - No loss of funds due to bugs
   - Accurate fee splitting and distribution
   - 5% tax rate permanently fixed (authority revoked)

This development plan provides a structured approach to building the MIKO token system with all specified features while maintaining security, efficiency, and reliability.