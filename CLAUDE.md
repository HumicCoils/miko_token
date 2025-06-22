# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MIKO Token Backend System - A Solana blockchain project implementing a tax and reward distribution system for the MIKO token using Token-2022 standard.

### Architecture Components
- **Absolute Vault Program**: Manages 5% tax collection and distribution (1% to owner, 4% to holders)
- **Smart Dial Program**: Dynamically updates reward tokens based on AI agent (@project_miko) tweets
- **Keeper Bot**: TypeScript service that monitors AI agent and orchestrates reward distributions

## Common Development Commands

### Smart Contract Development (Rust/Anchor)
```bash
# Initialize Anchor workspace (if not already done)
anchor init miko-token --javascript

# Build all programs
anchor build

# Run tests
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet
anchor deploy --provider.cluster mainnet

# Burn upgrade authority (CRITICAL after mainnet deployment)
solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority 11111111111111111111111111111111
```

### Keeper Bot Development (TypeScript)
```bash
# Install dependencies
cd keeper-bot && npm install

# Run tests
npm test

# Build TypeScript
npm run build

# Run locally
npm run dev

# Build Docker image
docker build -t miko-keeper-bot .

# Run with Docker Compose
docker-compose up -d

# Check health
curl http://localhost:3000/health
```

## High-Level Architecture

### Program Interactions
1. **Tax Flow**: Token transfers trigger 5% tax → collected in Token-2022 extension → Absolute Vault withdraws → splits to owner (1%) and treasury (4%)
2. **Reward Distribution**: Keeper Bot monitors AI agent tweets → identifies new reward token → updates Smart Dial → swaps treasury funds → distributes to eligible holders
3. **Holder Registry**: Maintained in chunks (max 100 holders per account) to handle Solana account size limits

### Key Design Decisions
- **Immutable Tax Rate**: 5% hardcoded in constants, cannot be changed post-deployment
- **PDA-based Security**: All critical operations use Program Derived Addresses
- **Chunked Storage**: Holder registry split across multiple accounts for scalability
- **Keeper Bot Authority**: Only the keeper bot can update reward tokens in Smart Dial

### Critical Security Considerations
- After deployment, upgrade authority MUST be burned for both programs
- Keeper bot private key must be secured (recommend AWS KMS or HashiCorp Vault)
- All tax parameters are immutable constants, not configurable state

## Project Structure

```
miko_token/
├── programs/
│   ├── absolute-vault/
│   │   └── src/
│   │       ├── instructions/    # initialize, process_tax, update_holders, distribute
│   │       ├── state/          # config, holder_registry
│   │       └── lib.rs
│   └── smart-dial/
│       └── src/
│           ├── instructions/    # initialize, update_reward_token, update_wallets
│           ├── state/          # config
│           └── lib.rs
├── keeper-bot/
│   └── src/
│       ├── services/           # AIAgentMonitor, BirdeyeClient, JupiterClient
│       ├── orchestration/      # RewardOrchestrator, RewardScheduler
│       └── monitoring/         # HealthCheck, MetricsCollector
├── scripts/                    # Token creation and deployment utilities
└── tests/                      # Integration and unit tests
```

## Environment Setup

Required environment variables for keeper bot:
- `BIRDEYE_API_KEY` - For token market data
- `TWITTER_BEARER_TOKEN` - For monitoring AI agent
- `KEEPER_BOT_KEY` - Base64 encoded private key
- `RPC_URL` - Solana RPC endpoint
- Program IDs (set after deployment)

## Testing Strategy

- Smart contracts: Use Anchor's testing framework with localnet
- Keeper bot: Jest for unit tests, integration tests against devnet
- End-to-end: Full reward cycle testing on devnet before mainnet