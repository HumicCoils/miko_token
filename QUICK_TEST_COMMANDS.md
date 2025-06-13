# Quick Test Commands for MIKO Token Devnet Testing

## 1. Start Keeper Bot
```bash
cd keeper-bot
npm run dev
```

## 2. Health Check
```bash
curl http://localhost:3000/health
```

## 3. Test Scenario 1 (Normal Operation)
```bash
# Set reward token to BONK
curl -X POST http://localhost:3000/test/set-reward-token \
  -H "Content-Type: application/json" \
  -d '{"token": "BONK", "mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"}'

# Trigger distribution
curl -X POST http://localhost:3000/test/trigger-distribution
```

## 4. Test Scenario 2 (Low SOL)
```bash
# Note: Manually reduce keeper bot SOL or modify code to simulate
# Then trigger distribution
curl -X POST http://localhost:3000/test/trigger-distribution
```

## 5. Test Scenario 3 (SOL Reward)
```bash
# Set reward token to SOL
curl -X POST http://localhost:3000/test/set-reward-token \
  -H "Content-Type: application/json" \
  -d '{"token": "SOL", "mint": "So11111111111111111111111111111111111111112"}'

# Trigger distribution
curl -X POST http://localhost:3000/test/trigger-distribution
```

## 6. Update Holders
```bash
curl -X POST http://localhost:3000/test/update-holders
```

## 7. Check State
```bash
curl http://localhost:3000/test/state
```

## 8. View Metrics
```bash
curl http://localhost:9090/metrics
```

## 9. Stop/Start Scheduler
```bash
# Stop
curl -X POST http://localhost:3000/test/scheduler/stop

# Start
curl -X POST http://localhost:3000/test/scheduler/start
```

## Monitor Logs
Watch the keeper bot terminal for:
- "DEVNET MODE" messages
- Scenario detection logs
- Simulated swap results
- Distribution calculations