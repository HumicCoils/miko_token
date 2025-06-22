# MIKO Token Deployment Guide

## Prerequisites

- Solana CLI 2.0+
- Rust 1.70+
- Anchor 0.29.0
- Node.js 18+
- Twitter API access
- Birdeye API key

## Step 1: Build Programs

```bash
# Build Absolute Vault
cd programs/absolute-vault
cargo build-sbf

# Build Smart Dial
cd ../smart-dial
cargo build-sbf
```

## Step 2: Deploy Programs

```bash
# Deploy to devnet
solana config set --url https://api.devnet.solana.com

# Deploy programs
solana program deploy target/deploy/absolute_vault.so
solana program deploy target/deploy/smart_dial.so

# Save the program IDs!
```

## Step 3: Create MIKO Token with Transfer Fees

```typescript
import { 
  Connection, 
  Keypair, 
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  getMintLen,
  ExtensionType,
} from '@solana/spl-token';

const connection = new Connection('https://api.devnet.solana.com');
const payer = Keypair.generate(); // Use your wallet
const mintKeypair = Keypair.generate();

// Get PDA addresses for fee authorities
const [feeAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from('fee_authority')],
  ABSOLUTE_VAULT_PROGRAM_ID
);

const [withdrawAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from('withdraw_authority')],
  ABSOLUTE_VAULT_PROGRAM_ID
);

// Create mint with transfer fee extension
const extensions = [ExtensionType.TransferFeeConfig];
const mintLen = getMintLen(extensions);

const transaction = new Transaction().add(
  // Create account
  SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: mintKeypair.publicKey,
    space: mintLen,
    lamports: await connection.getMinimumBalanceForRentExemption(mintLen),
    programId: TOKEN_2022_PROGRAM_ID,
  }),
  // Initialize transfer fee config
  createInitializeTransferFeeConfigInstruction(
    mintKeypair.publicKey,
    feeAuthority,
    withdrawAuthority,
    500,  // 5% = 500 basis points
    BigInt(Number.MAX_SAFE_INTEGER), // Max fee
    TOKEN_2022_PROGRAM_ID
  ),
  // Initialize mint
  createInitializeMintInstruction(
    mintKeypair.publicKey,
    9, // decimals
    payer.publicKey, // mint authority
    null, // freeze authority
    TOKEN_2022_PROGRAM_ID
  )
);

// Send transaction
await sendAndConfirmTransaction(connection, transaction, [payer, mintKeypair]);

console.log('MIKO Token created:', mintKeypair.publicKey.toBase58());
```

## Step 4: Initialize Programs

```typescript
// Initialize Smart Dial
await smartDialProgram.methods
  .initialize(
    keeperBotWallet,
    treasuryWallet,
  )
  .rpc();

// Initialize Absolute Vault
await absoluteVaultProgram.methods
  .initialize(
    smartDialProgram.programId,
    keeperBotWallet,
    ownerWallet,
  )
  .accounts({
    treasuryWallet,
    mikoTokenMint,
  })
  .rpc();
```

## Step 5: Setup Keeper Bot

1. Clone the repository
2. Configure environment:

```bash
cd keeper-bot
cp .env.example .env
# Edit .env with your values
```

3. Install dependencies:

```bash
npm install
```

4. Generate IDL files:

```bash
anchor idl init -f ../target/idl/absolute_vault.json AVau1tVPk2k8uNzxQJbCqZUWhFbmcDQ4ejZvvYPfxJZG
anchor idl init -f ../target/idl/smart_dial.json SDia1z3nQJGbcVMnEqFxGEUH5WMCWsUruKFMQkwvjLn
```

5. Run the bot:

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Step 6: Add Initial Exclusions

```typescript
// Exclude non-user wallets from rewards
await absoluteVaultProgram.methods
  .addExclusion(
    new PublicKey('EXCHANGE_WALLET_ADDRESS'),
    { rewardExclusion: {} }
  )
  .rpc();
```

## Step 7: Verify System

1. Check Smart Dial config:
```bash
solana account <SMART_DIAL_CONFIG_PDA>
```

2. Check Absolute Vault config:
```bash
solana account <ABSOLUTE_VAULT_CONFIG_PDA>
```

3. Monitor keeper bot:
```bash
curl http://localhost:3000/health
```

## Production Deployment

For mainnet deployment:

1. Use a reliable RPC provider (Helius, Triton, etc.)
2. Secure keeper bot private key (AWS KMS, HashiCorp Vault)
3. Set up monitoring and alerts
4. Use Docker for deployment
5. Implement proper error handling and retries

## Security Checklist

- [ ] Programs deployed with correct authorities
- [ ] Keeper bot wallet has minimal SOL balance
- [ ] Private keys properly secured
- [ ] Monitoring and alerts configured
- [ ] Backup and recovery plan in place