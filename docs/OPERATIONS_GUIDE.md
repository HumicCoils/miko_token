# MIKO Token Operations Guide

This guide provides operational procedures for both test and production environments.

## Environment Overview

| Aspect | Test Environment | Production Environment |
|--------|-----------------|----------------------|
| Network | Devnet | Mainnet-beta |
| Wallets | Test wallets with airdropped SOL | Hardware wallets / Multisig |
| API Keys | Test/Development keys | Production keys with higher limits |
| Monitoring | Basic logging | Full monitoring stack |
| Intervals | Fast (minutes) | Standard (30min/5min/1hr) |
| Security | Relaxed | Strict |

## Keeper Bot Operations

### Test Environment Operations

#### Starting the Bot
```bash
# Development mode with hot reload
npm run dev

# Or with Docker
docker-compose -f docker-compose.test.yml up
```

#### Manual Testing Commands
```bash
# Trigger reward check
curl -X POST http://localhost:3000/test/trigger-reward-check

# Trigger distribution
curl -X POST http://localhost:3000/test/trigger-distribution

# Update holder registry
curl -X POST http://localhost:3000/test/update-holders

# Check state
curl http://localhost:3000/test/state
```

#### Test Environment Monitoring
```bash
# View logs
tail -f logs/keeper-bot-test.log

# Check metrics
curl http://localhost:3000/metrics | grep test_

# Monitor Solana programs
solana logs <PROGRAM_ID> -u devnet
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

# Metrics endpoint (internal only)
curl http://keeper-internal:9090/metrics

# Grafana dashboards
https://monitoring.miko.finance/d/miko-keeper
```

#### Production Alerts
- KeeperBotDown: Bot hasn't reported in 5 minutes
- LowSOLBalance: SOL balance < 0.5
- HighErrorRate: Error rate > 10%
- MissedRewardCycle: No distribution in 2 hours

## Token Management

### Test Token Operations

#### Create Test Holders
```bash
# Script to create multiple test holders
for i in {1..10}; do
  solana-keygen new -o holder$i-test.json --no-bip39-passphrase
  solana airdrop 1 holder$i-test.json -u devnet
  
  # Create token account
  spl-token create-account $MIKO_TOKEN_MINT \
    --owner holder$i-test.json \
    --url devnet
done
```

#### Distribute Test Tokens
```bash
# Transfer tokens to test holders
for i in {1..10}; do
  spl-token transfer $MIKO_TOKEN_MINT 100000 \
    $(solana-keygen pubkey holder$i-test.json) \
    --url devnet
done
```

### Production Token Operations

#### Monitor Token Metrics
```bash
# Total supply
spl-token supply $MIKO_TOKEN_MINT

# Largest holders
spl-token accounts $MIKO_TOKEN_MINT --limit 20

# Tax collected (check withheld amount)
spl-token display $MIKO_TOKEN_MINT --verbose
```

#### Emergency Procedures
```bash
# Pause reward distribution (keeper bot only)
kubectl scale deployment miko-keeper-bot --replicas=0

# Resume operations
kubectl scale deployment miko-keeper-bot --replicas=1
```

## Reward Distribution

### Test Environment

#### Simulate Reward Cycle
```bash
# 1. Update reward token
curl -X POST http://localhost:3000/test/set-reward-token \
  -H "Content-Type: application/json" \
  -d '{"token": "BONK", "mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"}'

# 2. Add test funds to treasury
spl-token transfer $MIKO_TOKEN_MINT 1000000 $TREASURY_WALLET

# 3. Trigger distribution
curl -X POST http://localhost:3000/test/trigger-distribution

# 4. Check results
curl http://localhost:3000/test/last-distribution
```

### Production Environment

#### Monitor Reward Cycles
```bash
# View recent distributions
curl https://api.miko.finance/rewards/recent

# Check pending rewards
curl https://api.miko.finance/rewards/pending

# Verify holder registry
curl https://api.miko.finance/holders/count
```

## Troubleshooting

### Test Environment Issues

| Issue | Solution |
|-------|----------|
| Insufficient SOL | `solana airdrop 10 -u devnet` |
| Program not initialized | Re-run initialization script |
| API rate limits | Use mock mode: `TEST_MODE=true` |
| Transaction failures | Increase compute units in test config |

### Production Environment Issues

| Issue | Solution |
|-------|----------|
| Keeper bot not updating | Check logs, verify API keys |
| High gas costs | Optimize batch sizes, check priority fees |
| RPC errors | Switch to backup RPC endpoint |
| Distribution failures | Check treasury balance, holder registry |

## Maintenance Procedures

### Test Environment
- Weekly: Clean up test accounts
- Monthly: Reset test data
- As needed: Update dependencies

### Production Environment
- Daily: Review metrics and logs
- Weekly: Backup state data
- Monthly: Security audit
- Quarterly: Key rotation

## API Endpoints Reference

### Test Environment Endpoints
```
GET  /health              - Health status
GET  /metrics             - Prometheus metrics
POST /test/trigger-reward-check
POST /test/trigger-distribution  
POST /test/update-holders
POST /test/set-reward-token
GET  /test/state
GET  /test/last-distribution
```

### Production Environment Endpoints
```
GET  /health              - Health status
GET  /metrics             - Prometheus metrics (internal)
GET  /live                - Kubernetes liveness
GET  /ready               - Kubernetes readiness
```

## Emergency Procedures

### Test Environment
1. Stop all services: `docker-compose down`
2. Clear test data: `rm -rf test-data/`
3. Restart fresh: `./scripts/reset-test-env.sh`

### Production Environment
1. **DO NOT PANIC**
2. Assess the situation
3. Stop keeper bot if needed
4. Contact technical lead
5. Follow incident response plan
6. Document everything

## Best Practices

### For Test Environment
- Use descriptive names for test wallets
- Document test scenarios
- Clean up after testing
- Don't use production keys

### For Production Environment
- Always verify transactions before signing
- Monitor all operations
- Keep detailed logs
- Follow security protocols
- Never share private keys
- Use multisig for critical operations