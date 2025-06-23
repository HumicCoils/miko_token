# MIKO Token Devnet Testing Guide

This guide covers testing two versions of the MIKO token system on devnet:
1. **Production Version**: Unmodified code to verify deployment
2. **Test Version**: Simplified logic for functional testing

## Version 1: Production Version Testing

This version contains the complete production code without any modifications.

### Purpose
- Verify successful compilation and deployment
- Test initialization procedures
- Confirm all accounts and PDAs are created correctly
- Validate keeper bot can connect to programs

### What Can Be Tested
✅ Program deployment  
✅ Program initialization  
✅ Account creation (PDAs)  
✅ Keeper bot startup  
✅ Health monitoring  
✅ AI tweet monitoring (mock tweets)  
✅ Exclusion management  

### What Cannot Be Tested
❌ Token swaps (no Jupiter on devnet)  
❌ Birdeye price queries (no devnet support)  
❌ Actual reward distribution (no liquidity)  
❌ USD-based holder eligibility (no price data)  

### Testing Steps

1. **Deploy Programs**
```bash
cd programs/absolute-vault
cargo build-sbf
solana program deploy target/deploy/absolute_vault.so

cd ../smart-dial  
cargo build-sbf
solana program deploy target/deploy/smart_dial.so
```

2. **Create MIKO Token**
```bash
npm run create-token
# Save the mint address
```

3. **Initialize Programs**
```bash
npm run initialize-programs
```

4. **Start Keeper Bot**
```bash
cd keeper-bot
npm install
npm run dev
```

5. **Verify Health**
```bash
curl http://localhost:3000/health
```

### Expected Results
- Programs deploy successfully
- Initialization completes without errors
- Keeper bot starts and shows "healthy" status
- Logs show attempted operations (will fail on swaps/prices)

## Version 2: Devnet Test Version

This version has simplified logic for functional testing on devnet.

### Modifications Made

1. **Tax Distribution**: Instead of swapping to reward tokens, distribute MIKO directly
2. **Holder Eligibility**: Based on token amount (100,000 MIKO) instead of USD value
3. **Reward Token Selection**: Simplified without Birdeye validation
4. **No Jupiter Integration**: Direct transfers instead of swaps

### What Can Be Tested
✅ Tax collection (5% transfer fees)  
✅ Tax distribution (1% owner, 4% to holders)  
✅ Holder registry updates  
✅ Reward distribution logic  
✅ AI tweet monitoring  
✅ 5-minute automation cycle  
✅ Exclusion system  

### Testing Steps

1. **Deploy Test Version**
```bash
# Switch to test branch
git checkout devnet-test

# Build and deploy
cd programs/absolute-vault
cargo build-sbf
solana program deploy target/deploy/absolute_vault.so

cd ../smart-dial
cargo build-sbf  
solana program deploy target/deploy/smart_dial.so
```

2. **Create and Distribute Test Tokens**
```bash
# Create MIKO token with transfer fees
npm run create-token

# Mint tokens to test wallets
npm run mint-test-tokens

# Create test transactions to generate fees
npm run generate-test-transactions
```

3. **Initialize with Test Parameters**
```bash
npm run initialize-test
```

4. **Start Test Keeper Bot**
```bash
cd keeper-bot
npm run dev:test
```

5. **Monitor Operations**
```bash
# Watch tax collection (every 5 minutes)
npm run monitor-tax-collection

# Watch distributions
npm run monitor-distributions

# Check holder registry
npm run check-holders
```

6. **Test Reward Token Updates**
```bash
# Manually trigger reward token update
npm run test-reward-update
```

### Test Scenarios

#### Scenario 1: Tax Collection
1. Create 10 test wallets with MIKO tokens
2. Execute transfers between wallets
3. Verify 5% fees are withheld
4. Wait 5 minutes for keeper bot to collect
5. Verify 1% sent to owner, 4% available for distribution

#### Scenario 2: Holder Eligibility
1. Create wallets with varying MIKO amounts:
   - Wallet A: 50,000 MIKO (ineligible)
   - Wallet B: 100,000 MIKO (eligible)
   - Wallet C: 500,000 MIKO (eligible)
2. Verify only B and C are in holder registry

#### Scenario 3: Distribution
1. Ensure tax has been collected
2. Wait for distribution cycle
3. Verify eligible holders receive proportional shares
4. Check excluded wallets receive nothing

#### Scenario 4: Exclusions
1. Add wallet to exclusion list
2. Verify it's removed from distributions
3. Remove from exclusion list
4. Verify it's added back to distributions

### Configuration

Create `.env.test` for devnet testing:
```env
SOLANA_RPC_URL=https://api.devnet.solana.com
ABSOLUTE_VAULT_PROGRAM=<YOUR_DEVNET_PROGRAM_ID>
SMART_DIAL_PROGRAM=<YOUR_DEVNET_PROGRAM_ID>
MIKO_TOKEN_MINT=<YOUR_TEST_TOKEN_MINT>
KEEPER_BOT_PRIVATE_KEY=<TEST_WALLET_KEY>

# Test parameters
MIN_HOLDER_BALANCE=100000000000000  # 100,000 MIKO (9 decimals)
SKIP_PRICE_CHECKS=true
SKIP_SWAPS=true
USE_MOCK_TWITTER=true
```

## Monitoring and Debugging

### Useful Commands

```bash
# Check program logs
solana logs | grep "MIKO"

# View account data
solana account <PDA_ADDRESS> --output json

# Check token supply
spl-token supply <MINT_ADDRESS>

# View holder registry
npm run view-registry

# Check tax collection status
npm run check-tax-status
```

### Common Issues and Solutions

1. **"No fees to collect"**
   - Generate more test transactions
   - Check if accounts have withheld amounts

2. **"Holder registry empty"**
   - Ensure test wallets have 100,000+ MIKO
   - Check exclusion list

3. **"Tweet monitoring not working"**
   - Verify USE_MOCK_TWITTER=true
   - Check mock tweet format

## Test Report Template

```markdown
## Devnet Test Report

**Date**: [DATE]
**Tester**: [NAME]
**Version**: [Production/Test]

### Deployment
- [ ] Programs compiled successfully
- [ ] Programs deployed to devnet
- [ ] Program IDs recorded

### Initialization  
- [ ] Smart Dial initialized
- [ ] Absolute Vault initialized
- [ ] All PDAs created correctly

### Token Creation
- [ ] MIKO token created with 5% transfer fee
- [ ] Test tokens minted
- [ ] Test wallets funded

### Keeper Bot
- [ ] Bot starts without errors
- [ ] Health endpoint accessible
- [ ] All services initialized

### Tax Collection (Test Version Only)
- [ ] Transfer fees collected
- [ ] Fees harvested after 5 minutes
- [ ] 1% sent to owner wallet
- [ ] 4% available for distribution

### Distribution (Test Version Only)
- [ ] Holder registry updated
- [ ] Eligible holders identified (100k+ MIKO)
- [ ] Distributions executed
- [ ] Proportional shares calculated correctly

### Issues Found
[List any issues]

### Recommendations
[Suggestions for mainnet deployment]
```

## Next Steps

After successful devnet testing:

1. Review all test results
2. Fix any identified issues
3. Update production code if needed
4. Prepare mainnet deployment plan
5. Conduct security audit
6. Deploy to mainnet with monitoring