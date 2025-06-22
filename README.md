# MIKO Token - Solana Tax & Reward Distribution System

A Solana blockchain project implementing an innovative tax and reward distribution system for the MIKO token with automated collection and distribution.

## 🚀 Architecture Update

The system has been redesigned to eliminate dependency on Token-2022 transfer fees and implement a more robust tax collection mechanism using a custom transfer wrapper program.

## Overview

MIKO Token implements a 5% tax on all transfers with intelligent distribution:

### Tax Distribution
- **1% to Owner Wallet**: Direct reward for project sustainability
- **4% to Treasury**: Swapped to reward tokens and distributed to eligible holders

### Key Features
- **Automated Tax Collection**: Custom transfer wrapper ensures tax is always collected
- **AI-Driven Rewards**: @miko_project tweets determine weekly reward tokens
- **Dynamic Eligibility**: Holders need $100+ USD worth of MIKO to receive rewards
- **Fully Automated**: Keeper bot handles all operations without manual intervention

## Architecture Components

### 1. MIKO Transfer Program (NEW)
- Custom transfer wrapper that automatically deducts 5% tax
- Sends tax to Absolute Vault's holding account
- Checks tax exemption status via CPI
- Ensures tax cannot be bypassed

### 2. Absolute Vault Program (Updated)
- Collects taxes from transfer wrapper's holding account
- Splits tax: 1% to owner, 4% to treasury
- Maintains holder registry with eligibility tracking
- Distributes rewards to qualified holders
- Manages tax exemptions and reward exclusions

### 3. Smart Dial Program
- Stores current reward token selection
- Updated weekly based on AI agent tweets
- Only keeper bot can update selections
- Maintains treasury and owner wallet addresses

### 4. Keeper Bot (TypeScript)
- **AI Monitor**: Watches @miko_project tweets for token mentions
- **Tax Collector**: Triggers periodic tax collection and distribution
- **Registry Updater**: Maintains holder eligibility based on USD value
- **Reward Distributor**: Swaps treasury funds and distributes to holders
- **Health Monitor**: Ensures system reliability with metrics and alerts

## Program Flow

### Transfer Flow
1. User initiates transfer using MIKO Transfer program
2. Transfer wrapper automatically deducts 5% tax
3. Net amount (95%) sent to recipient
4. Tax (5%) sent to holding account

### Tax Collection Flow
1. Keeper bot monitors tax accumulation
2. When threshold reached, triggers collection
3. Absolute Vault splits: 1% to owner, 4% to treasury
4. Logged for audit trail

### Weekly Reward Cycle
1. **Monday**: AI agent tweets new reward token
2. Keeper bot parses tweet and validates token
3. Updates Smart Dial with new reward token
4. Refreshes holder registry ($100+ USD eligibility)
5. Swaps treasury MIKO to reward token via Jupiter
6. Distributes pro-rata to eligible holders

## Deployment

### Programs
- **Absolute Vault**: `355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt`
- **Smart Dial**: `[TO BE DEPLOYED]`
- **MIKO Transfer**: `6THY8LLbyALh8mTQqKgKofVzo6VVq7sCZbFUnVWfpj6g`

### Build Programs
```bash
# Build all programs
cd programs/absolute-vault && cargo build-sbf
cd ../smart-dial && cargo build-sbf
cd ../miko-transfer && cargo build-sbf
```

### Deploy Programs
```bash
# Deploy to devnet
solana program deploy --program-id <keypair> target/deploy/<program>.so

# IMPORTANT: After mainnet deployment, burn upgrade authority
solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority 11111111111111111111111111111111
```

## Keeper Bot Setup

### Environment Configuration
```env
# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com

# Program IDs
ABSOLUTE_VAULT_PROGRAM=355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt
SMART_DIAL_PROGRAM=[YOUR_PROGRAM_ID]
MIKO_TRANSFER_PROGRAM=6THY8LLbyALh8mTQqKgKofVzo6VVq7sCZbFUnVWfpj6g

# Token Configuration
MIKO_TOKEN_MINT=[YOUR_TOKEN_MINT]
TREASURY_WALLET=[YOUR_TREASURY_WALLET]

# Keeper Bot
KEEPER_BOT_PRIVATE_KEY=[BASE64_ENCODED_PRIVATE_KEY]
TAX_COLLECTION_THRESHOLD=10000  # 10,000 MIKO

# External APIs
TWITTER_BEARER_TOKEN=[YOUR_TWITTER_TOKEN]
BIRDEYE_API_KEY=[YOUR_BIRDEYE_KEY]
```

### Running the Bot
```bash
cd keeper-bot
npm install
npm run build

# Development
npm run dev

# Production
docker-compose up -d
```

## Security Considerations

### Immutable Parameters
- 5% tax rate hardcoded in transfer wrapper
- Tax distribution split (1%/4%) hardcoded
- Cannot be changed post-deployment

### Program Security
- Burn upgrade authority after mainnet deployment
- All critical operations use PDAs
- Keeper bot is only authorized tax collector
- Tax exemptions require explicit authorization

### Operational Security
- Keeper bot private key in secure storage (AWS KMS/HashiCorp Vault)
- API keys stored as environment variables
- Transaction simulation before execution
- Comprehensive error handling and retry logic

## Testing

### Unit Tests
```bash
# Test programs
anchor test

# Test keeper bot
cd keeper-bot && npm test
```

### Integration Testing
1. Deploy to devnet
2. Create test token with transfer wrapper
3. Execute test transfers
4. Verify tax collection
5. Test reward distribution

## Monitoring

### Health Endpoints
- `http://localhost:3000/health` - Service health
- `http://localhost:3001/metrics` - Prometheus metrics

### Key Metrics
- Tax collection volume
- Reward distribution success rate
- Holder registry size
- API response times

## Documentation

- [Architecture Details](./ARCHITECTURE.md)
- [Keeper Bot Architecture](./keeper-bot/ARCHITECTURE.md)
- [Deployment Guide](./docs/DEPLOYMENT_GUIDE.md)
- [Operations Manual](./docs/OPERATIONS_MANUAL.md)

## Future Enhancements

### Phase 2
- Multi-signature support for high-value operations
- Advanced analytics dashboard
- Automated holder communications
- Cross-chain reward distribution

### Phase 3
- Machine learning for optimal distribution timing
- Governance token integration
- Decentralized keeper network

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.