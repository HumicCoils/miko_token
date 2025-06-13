# MIKO Token Deployment Summary

## Deployed Programs (Devnet)

### Absolute Vault
- **Program ID**: `355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt`
- **Authority**: `E7usUuVX4a6TGBvXuAiYvLtSdVyzRY4BmN9QwqAKSbdx`
- **Features**:
  - 5% tax collection on all Token-2022 transfers
  - Dynamic holder eligibility based on USD value
  - Reward distribution exclusion management
  - Tax exemption management

### Smart Dial
- **Program ID**: `KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA`
- **Authority**: `E7usUuVX4a6TGBvXuAiYvLtSdVyzRY4BmN9QwqAKSbdx`
- **Features**:
  - Dynamic reward token updates
  - Keeper bot authorization
  - Treasury and owner wallet management

## Key Architecture Changes

### Tax Distribution Logic (Three Scenarios)

1. **Normal Operation** (Keeper Bot SOL ≥ 0.05):
   - Swap all 5% tax to reward token
   - Distribute 80% to eligible holders
   - Send 20% to owner

2. **Low SOL Balance** (Keeper Bot < 0.05 SOL):
   - Swap 4% to reward token (all to holders)
   - Swap 1% to SOL (to owner, keeping bot at 0.1 SOL)

3. **Reward Token is SOL**:
   - Swap all 5% to SOL
   - Distribute 80% to holders
   - Handle 20% as per scenario 2 logic

### Security Features

1. **Reward Distribution Exclusions**:
   - Exclude system accounts from receiving rewards
   - Prevent MIKO token from being selected as reward
   - Dynamic management (add/remove addresses)
   - Up to 200 addresses supported

2. **Tax Exemptions**:
   - Exempt certain addresses from 5% tax
   - Dynamic management (add/remove addresses)
   - Up to 200 addresses supported

### Dynamic Features

- **Holder Eligibility**: Based on $100 USD worth of MIKO (not fixed percentage)
- **Keeper Bot SOL Management**: Self-sustaining with 0.05 min, 0.1 target balance
- **No Hardcoded Limits**: Exclusion lists support up to 200 addresses each

## Next Steps

1. **Initialize Programs**:
   - Initialize Absolute Vault with Smart Dial program ID
   - Initialize Smart Dial with keeper bot, treasury, and owner wallets
   - Initialize exclusion accounts with initial excluded addresses

2. **Create MIKO Token**:
   - Deploy Token-2022 mint with transfer fee extension
   - Configure 5% transfer fee
   - Update MIKO_TOKEN_MINT in keeper bot config

3. **Configure Keeper Bot**:
   - Set up API keys (Birdeye, Twitter)
   - Configure keeper bot private key
   - Deploy and start monitoring service

4. **Security**:
   - After final testing, burn upgrade authority for both programs
   - Secure keeper bot private key (AWS KMS recommended)
   - Set up monitoring and alerting

## Important Notes

- Token-2022 taxes apply to ALL transfers, not just buy/sell
- Tax rate (5%) is immutable and cannot be changed post-deployment
- All critical operations use Program Derived Addresses (PDAs)
- Holder registry uses chunked storage (max 100 holders per account)