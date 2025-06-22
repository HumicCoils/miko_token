# Keeper Bot Architecture

## Overview

The Keeper Bot is a TypeScript service that orchestrates the automated tax collection and reward distribution flow for the MIKO token system. It monitors AI agent tweets, coordinates with on-chain programs, and manages reward token swaps.

## Core Components

### 1. AI Agent Monitor Service
**Purpose**: Monitor @project_miko Twitter account for reward token selections

**Responsibilities**:
- Poll Twitter API for new tweets from @project_miko
- Parse tweets to identify new reward token mentions
- Validate token addresses using Birdeye API
- Schedule reward distribution for next Monday 12:00 UTC

**Key Methods**:
```typescript
interface AIAgentMonitor {
  startMonitoring(): Promise<void>
  checkForNewTweets(): Promise<Tweet[]>
  extractTokenFromTweet(tweet: Tweet): Promise<TokenInfo | null>
  scheduleRewardDistribution(token: TokenInfo): Promise<void>
}
```

### 2. Tax Collection Service
**Purpose**: Trigger periodic tax collection from transfer wrapper

**Responsibilities**:
- Monitor tax accumulation in holding account
- Trigger collection when threshold reached or on schedule
- Call Absolute Vault's `collect_and_distribute` instruction

**Key Methods**:
```typescript
interface TaxCollectionService {
  checkTaxBalance(): Promise<number>
  collectAndDistribute(): Promise<TransactionSignature>
  schedulePeriodicCollection(): void
}
```

### 3. Holder Registry Service
**Purpose**: Maintain up-to-date holder eligibility

**Responsibilities**:
- Fetch all MIKO token holders from on-chain
- Calculate USD value of holdings using Birdeye
- Update holder registry chunks in Absolute Vault
- Exclude non-user wallets (exchanges, contracts, etc.)

**Key Methods**:
```typescript
interface HolderRegistryService {
  fetchAllHolders(): Promise<Holder[]>
  calculateHolderValue(holder: Holder): Promise<number>
  updateHolderRegistry(eligibleHolders: Holder[]): Promise<void>
  isExcludedWallet(address: PublicKey): boolean
}
```

### 4. Reward Distribution Service
**Purpose**: Execute weekly reward distributions

**Responsibilities**:
- Swap treasury MIKO to reward token via Jupiter
- Calculate pro-rata distribution based on holdings
- Execute batch distribution transactions
- Handle failed transactions with retry logic

**Key Methods**:
```typescript
interface RewardDistributionService {
  executeWeeklyDistribution(rewardToken: TokenInfo): Promise<void>
  swapToRewardToken(amount: number, targetToken: PublicKey): Promise<number>
  distributeRewards(rewardAmount: number, holders: Holder[]): Promise<void>
  retryFailedDistributions(): Promise<void>
}
```

### 5. Health Monitoring Service
**Purpose**: Ensure bot reliability and uptime

**Responsibilities**:
- Track service health metrics
- Alert on failures or anomalies
- Provide HTTP health endpoint
- Log all operations for audit trail

**Key Methods**:
```typescript
interface HealthMonitor {
  checkHealth(): HealthStatus
  recordMetric(name: string, value: number): void
  alertOnFailure(error: Error): void
  getMetrics(): Metrics
}
```

## Data Flow

### Weekly Reward Cycle
1. **Monday Morning**: AI Agent Monitor detects new reward token tweet
2. **Parse & Validate**: Extract token address, validate via Birdeye
3. **Update Smart Dial**: Record new reward token on-chain
4. **Collect Taxes**: Trigger tax collection from holding account
5. **Update Registry**: Refresh holder eligibility ($100+ USD)
6. **Swap Tokens**: Convert treasury MIKO to reward token
7. **Distribute**: Send pro-rata rewards to eligible holders

### Tax Collection Flow
1. **Monitor**: Check tax holding account balance periodically
2. **Threshold**: When balance > 10,000 MIKO or weekly schedule
3. **Collect**: Call `collect_and_distribute` instruction
4. **Split**: 1% to owner wallet, 4% to treasury wallet
5. **Log**: Record collection event for audit

## Configuration

### Environment Variables
```env
# RPC Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com

# Program IDs
ABSOLUTE_VAULT_PROGRAM=355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt
SMART_DIAL_PROGRAM=11111111111111111111111111111111
MIKO_TRANSFER_PROGRAM=6THY8LLbyALh8mTQqKgKofVzo6VVq7sCZbFUnVWfpj6g

# Keeper Bot Configuration
KEEPER_BOT_PRIVATE_KEY=<base64-encoded-private-key>
TAX_COLLECTION_THRESHOLD=10000000000  # 10,000 MIKO (9 decimals)
HOLDER_VALUE_THRESHOLD=100  # $100 USD

# External APIs
TWITTER_BEARER_TOKEN=<your-twitter-api-token>
BIRDEYE_API_KEY=<your-birdeye-api-key>

# Monitoring
HEALTH_CHECK_PORT=3000
METRICS_PORT=3001
LOG_LEVEL=info
```

### Deployment Configuration
```yaml
# docker-compose.yml
version: '3.8'
services:
  keeper-bot:
    image: miko-keeper-bot:latest
    environment:
      - NODE_ENV=production
    ports:
      - "3000:3000"  # Health check
      - "3001:3001"  # Metrics
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

## Security Considerations

### Private Key Management
- Use AWS KMS or HashiCorp Vault for key storage
- Rotate keys periodically
- Implement key access audit logging

### Transaction Security
- Implement transaction simulation before execution
- Set appropriate compute unit limits
- Use priority fees during network congestion

### API Security
- Rate limit all external API calls
- Implement exponential backoff for retries
- Store API keys securely (never in code)

## Error Handling

### Retry Strategy
```typescript
const retryConfig = {
  maxAttempts: 3,
  backoffMultiplier: 2,
  initialDelay: 1000,
  maxDelay: 30000
};
```

### Failure Scenarios
1. **RPC Node Failure**: Fallback to secondary RPC endpoints
2. **Transaction Failure**: Retry with higher priority fee
3. **API Rate Limits**: Queue requests and retry after cooldown
4. **Program Errors**: Log, alert, and manual intervention

## Monitoring & Observability

### Key Metrics
- Tax collection volume (daily/weekly)
- Reward distribution success rate
- Holder registry size
- API call success rates
- Transaction confirmation times

### Logging
- Structured JSON logging
- Log levels: ERROR, WARN, INFO, DEBUG
- Centralized log aggregation
- 30-day retention policy

### Alerts
- Tax collection failures
- Reward distribution delays
- API rate limit warnings
- Health check failures
- Unusual transaction patterns

## Development Workflow

### Local Development
```bash
# Install dependencies
npm install

# Run tests
npm test

# Start development server
npm run dev

# Build for production
npm run build
```

### Testing Strategy
- Unit tests for all services
- Integration tests with devnet
- Load testing for distribution logic
- Chaos testing for failure scenarios

### Deployment Process
1. Run full test suite
2. Build Docker image
3. Deploy to staging environment
4. Run smoke tests
5. Deploy to production
6. Monitor metrics for 24 hours

## Future Enhancements

### Phase 2 Features
- Multi-signature support for high-value operations
- Automated holder communication system
- Advanced analytics dashboard
- Machine learning for optimal distribution timing

### Scaling Considerations
- Implement database for historical data
- Add caching layer for frequent queries
- Consider microservices architecture
- Implement horizontal scaling for distribution