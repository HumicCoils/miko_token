# MIKO Token - Solana Tax & Reward Distribution System

A Solana blockchain project implementing an innovative tax and reward distribution system for the MIKO token using the Token-2022 standard.

## 🚀 Current Status: Testing Phase on Devnet

All core components have been successfully deployed to devnet. The system is ready for comprehensive testing. See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for detailed deployment information.

## Overview

MIKO Token implements a unique tokenomics model with three distribution scenarios:

### Scenario 1: Normal Operation (Keeper bot has sufficient SOL)
- **5% Transfer Tax**: All collected taxes are swapped to reward tokens
- **Distribution**: 
  - 80% of reward tokens to eligible holders (4% of original 5%)
  - 20% of reward tokens to owner wallet (1% of original 5%)

### Scenario 2: Low SOL Balance (Keeper bot < 0.05 SOL)
- **5% Transfer Tax** split:
  - 4% swapped to reward tokens → 100% distributed to eligible holders
  - 1% swapped to SOL → Sent to owner (keeping keeper bot at 0.1 SOL)

### Scenario 3: Reward Token is SOL
- **5% Transfer Tax**: All swapped to SOL
- **Distribution**:
  - 80% of SOL to eligible holders (4% of original 5%)
  - 20% of SOL handled like Scenario 2 (owner receives excess above 0.1 SOL)

Additional features:
- **Dynamic Holder Eligibility**: Holders need $100+ USD worth of MIKO
- **AI-Driven Rewards**: AI agent (@mikolovescrypto) tweets determine reward tokens
- **Self-Sustaining**: Keeper bot maintains its SOL balance automatically

## Architecture

### 1. Absolute Vault Program
- Manages 5% tax collection via Token-2022 transfer fee extension
- Sends all collected taxes to treasury for swapping
- Maintains holder registry with dynamic eligibility threshold
- Distributes rewards to eligible holders

### 2. Smart Dial Program  
- Updates reward token based on AI agent tweets
- Only keeper bot can update reward tokens
- Manages treasury and owner wallet addresses

### 3. Keeper Bot (TypeScript)
- Monitors AI agent Twitter account
- Calculates dynamic holder eligibility based on MIKO price
- Manages its own SOL balance intelligently
- Executes token swaps via Jupiter
- Orchestrates reward distributions

## Deployment Information (Devnet)

### Programs
- **Absolute Vault**: `EMstwrRUs4dWeec9azA9RJB5Qu93A1F5Q34JyN3w4QFC`
- **Smart Dial**: `67sZQtNqoRs5RjncYXMaeRAGrgUK49GSaLJCvHA2SXrj`

### MIKO Token
- **Mint**: `BiQUbqckzG7C4hhv6vCYBeEx7KDEgaXqK1M3x9X67KKh`
- **Supply**: 1,000,000,000 MIKO (immutable)
- **Transfer Fee**: 5% (500 basis points)

### Key Wallets
- **Treasury**: `ESEQvotDCxHancsHSsV4UXLPrhyFe6K16ncbJbi9Y4DQ`
- **Owner**: `FwN6tCpJkHhuYxBKwcrGU6PDW4aRNuukQBi58ay4iYGM`
- **Keeper Bot**: `CqjraVtYWqwfxZjHPemqoqNu1QYZvjBZoonJxTm7CinG`

## Getting Started

### Prerequisites
- Rust 1.70+
- Solana CLI 2.0+
- Anchor Framework 0.29.0
- Node.js 18+
- TypeScript

### Build Programs
```bash
# Build both programs
cargo build-sbf
```

### Deploy Programs (Already deployed on devnet)
```bash
# Use Alchemy RPC for reliable deployment
solana config set --url https://solana-devnet.g.alchemy.com/v2/YOUR_API_KEY

# Deploy programs (if needed)
solana program deploy --program-id <KEYPAIR> target/deploy/<PROGRAM>.so
```

### Configure Keeper Bot
```bash
cd keeper-bot
cp .env.example .env
# Edit .env with your configuration

# Install dependencies
npm install

# Build
npm run build

# Run in test mode
TEST_MODE=true npm run dev
```

## Testing on Devnet

### Test Mode Features
- **Swap Simulation**: Jupiter doesn't support devnet, so swaps are simulated
- **Price Mocking**: MIKO price is mocked (default: $0.01) for eligibility calculations
- **Manual Triggers**: Test reward cycles without waiting for AI tweets

See detailed testing guides:
- [Testing Swap Functionality](./docs/TESTING_SWAP_FUNCTIONALITY_ON_DEVNET.md)
- [Testing Dynamic Eligibility](./docs/TESTING_DYNAMIC_ELIGIBILITY_ON_DEVNET.md)

### Quick Test
```bash
# 1. Create test wallets and distribute MIKO
node scripts/distribute-test-tokens.js

# 2. Perform test transfers to accumulate tax
node scripts/test-transfers.js

# 3. Trigger reward cycle manually
node scripts/test-reward-cycle.js
```

## Documentation

- [Project Status](./PROJECT_STATUS.md) - Current deployment status and testing instructions
- [Test Deployment Guide](./docs/DEPLOYMENT_TEST.md) - Devnet deployment instructions
- [Production Deployment Guide](./docs/DEPLOYMENT_PRODUCTION.md) - Mainnet deployment guide
- [Operations Guide](./docs/OPERATIONS_GUIDE.md) - Running and monitoring the system
- [Testing Guides](./docs/) - Detailed testing documentation

## Key Features

### Dynamic Holder Eligibility
- Minimum holding value: $100 USD worth of MIKO
- Threshold updates before each reward cycle
- Based on real-time MIKO price from Birdeye API

### Intelligent SOL Management
- Keeper bot monitors its own SOL balance
- Automatic refueling when low
- Excess SOL sent to owner (maintaining 0.1 SOL buffer)
- Ensures sustainable operation

### Tax Distribution Scenarios

#### Normal Flow (Scenario 1)
1. 5% tax collected on all transfers
2. All tax sent to treasury
3. Keeper bot swaps all tax to reward token
4. 80% distributed to eligible holders
5. 20% sent to owner

#### Low SOL Flow (Scenario 2)
1. 5% tax collected on all transfers
2. All tax sent to treasury
3. Keeper bot splits: 4% to rewards, 1% to SOL
4. All reward tokens to eligible holders
5. SOL to owner (keeping 0.1 SOL for operations)

#### SOL Reward Flow (Scenario 3)
1. 5% tax collected on all transfers
2. All tax sent to treasury
3. Keeper bot swaps all to SOL
4. 80% SOL to eligible holders
5. 20% SOL handled like Scenario 2

## Security Considerations

- 5% tax rate is immutable (hardcoded constant)
- Program upgrade authority must be burned after mainnet deployment
- Keeper bot private key must be secured
- All critical operations use PDAs
- Dynamic thresholds prevent gaming the system

## Contributing

We welcome contributions! Areas of interest:
1. Security audits
2. Performance optimizations
3. Additional test coverage
4. UI/Dashboard development

Please open an issue or submit a PR!

## License

This project is licensed under the MIT License.

## Contact

For questions or support, please open an issue on GitHub.