# MIKO Token Deployment Guide

This guide covers the complete deployment process for the MIKO token system with the new transfer wrapper architecture.

## Prerequisites

- Solana CLI 2.0+
- Rust 1.70+
- Anchor Framework 0.29.0
- Node.js 18+
- Access to Twitter API
- Birdeye API key

## Step 1: Generate Program Keypairs

```bash
# Generate keypairs for each program
solana-keygen new -o absolute-vault-keypair.json
solana-keygen new -o smart-dial-keypair.json
solana-keygen new -o miko-transfer-keypair.json

# Save the public keys
solana-keygen pubkey absolute-vault-keypair.json
solana-keygen pubkey smart-dial-keypair.json
solana-keygen pubkey miko-transfer-keypair.json
```

## Step 2: Update Program IDs

Update the `declare_id!` in each program's lib.rs with the generated public keys:

```rust
// programs/absolute-vault/src/lib.rs
declare_id!("YOUR_ABSOLUTE_VAULT_PUBKEY");

// programs/smart-dial/src/lib.rs
declare_id!("YOUR_SMART_DIAL_PUBKEY");

// programs/miko-transfer/src/lib.rs
declare_id!("YOUR_MIKO_TRANSFER_PUBKEY");
```

## Step 3: Build Programs

```bash
# Build all programs
cd programs/absolute-vault && cargo build-sbf
cd ../smart-dial && cargo build-sbf
cd ../miko-transfer && cargo build-sbf
```

## Step 4: Deploy Programs

### Devnet Deployment

```bash
# Set to devnet
solana config set --url https://api.devnet.solana.com

# Deploy programs
solana program deploy --program-id absolute-vault-keypair.json target/deploy/absolute_vault.so
solana program deploy --program-id smart-dial-keypair.json target/deploy/smart_dial.so
solana program deploy --program-id miko-transfer-keypair.json target/deploy/miko_transfer.so
```

### Mainnet Deployment

```bash
# Set to mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Deploy with priority fee
solana program deploy --program-id absolute-vault-keypair.json target/deploy/absolute_vault.so --with-compute-unit-price 1000
solana program deploy --program-id smart-dial-keypair.json target/deploy/smart_dial.so --with-compute-unit-price 1000
solana program deploy --program-id miko-transfer-keypair.json target/deploy/miko_transfer.so --with-compute-unit-price 1000
```

## Step 5: Initialize Programs

### 5.1 Create Initialization Script

```typescript
// scripts/initialize-programs.ts
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@project-serum/anchor';
import * as fs from 'fs';

const connection = new Connection(process.env.RPC_URL!);
const wallet = new Wallet(
  Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(process.env.WALLET_PATH!, 'utf-8')))
  )
);

const provider = new AnchorProvider(connection, wallet, {
  commitment: 'confirmed',
});

async function initializePrograms() {
  // Load IDLs
  const absoluteVaultIdl = JSON.parse(fs.readFileSync('./target/idl/absolute_vault.json', 'utf-8'));
  const smartDialIdl = JSON.parse(fs.readFileSync('./target/idl/smart_dial.json', 'utf-8'));
  const mikoTransferIdl = JSON.parse(fs.readFileSync('./target/idl/miko_transfer.json', 'utf-8'));

  // Create program instances
  const absoluteVault = new Program(absoluteVaultIdl, provider);
  const smartDial = new Program(smartDialIdl, provider);
  const mikoTransfer = new Program(mikoTransferIdl, provider);

  // Initialize Smart Dial
  console.log('Initializing Smart Dial...');
  await smartDial.methods
    .initialize(
      wallet.publicKey,           // keeper_bot_wallet
      process.env.TREASURY_WALLET!, // treasury_wallet
    )
    .rpc();

  // Initialize Absolute Vault
  console.log('Initializing Absolute Vault...');
  await absoluteVault.methods
    .initialize(
      smartDial.programId,
      wallet.publicKey,           // keeper_bot_wallet
      process.env.OWNER_WALLET!,  // owner_wallet
    )
    .rpc();

  // Initialize MIKO Transfer
  console.log('Initializing MIKO Transfer...');
  const [taxHoldingPda] = await PublicKey.findProgramAddress(
    [Buffer.from('tax_holding')],
    absoluteVault.programId
  );

  await mikoTransfer.methods
    .initialize(
      process.env.MIKO_TOKEN_MINT!,
      absoluteVault.programId,
    )
    .accounts({
      taxHoldingAccount: taxHoldingPda,
    })
    .rpc();

  console.log('All programs initialized successfully!');
}
```

### 5.2 Run Initialization

```bash
# Set environment variables
export RPC_URL=https://api.devnet.solana.com
export WALLET_PATH=./deployer-wallet.json
export TREASURY_WALLET=<YOUR_TREASURY_PUBKEY>
export OWNER_WALLET=<YOUR_OWNER_PUBKEY>
export MIKO_TOKEN_MINT=<YOUR_MIKO_MINT_PUBKEY>

# Run initialization
ts-node scripts/initialize-programs.ts
```

## Step 6: Create MIKO Token

```typescript
// scripts/create-miko-token.ts
import { 
  Connection, 
  Keypair, 
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  mintTo,
  ExtensionType,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';

async function createMikoToken() {
  const connection = new Connection(process.env.RPC_URL!);
  const payer = Keypair.fromSecretKey(/* your keypair */);
  const mintKeypair = Keypair.generate();
  
  const TOTAL_SUPPLY = 1_000_000_000;
  const DECIMALS = 9;
  
  // Create mint account
  const mintLen = getMintLen([ExtensionType.TransferFeeConfig]);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
  
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      DECIMALS,
      payer.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );
  
  await connection.sendTransaction(transaction, [payer, mintKeypair]);
  
  console.log(`MIKO Token created: ${mintKeypair.publicKey.toBase58()}`);
  
  // Note: Transfer fees are no longer used in new architecture
  // Tax is collected by the transfer wrapper instead
}
```

## Step 7: Deploy Keeper Bot

### 7.1 Configure Environment

```bash
# Create .env file
cat > keeper-bot/.env << EOF
# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_WS_URL=wss://api.devnet.solana.com

# Program IDs (from deployment)
ABSOLUTE_VAULT_PROGRAM=<YOUR_ABSOLUTE_VAULT_PROGRAM>
SMART_DIAL_PROGRAM=<YOUR_SMART_DIAL_PROGRAM>
MIKO_TRANSFER_PROGRAM=<YOUR_MIKO_TRANSFER_PROGRAM>

# Token Configuration
MIKO_TOKEN_MINT=<YOUR_MIKO_TOKEN_MINT>
TREASURY_WALLET=<YOUR_TREASURY_WALLET>

# Keeper Bot
KEEPER_BOT_PRIVATE_KEY=<BASE64_ENCODED_PRIVATE_KEY>
TAX_COLLECTION_THRESHOLD=10000000000  # 10,000 MIKO in lamports
HOLDER_VALUE_THRESHOLD=100  # $100 USD

# External APIs
TWITTER_BEARER_TOKEN=<YOUR_TWITTER_TOKEN>
BIRDEYE_API_KEY=<YOUR_BIRDEYE_KEY>

# Monitoring
HEALTH_CHECK_PORT=3000
METRICS_PORT=3001
LOG_LEVEL=info
EOF
```

### 7.2 Build and Deploy

```bash
cd keeper-bot

# Install dependencies
npm install

# Build
npm run build

# Test locally
npm run dev

# Deploy with Docker
docker build -t miko-keeper-bot .
docker run -d --name miko-keeper-bot --env-file .env -p 3000:3000 -p 3001:3001 miko-keeper-bot
```

### 7.3 Deploy to Cloud (AWS Example)

```bash
# Build and push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REGISTRY
docker tag miko-keeper-bot:latest $ECR_REGISTRY/miko-keeper-bot:latest
docker push $ECR_REGISTRY/miko-keeper-bot:latest

# Deploy with ECS or Kubernetes
# See cloud-specific deployment guides
```

## Step 8: Security Hardening

### 8.1 Burn Upgrade Authority (MAINNET ONLY)

```bash
# CRITICAL: Only do this after thorough testing!
solana program set-upgrade-authority <ABSOLUTE_VAULT_PROGRAM> --new-upgrade-authority 11111111111111111111111111111111
solana program set-upgrade-authority <SMART_DIAL_PROGRAM> --new-upgrade-authority 11111111111111111111111111111111
solana program set-upgrade-authority <MIKO_TRANSFER_PROGRAM> --new-upgrade-authority 11111111111111111111111111111111
```

### 8.2 Secure Keeper Bot Keys

For production, use a key management service:

**AWS KMS Example:**
```typescript
import { KMSClient, SignCommand } from "@aws-sdk/client-kms";

const kmsClient = new KMSClient({ region: "us-east-1" });

async function signTransaction(transaction: Transaction) {
  const command = new SignCommand({
    KeyId: process.env.KMS_KEY_ID,
    Message: transaction.serialize(),
    MessageType: "RAW",
    SigningAlgorithm: "ECDSA_SHA_256",
  });
  
  const response = await kmsClient.send(command);
  // Process signature...
}
```

## Step 9: Monitoring Setup

### 9.1 Configure Prometheus

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'miko-keeper-bot'
    static_configs:
      - targets: ['localhost:3001']
```

### 9.2 Configure Alerts

```yaml
# alerts.yml
groups:
  - name: miko_alerts
    rules:
      - alert: TaxCollectionFailed
        expr: miko_tax_collection_failures > 0
        for: 5m
        annotations:
          summary: "Tax collection has been failing"
          
      - alert: LowSOLBalance
        expr: miko_keeper_sol_balance < 0.05
        annotations:
          summary: "Keeper bot SOL balance is low"
```

## Step 10: Testing Checklist

Before mainnet deployment:

- [ ] All unit tests pass
- [ ] Integration tests on devnet complete
- [ ] Tax collection working correctly
- [ ] Reward distribution tested with multiple holders
- [ ] Holder eligibility updates correctly
- [ ] AI tweet parsing working
- [ ] Jupiter swap integration tested
- [ ] Error handling and retries working
- [ ] Monitoring and alerts configured
- [ ] Security audit completed

## Troubleshooting

### Common Issues

1. **Program deployment fails**
   - Increase priority fee
   - Use dedicated RPC node
   - Split large programs

2. **Initialization fails**
   - Check wallet has enough SOL
   - Verify all program IDs correct
   - Check IDL files are up to date

3. **Keeper bot connection issues**
   - Verify RPC endpoint is accessible
   - Check firewall rules
   - Ensure proper authentication

### Support

For issues, please open a GitHub issue with:
- Error messages
- Transaction signatures
- Relevant logs