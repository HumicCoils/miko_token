# MIKO Token - Solana Tax & Reward Distribution System

A Solana blockchain project implementing an innovative tax and reward distribution system for the MIKO token using the Token-2022 standard.

## 🚨 Current Status: Smart Dial Deployment Blocked

**Important**: We are currently experiencing a critical issue with Solana CLI deployment. Please see [PROJECT_STATUS.md](./PROJECT_STATUS.md) for detailed information about the deployment problem.

## Overview

MIKO Token implements a unique tokenomics model with:
- **5% Transfer Tax** (immutable): 1% to owner wallet, 4% to holder rewards
- **Dynamic Reward Distribution**: AI agent (@mikolovescrypto) tweets determine reward tokens
- **Automated Operations**: Keeper bot monitors and executes distributions

## Architecture

### 1. Absolute Vault Program
- Manages 5% tax collection via Token-2022 transfer fee extension
- Distributes tax: 1% to owner, 4% to treasury for holder rewards
- Maintains holder registry with chunked storage (100 holders per account)

### 2. Smart Dial Program  
- Updates reward token based on AI agent tweets
- Only keeper bot can update reward tokens
- Manages treasury and owner wallet addresses

### 3. Keeper Bot (TypeScript)
- Monitors AI agent Twitter account
- Fetches token data from Birdeye API
- Executes token swaps via Jupiter
- Orchestrates reward distributions

## Current Development Status

✅ **Completed**:
- All smart contract code implemented
- Programs successfully compiled
- Absolute Vault deployed to devnet: `838Ra5u255By2HkV7mtzP6KFgXnjrQiQDB3Gmdpbrf2d`
- Keeper bot implementation complete
- Documentation created

❌ **Blocked**:
- Smart Dial program deployment (Solana CLI issue)
- Program initialization
- Token creation
- Integration testing

## Critical Issue: Deployment Problem

The Solana CLI (v2.2.16) is sending hundreds of parallel transactions during program deployment, causing:
- Rapid SOL consumption (~10 SOL lost in seconds)
- Transaction failures
- Network congestion

**We need community help to find alternative deployment methods!**

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
cd programs/absolute-vault && cargo build-sbf
cd ../smart-dial && cargo build-sbf
```

### Environment Setup
```bash
# Copy example environment files
cp .env.example .env
cp keeper-bot/.env.example keeper-bot/.env

# Configure your environment variables
```

## Documentation

- [Project Status & Issues](./PROJECT_STATUS.md) - Current status and deployment issues
- [Test Deployment Guide](./docs/DEPLOYMENT_TEST.md) - Devnet deployment instructions
- [Production Deployment Guide](./docs/DEPLOYMENT_PRODUCTION.md) - Mainnet deployment guide
- [Operations Guide](./docs/OPERATIONS_GUIDE.md) - Running and monitoring the system
- [Technical PRD](./miko-token-backend.md) - Original project requirements

## Contributing

We urgently need help with:
1. Alternative deployment methods for Solana programs
2. Solutions to the parallel transaction issue
3. Review of smart contract security

Please open an issue or submit a PR if you can help!

## Security Considerations

- 5% tax rate is immutable (hardcoded constant)
- Program upgrade authority must be burned after deployment
- Keeper bot private key must be secured
- All critical operations use PDAs

## License

This project is licensed under the MIT License.

## Contact

For questions or support, please open an issue on GitHub.