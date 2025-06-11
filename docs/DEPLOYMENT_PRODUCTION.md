# MIKO Token - Production Deployment Guide

⚠️ **CRITICAL**: This guide is for MAINNET deployment. Follow each step carefully and double-check all transactions.

## Prerequisites

- Secure production environment
- Hardware wallet (Ledger recommended) for key operations
- Mainnet SOL for deployment and operations
- Production API keys (Birdeye, Twitter)
- Key management solution (AWS KMS, HashiCorp Vault)

## 1. Production Security Setup

### Key Management

#### Option 1: Hardware Wallet (Recommended)
```bash
# Use Ledger for deployer account
solana config set --keypair usb://ledger

# Verify connection
solana address
```

#### Option 2: Secure Key Storage
```bash
# Generate keys in secure environment
solana-keygen new -o /secure/path/deployer-mainnet.json
solana-keygen new -o /secure/path/keeper-bot-mainnet.json

# Set strict permissions
chmod 400 /secure/path/*.json
```

### Create Multisig Wallets (Recommended)
```bash
# Install Squads CLI
npm install -g @sqds/cli

# Create multisig for treasury
squads create-multisig \
  --name "MIKO Treasury" \
  --members <MEMBER1_PUBKEY>,<MEMBER2_PUBKEY>,<MEMBER3_PUBKEY> \
  --threshold 2
```

## 2. Pre-Deployment Checklist

- [ ] All code audited by reputable firm
- [ ] Test deployment successful on devnet
- [ ] Production wallets secured
- [ ] API keys obtained and tested
- [ ] Monitoring infrastructure ready
- [ ] Incident response plan documented
- [ ] Legal compliance verified

## 3. Deploy Smart Contracts to Mainnet

### Final Code Review
```bash
# Verify program IDs are placeholder values
grep -r "11111111111111111111111111111111" programs/

# Run security checks
cargo audit
anchor verify
```

### Build Production Programs
```bash
# Clean build
anchor clean

# Use the build script to handle toolchain compatibility
./scripts/build.sh

# Or if you have anchor 0.29.0 with proper toolchain:
# anchor build --verifiable

# Verify build
ls -la target/deploy/*.so
```

### Deploy Programs
```bash
# Set mainnet cluster
solana config set --url https://api.mainnet-beta.solana.com

# Deploy with hardware wallet
./scripts/deploy-programs.sh mainnet-beta

# Record program IDs immediately
echo "ABSOLUTE_VAULT_ID: <PROGRAM_ID>" >> mainnet-deployment.log
echo "SMART_DIAL_ID: <PROGRAM_ID>" >> mainnet-deployment.log
```

### Initialize Programs
```bash
# Use production wallet addresses
export KEEPER_BOT_PUBKEY=<PRODUCTION_KEEPER_BOT_PUBKEY>
export TREASURY_WALLET=<MULTISIG_TREASURY_ADDRESS>
export OWNER_WALLET=<MULTISIG_OWNER_ADDRESS>

# Initialize with hardware wallet
ts-node scripts/initialize-programs.ts
```

### 🚨 CRITICAL: Burn Upgrade Authority
```bash
# This is IRREVERSIBLE - verify program IDs first!
echo "About to burn upgrade authority for:"
echo "Absolute Vault: $ABSOLUTE_VAULT_ID"
echo "Smart Dial: $SMART_DIAL_ID"
echo "Type 'CONFIRM' to proceed:"
read confirmation

if [ "$confirmation" = "CONFIRM" ]; then
  solana program set-upgrade-authority $ABSOLUTE_VAULT_ID \
    --new-upgrade-authority 11111111111111111111111111111111 \
    --keypair <DEPLOYER_KEYPAIR>
    
  solana program set-upgrade-authority $SMART_DIAL_ID \
    --new-upgrade-authority 11111111111111111111111111111111 \
    --keypair <DEPLOYER_KEYPAIR>
fi
```

## 4. Create Production MIKO Token

### Production Token Configuration
```bash
# Create production environment file
cat > scripts/.env.production <<EOF
RPC_URL=https://api.mainnet-beta.solana.com
PAYER_KEYPAIR_PATH=/secure/path/deployer-mainnet.json
ABSOLUTE_VAULT_PROGRAM_ID=$ABSOLUTE_VAULT_ID
TREASURY_WALLET=$TREASURY_WALLET
EOF
```

### Create Token with Hardware Wallet
```bash
cd scripts

# Modify create-token.ts to use hardware wallet
# Then run:
NODE_ENV=production ts-node create-token.ts

# Record token mint
echo "MIKO_TOKEN_MINT: <TOKEN_MINT>" >> ../mainnet-deployment.log
```

### Verify Token Configuration
```bash
# Check token details
spl-token display $MIKO_TOKEN_MINT

# Verify transfer fee is 5%
spl-token display $MIKO_TOKEN_MINT --verbose | grep "Transfer Fee"
```

## 5. Production Keeper Bot Deployment

### Secure Configuration

#### Using AWS Secrets Manager
```bash
# Store sensitive data in AWS
aws secretsmanager create-secret \
  --name miko-keeper-bot-secrets \
  --secret-string '{
    "KEEPER_BOT_KEY": "base64_encoded_key",
    "BIRDEYE_API_KEY": "production_key",
    "TWITTER_BEARER_TOKEN": "production_token"
  }'
```

#### Environment Configuration
```bash
cd keeper-bot

# Create production environment file
cat > .env.production <<EOF
# Non-sensitive configuration
RPC_URL=https://your-dedicated-rpc.com
NODE_ENV=production
LOG_LEVEL=info

# Program IDs
ABSOLUTE_VAULT_PROGRAM_ID=$ABSOLUTE_VAULT_ID
SMART_DIAL_PROGRAM_ID=$SMART_DIAL_ID
MIKO_TOKEN_MINT=$MIKO_TOKEN_MINT

# Production intervals (in ms)
REWARD_CHECK_INTERVAL_MS=1800000     # 30 minutes
REWARD_DISTRIBUTION_INTERVAL_MS=300000 # 5 minutes
HOLDER_UPDATE_INTERVAL_MS=3600000     # 1 hour

# Monitoring
HEALTH_CHECK_PORT=3000
METRICS_PORT=9090

# Notifications
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
TELEGRAM_BOT_TOKEN=bot_token
TELEGRAM_CHAT_ID=chat_id
EOF
```

### Deploy with Kubernetes (Recommended)

```yaml
# kubernetes/keeper-bot-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: miko-keeper-bot
spec:
  replicas: 1  # Single instance to prevent conflicts
  selector:
    matchLabels:
      app: miko-keeper-bot
  template:
    metadata:
      labels:
        app: miko-keeper-bot
    spec:
      containers:
      - name: keeper-bot
        image: your-registry/miko-keeper-bot:latest
        env:
        - name: NODE_ENV
          value: "production"
        envFrom:
        - secretRef:
            name: miko-keeper-secrets
        - configMapRef:
            name: miko-keeper-config
        ports:
        - containerPort: 3000
        - containerPort: 9090
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 60
          periodSeconds: 5
```

### Deploy with Docker (Alternative)

```bash
# Build production image
docker build -t miko-keeper-bot:production .

# Tag and push to registry
docker tag miko-keeper-bot:production your-registry/miko-keeper-bot:latest
docker push your-registry/miko-keeper-bot:latest

# Run on production server
docker run -d \
  --name miko-keeper-bot \
  --restart unless-stopped \
  --env-file .env.production \
  --env-file /secure/secrets.env \
  -p 3000:3000 \
  -p 9090:9090 \
  --log-driver json-file \
  --log-opt max-size=100m \
  --log-opt max-file=10 \
  your-registry/miko-keeper-bot:latest
```

## 6. Production Monitoring Setup

### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'miko-keeper-bot'
    static_configs:
      - targets: ['keeper-bot:9090']

  - job_name: 'solana-rpc'
    static_configs:
      - targets: ['your-rpc-metrics:8899']

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

### Critical Alerts
```yaml
# alerts.yml
groups:
  - name: miko_alerts
    rules:
      - alert: KeeperBotDown
        expr: up{job="miko-keeper-bot"} == 0
        for: 5m
        annotations:
          summary: "Keeper bot is down"
          
      - alert: LowSOLBalance
        expr: keeper_bot_sol_balance < 0.5
        for: 10m
        annotations:
          summary: "Low SOL balance: {{ $value }}"
          
      - alert: RewardDistributionFailed
        expr: rate(keeper_bot_errors_total[5m]) > 0.1
        for: 10m
        annotations:
          summary: "High error rate in reward distribution"
```

### Setup Monitoring Dashboard
```bash
# Import Grafana dashboards
curl -X POST http://grafana:3000/api/dashboards/import \
  -H "Content-Type: application/json" \
  -d @monitoring/dashboards/keeper-bot.json
```

## 7. Production Operations

### Daily Checks
```bash
# Check system health
curl https://keeper-bot.miko.finance/health

# Check metrics
curl https://keeper-bot.miko.finance/metrics

# Verify program accounts
solana account $ABSOLUTE_VAULT_ID
solana account $SMART_DIAL_ID
```

### Weekly Maintenance
- Review logs for anomalies
- Check API usage and limits
- Verify holder registry accuracy
- Monitor gas costs
- Update dependencies (security patches only)

### Incident Response

#### Keeper Bot Failure
1. Check health endpoint
2. Review logs: `kubectl logs -f deployment/miko-keeper-bot`
3. Restart if needed: `kubectl rollout restart deployment/miko-keeper-bot`
4. Manual intervention if required

#### RPC Issues
1. Switch to backup RPC
2. Update configuration
3. Restart keeper bot

## 8. Security Best Practices

### Access Control
- Use hardware wallets for all admin operations
- Implement IP whitelisting for API access
- Enable 2FA on all service accounts
- Regular security audits

### Key Rotation
```bash
# Quarterly key rotation procedure
1. Generate new keeper bot key
2. Update Smart Dial program with new key
3. Deploy updated keeper bot
4. Verify operation
5. Revoke old key
```

### Backup Procedures
- Daily encrypted backups of state
- Offsite backup storage
- Regular restoration tests
- Document recovery procedures

## 9. Compliance and Legal

- [ ] Terms of Service published
- [ ] Privacy Policy published
- [ ] Tax documentation prepared
- [ ] Regulatory compliance verified
- [ ] Insurance coverage obtained

## 10. Launch Checklist

### Pre-Launch (T-24 hours)
- [ ] All systems tested
- [ ] Monitoring alerts configured
- [ ] Support team briefed
- [ ] Communication channels ready
- [ ] Rollback plan documented

### Launch (T-0)
- [ ] Deploy contracts
- [ ] Initialize programs
- [ ] Burn upgrade authority
- [ ] Create token
- [ ] Start keeper bot
- [ ] Verify all systems operational

### Post-Launch (T+24 hours)
- [ ] Monitor all metrics
- [ ] Address any issues
- [ ] Gather feedback
- [ ] Plan improvements

## Emergency Contacts

- Technical Lead: [CONTACT]
- Security Team: [CONTACT]
- Legal Counsel: [CONTACT]
- PR Team: [CONTACT]

## Rollback Procedure

In case of critical issues:
1. Stop keeper bot immediately
2. Assess the situation
3. If contracts are affected, deploy patched versions (if authority not burned)
4. Communicate with community
5. Implement fixes
6. Resume operations

⚠️ **Remember**: Once upgrade authority is burned, smart contracts cannot be modified. Ensure thorough testing before this step.