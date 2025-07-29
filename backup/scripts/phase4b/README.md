# Phase 4-B: Local Mainnet Fork Launch Testing

This directory contains scripts for testing the MIKO token launch sequence using a local mainnet fork.

## Key Components

### 1. Launch Coordinator (`launch-coordinator-final.ts`)
The main launch orchestration script that implements the exact specifications from LAUNCH_LIQUIDITY_PARAMS.md:

- **90% of supply** (900M MIKO) deployed as liquidity in 4 stages
- **10 SOL** total liquidity for test mode (1 SOL for canary)
- **Strict timing windows** (±5 seconds) for each stage
- **Oracle price requirement** - must fetch SOL price before pool creation
- **Distribution Engine V2** integration for undistributed fund rollover

### 2. Launch Stages

| Stage | Time | MIKO | SOL (Test) | SOL (Canary) | Price Range |
|-------|------|------|------------|--------------|-------------|
| Bootstrap | T+0s | 10M (1%) | 0.2 | 0.02 | P₀ × [0.7, 1.3] |
| Stage A | T+60s | 40M (4%) | 0.8 | 0.08 | P₀ × [0.5, 1.5] |
| Stage B | T+180s | 150M (15%) | 3.0 | 0.3 | P₀ × [0.3, 2.0] |
| Stage C | T+300s | 700M (70%) | 6.0 | 0.6 | P₀ × [0.005, 160] |

### 3. Fee Schedule
- **0-5 minutes**: 30% transfer tax (anti-sniper)
- **5-10 minutes**: 15% transfer tax
- **10+ minutes**: 5% transfer tax (permanent)

## Usage

### 1. Start Local Mainnet Fork
```bash
# Start the mainnet fork with required programs
./start-mainnet-fork.sh

# Verify it's running
curl http://127.0.0.1:8899 -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

### 2. Run Launch Sequence

```bash
# Test mode (10 SOL liquidity)
ts-node launch-coordinator-final.ts test

# Canary mode (1 SOL liquidity) 
ts-node launch-coordinator-final.ts canary

# Production mode (10 SOL liquidity)
ts-node launch-coordinator-final.ts production
```

### 3. Monitor Progress
The script will:
1. Fetch oracle price (required)
2. Calculate initial price P₀
3. Run preflight checks
4. Create CLMM pool with bootstrap liquidity
5. Execute staged liquidity additions at precise times
6. Monitor fee transitions
7. Check for eligible holders and rollover logic
8. Generate comprehensive launch report

### 4. Emergency Functions

Check undistributed funds:
```bash
ts-node emergency-withdraw-undistributed.ts check
```

Withdraw stuck funds (authority only):
```bash
ts-node emergency-withdraw-undistributed.ts withdraw
```

## Key Features

### Distribution Engine V2
- Automatically rolls over undistributed funds to next cycle
- Tracks: amount, token type, last update timestamp
- No funds lost if no eligible holders exist early in launch

### Strict Timing Enforcement
- Bootstrap: Must execute immediately
- Stage A: T+60s ±5s
- Stage B: T+180s ±5s  
- Stage C: T+300s ±5s (before fee drop)

### Oracle Price Requirement
- Must successfully fetch SOL/USD price before pool creation
- No fallback to stale prices
- Price locked at pool creation time

## Verification

After launch, check the generated report:
- `launch-report-test.json` - Test mode results
- `launch-report-canary.json` - Canary mode results
- `launch-report-production.json` - Production results

The report includes:
- Exact execution timestamps
- Market metrics (FDV, MC, liquidity depth)
- Fee transition times
- Distribution engine status
- Anti-sniper effectiveness metrics

## Important Notes

1. **Oracle Integration**: Currently simulated. In production, integrate with Pyth/Switchboard
2. **Raydium SDK**: Pool creation is simulated. Implement actual Raydium CLMM calls
3. **Token Balances**: Balance checks are TODO. Implement SPL token balance queries
4. **Keeper Bot**: Spawning is simulated. Implement actual process management

## Next Steps

After successful Phase 4-B testing:
1. Run `VC:4.LOCAL_FORK_PASS` verification
2. Document results in DEVELOPMENT_STATUS.md
3. Proceed to Phase 5: Mainnet Canary deployment