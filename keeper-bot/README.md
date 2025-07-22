# MIKO Keeper Bot

Automated keeper bot for the MIKO token system that handles fee updates, tax harvesting, token swaps, and reward distribution.

## Features

- **Dynamic Fee Updates**: Automatically updates transfer fees based on launch schedule (30% → 15% → 5%)
- **Fee Harvesting**: Monitors and harvests withheld fees when threshold (500k MIKO) is reached
- **Tax Flow Management**: Implements proper 20%/80% tax split with keeper SOL balance management
- **Twitter Integration**: Monitors @project_miko for weekly reward token updates (after first Monday)
- **Token Selection**: Selects highest volume token matching tweeted symbol
- **Reward Distribution**: Distributes rewards proportionally to holders with ≥ $100 USD value
- **Edge Case Handling**: Rollback support, slippage protection, concurrent harvest prevention

## Architecture

### Core Modules

1. **FeeUpdateManager**: Handles dynamic fee transitions based on launch timestamp
2. **TwitterMonitor**: Monitors Twitter for reward token announcements
3. **TokenSelector**: Selects appropriate reward token based on volume
4. **FeeHarvester**: Harvests accumulated fees when threshold is met
5. **SwapManager**: Manages token swaps with tax flow scenarios
6. **DistributionEngine**: Distributes rewards to eligible holders

### Mock Adapters (Phase 4-A)

- **MockRaydiumAdapter**: Simulates Raydium CLMM pool operations
- **MockJupiterAdapter**: Simulates Jupiter swap operations
- **MockBirdeyeAdapter**: Simulates token holder and price data

## Configuration

The bot uses TOML configuration files. See `config/mock_config.toml` for example.

Key configuration sections:
- `network`: RPC endpoints and network settings
- `programs`: Program IDs for vault and smart dial
- `token`: MIKO token details
- `keeper`: Keeper wallet and SOL balance thresholds
- `harvest`: Harvest threshold and batch settings
- `timing`: Fee update and check intervals

## Tax Flow Scenarios

The bot implements four tax flow scenarios based on reward token and keeper balance:

1. **SOL Reward, Low Keeper**: Top up keeper from owner's share
2. **SOL Reward, Normal**: Standard 20%/80% distribution
3. **Token Reward, Low Keeper**: Swap owner's share to SOL for keeper
4. **Token Reward, Normal**: Swap all to reward token

## Testing

### Unit Tests
```bash
npm test
```

### Verification Tests
```bash
./scripts/run-verification-tests.sh
```

### Required Verifications (Phase 4-A)
- ✅ VC:4.FIRST_MONDAY - First Monday calculation
- ✅ VC:4.TAX_FLOW_EDGE - Edge case handling
- ✅ VC:4.KEEPER_PREFLIGHT - Environment readiness

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

### Docker
```bash
# Build and run Phase 4 container
docker-compose up phase4-keeper
```

## Environment Variables

- `NODE_ENV`: Environment mode (development/production)
- `SOLANA_RPC_URL`: Solana RPC endpoint
- `CONFIG_PATH`: Path to configuration file
- `LOG_LEVEL`: Logging level (debug/info/warn/error)

## Scripts

- `test-preflight.ts`: Tests keeper preflight checks
- `run-verification-tests.sh`: Runs all verification tests

## Error Handling

The bot implements comprehensive error handling:
- Transaction rollback on swap failures
- Exponential backoff for retries
- State consistency maintenance
- Concurrent operation prevention

## Monitoring

Logs are written to:
- Console output (with colors in development)
- `logs/keeper-bot.log` (rotating file)
- `logs/error.log` (errors only)

## Next Steps

Phase 4-B will implement:
- Real Raydium CLMM integration
- Real Jupiter swap execution
- Local Mainnet-Fork testing
- Launch script with liquidity ladder