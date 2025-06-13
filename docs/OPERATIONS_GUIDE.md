# MIKO Token Operations Guide

This guide provides operational procedures for both test and production environments.

## Environment Overview

| Aspect | Test Environment | Production Environment |
|--------|-----------------|----------------------|
| Network | Devnet | Mainnet-beta |
| Wallets | Test wallets with airdropped SOL | Hardware wallets / Multisig |
| API Keys | Test/Development keys | Production keys with higher limits |
| Monitoring | Basic logging | Full monitoring stack |
| Intervals | Fast (minutes) | Standard (5min distribution) |
| Security | Relaxed | Strict |

## System Architecture - Three Distribution Scenarios

### Scenario 1: Normal Operation (SOL ≥ 0.05, Reward Token ≠ SOL)
- **5% tax** → All swapped to reward tokens
- **Distribution**: 80% to holders (4%), 20% to owner (1%)

### Scenario 2: Low SOL Balance (SOL < 0.05, Reward Token ≠ SOL)
- **5% tax** → Split: 4% to rewards, 1% to SOL
- **Distribution**: 
  - All reward tokens to eligible holders
  - SOL to owner (keeping keeper bot at 0.1 SOL)

### Scenario 3: Reward Token is SOL
- **5% tax** → All swapped to SOL
- **Distribution**: 
  - 80% SOL to eligible holders
  - 20% SOL handled like Scenario 2 (excess above 0.1 SOL to owner)

### Dynamic Holder Eligibility
- Based on $100 USD worth of MIKO
- Calculated before each distribution cycle
- Uses real-time price from Birdeye API

## Keeper Bot Operations

### Test Environment Operations

#### Starting the Bot
```bash
# Development mode with test features
TEST_MODE=true npm run dev

# Or with Docker
docker-compose -f docker-compose.test.yml up
```

#### Environment Variables (Test)
```bash
# .env.test
NODE_ENV=development
TEST_MODE=true
RPC_URL=https://solana-devnet.g.alchemy.com/v2/YOUR_KEY
KEEPER_BOT_KEY=<base64_encoded_test_key>

# Program IDs (Devnet)
ABSOLUTE_VAULT_PROGRAM_ID=EMstwrRUs4dWeec9azA9RJB5Qu93A1F5Q34JyN3w4QFC
SMART_DIAL_PROGRAM_ID=67sZQtNqoRs5RjncYXMaeRAGrgUK49GSaLJCvHA2SXrj
MIKO_TOKEN_MINT=BiQUbqckzG7C4hhv6vCYBeEx7KDEgaXqK1M3x9X67KKh

# Test values for APIs
BIRDEYE_API_KEY=test_key
TWITTER_BEARER_TOKEN=test_token

# Emergency fund (can be any wallet for testing)
EMERGENCY_FUND_ADDRESS=FwN6tCpJkHhuYxBKwcrGU6PDW4aRNuukQBi58ay4iYGM
```

#### Manual Testing Commands
```bash
# Trigger reward check
curl -X POST http://localhost:3000/test/trigger-reward-check

# Trigger distribution with price override
curl -X POST http://localhost:3000/test/trigger-distribution \
  -H "Content-Type: application/json" \
  -d '{"mikoPrice": 0.01}'

# Update holder registry with custom threshold
curl -X POST http://localhost:3000/test/update-holders \
  -H "Content-Type: application/json" \
  -d '{"minTokens": 10000}'

# Check bot SOL balance
curl http://localhost:3000/test/sol-balance

# Simulate low SOL scenario
curl -X POST http://localhost:3000/test/drain-sol \
  -H "Content-Type: application/json" \
  -d '{"targetBalance": 0.04}'
```

### Production Environment Operations

#### Starting the Bot
```bash
# Kubernetes
kubectl apply -f kubernetes/

# Docker with production config
docker run -d \
  --name miko-keeper-bot \
  --env-file .env.production \
  --restart unless-stopped \
  miko-keeper-bot:production
```

#### Production Monitoring
```bash
# Health checks
curl https://keeper.miko.finance/health

# Check SOL balance
curl https://keeper.miko.finance/stats | jq .solBalance

# Monitor reward cycles
curl https://keeper.miko.finance/rewards/recent
```

#### Production Alerts
- **KeeperBotDown**: Bot hasn't reported in 5 minutes
- **LowSOLBalance**: SOL balance < 0.02 (critical)
- **HighErrorRate**: Error rate > 10%
- **MissedRewardCycle**: No distribution in 15 minutes
- **SwapFailures**: Multiple consecutive swap failures

## Dynamic Holder Eligibility

### Test Environment

#### Simulate Different Price Scenarios
```bash
# Test with $0.01 MIKO price (10,000 MIKO threshold)
curl -X POST http://localhost:3000/test/set-miko-price \
  -H "Content-Type: application/json" \
  -d '{"price": 0.01}'

# Test with $0.10 MIKO price (1,000 MIKO threshold)
curl -X POST http://localhost:3000/test/set-miko-price \
  -H "Content-Type: application/json" \
  -d '{"price": 0.10}'

# Test with $0.001 MIKO price (100,000 MIKO threshold)
curl -X POST http://localhost:3000/test/set-miko-price \
  -H "Content-Type: application/json" \
  -d '{"price": 0.001}'
```

#### Create Test Holders with Various Balances
```bash
# Create holders with different balance levels
node scripts/create-test-holders.js \
  --count 20 \
  --min-balance 500 \
  --max-balance 500000
```

### Production Environment

#### Monitor Price and Thresholds
```bash
# Current MIKO price
curl https://api.miko.finance/price

# Current eligibility threshold
curl https://api.miko.finance/holders/threshold

# Eligible holder count
curl https://api.miko.finance/holders/eligible-count
```

## Reward Distribution

### Test Environment Reward Cycle

```bash
# 1. Set test reward token
curl -X POST http://localhost:3000/test/set-reward-token \
  -H "Content-Type: application/json" \
  -d '{"symbol": "BONK", "mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"}'

# 2. Fund treasury with test reward tokens
spl-token create-account $REWARD_TOKEN --owner $TREASURY
spl-token mint $REWARD_TOKEN 1000000 $TREASURY_REWARD_ACCOUNT

# 3. Add MIKO to treasury for swapping
spl-token transfer $MIKO_TOKEN_MINT 100000 $TREASURY_WALLET

# 4. Execute reward cycle
curl -X POST http://localhost:3000/test/execute-reward-cycle

# 5. Check distribution results
curl http://localhost:3000/test/last-distribution
```

### Production Environment Monitoring

```bash
# Recent distributions
curl https://api.miko.finance/rewards/history?limit=10

# Pending tax amount
curl https://api.miko.finance/tax/pending

# Next cycle timing
curl https://api.miko.finance/rewards/next-cycle
```

## SOL Balance Management

### Test Environment

#### Simulate SOL Management Scenarios
```bash
# Test low SOL scenario
curl -X POST http://localhost:3000/test/simulate-low-sol

# Test SOL refuel process
curl -X POST http://localhost:3000/test/simulate-sol-refuel

# Check emergency fund transfers
curl http://localhost:3000/test/emergency-fund-transfers
```

### Production Environment

#### Monitor SOL Balance
```bash
# Current balance and thresholds
curl https://api.miko.finance/keeper/sol-status

# SOL swap history
curl https://api.miko.finance/keeper/sol-swaps

# Emergency fund balance
solana balance $EMERGENCY_FUND_ADDRESS
```

## Troubleshooting

### Test Environment Issues

| Issue | Solution |
|-------|----------|
| Swap simulation not working | Ensure `TEST_MODE=true` is set |
| Price mock not applying | Check log for "DEVNET MODE" messages |
| Holder eligibility wrong | Verify mock price calculation |
| SOL management not triggering | Manually set low balance with test endpoint |

### Production Environment Issues

| Issue | Solution |
|-------|----------|
| Keeper bot not swapping to SOL | Check balance, ensure < 0.05 SOL |
| Wrong holder threshold | Verify Birdeye API is returning price |
| Rewards not distributing | Check treasury balance, holder registry |
| High swap failures | Check Jupiter API status, increase slippage |

## Emergency Procedures

### Test Environment
1. Stop all services: `docker-compose down`
2. Clear test data: `rm -rf test-data/`
3. Reset holder registry: `node scripts/reset-holders.js`
4. Restart: `TEST_MODE=true npm run dev`

### Production Environment

#### Critical: Keeper Bot SOL Depleted
1. **Immediate**: Transfer SOL manually to keeper bot
2. **Investigate**: Check swap logs for failures
3. **Adjust**: Increase SOL threshold if needed
4. **Monitor**: Watch next cycles closely

#### Critical: Wrong Reward Token
1. **Stop**: Scale down keeper bot immediately
2. **Update**: Manually update Smart Dial if needed
3. **Verify**: Check AI agent tweets for correct token
4. **Resume**: Scale up keeper bot

#### Critical: Mass Distribution Failure
1. **Pause**: Stop keeper bot
2. **Diagnose**: Check program logs
3. **Fix**: Address root cause
4. **Test**: Run single distribution test
5. **Resume**: Restart normal operations

## Best Practices

### For Test Environment
- Always use TEST_MODE=true
- Create diverse holder scenarios
- Test edge cases (exactly $100, $99.99, etc.)
- Simulate network issues
- Document test results

### For Production Environment
- Monitor SOL balance continuously
- Set up alerts for all thresholds
- Keep emergency fund topped up
- Review holder eligibility changes
- Audit reward distributions daily
- Never manually intervene unless critical

## Maintenance Schedule

### Daily
- Check keeper bot health
- Review SOL balance and swaps
- Verify reward distributions
- Monitor holder count changes

### Weekly
- Analyze distribution patterns
- Review API usage and limits
- Check emergency fund balance
- Audit security logs

### Monthly
- Full system health check
- Performance optimization review
- Cost analysis (SOL usage)
- Security audit
- Key rotation (if applicable)