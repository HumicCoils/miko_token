# Phase 4B Cleanup Plan

## Essential Items to KEEP

### Core Launch Scripts
- `launch-coordinator-final.ts` - Main launch coordinator script
- `raydium-cpmm-integration.ts` - CPMM pool creation module  
- `pyth-oracle-integration.ts` - Oracle price integration
- `mainnet-fork-config.ts` - Fork configuration
- `start-mainnet-fork.sh` / `stop-mainnet-fork.sh` - Fork management

### Program Files
- `phase4b-programs/` - Current programs directory (vault and smart-dial)
- `deploy-phase4b-programs.sh` - Program deployment script
- `phase4b-vault-idl.json` - Vault IDL
- `phase4b-smart-dial-idl.json` - Smart Dial IDL
- `phase4b-vault-keypair.json` - Vault program keypair
- `phase4b-smartdial-keypair.json` - Smart Dial program keypair

### Essential Keypairs/Configs
- `phase4b-deployer.json` - Deployer keypair
- `phase4b-keeper-keypair.json` - Keeper bot keypair
- `phase4b-owner-keypair.json` - Owner wallet keypair
- `phase4b-config.json` - Configuration file
- `keeper-bot-config-phase4b.json` - Keeper bot configuration
- `keeper-bot-phase4b.ts` - Keeper bot implementation

### Token/Initialization Scripts
- `create-phase4b-token.ts` - Token creation script
- `initialize-phase4b-programs.ts` - Program initialization
- `transfer-authorities.ts` - Authority transfer
- `revoke-mint-authority.ts` - Mint authority revocation

### Package Management
- `package.json` / `package-lock.json` - Dependencies
- `node_modules/` - Installed dependencies

### Documentation
- `README.md` - Phase 4B documentation
- `DEPLOYMENT_ORGANIZATION.md` - Deployment organization

## Items to DELETE

### Old Ledger/Logs
- `test-ledger/` - Old ledger data (entire directory)
- `mainnet-fork.log` - Old fork log
- `test-validator.pid` - Old PID file
- `logs/` - Old logs directory

### Old Deployments (entire directories)
- `phase4b-old-deployment/`
- `phase4b-old-deployment-20250722-111346/`
- `phase4b-programs-old-deployment/`

### Duplicate/Old Keypairs
- `miko-token-keypair-1753209169559.json` - Duplicate token keypair
- `phase4b-treasury-keypair.json` - Treasury keypair (being removed)
- `miko-token-keypair.json` - Old token keypair
- `phase4b-mint-keypair.json` - Old mint keypair

### Debug/Check Scripts
- `check-alt-accounts.ts`
- `check-atas.ts`
- `check-deployer-balance.ts`
- `clone-alt-dynamic.ts`
- `decode-raydium-tx.ts`
- `decode-tx-for-alts.ts`
- `identify-all-raydium-alts.ts`
- `verify-alts-mainnet.sh`
- `calculate-pdas.ts`

### Old Info Files
- `authority-transfer-info.json`
- `phase4b-init-info.json`
- `phase4b-mint-authority-revocation.json`
- `token-accounts.json`
- `phase4b-setup-complete.json`
- `phase4b-wallet-recovery.json`
- `launch-coordinator-summary.md`

### Unused Scripts
- `create-miko-token.ts` - Old version
- `mint-initial-supply.ts` - Integrated into token creation
- `initialize-programs.ts` - Old version
- `transfer-all-to-deployer.ts`
- `transfer-authorities-to-vault.ts`
- `update-vault-config.ts`
- `update-smart-dial-treasury.ts` - Treasury being removed
- `update-keeper-bot-config.ts`
- `create-phase4b-wallets.ts`
- `complete-phase4b-setup.sh`
- `emergency-withdraw-undistributed.ts`

## Total Count
- **Keep**: 25 files/directories
- **Delete**: 45 files/directories