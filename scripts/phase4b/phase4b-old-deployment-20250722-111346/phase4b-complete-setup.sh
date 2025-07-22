#!/bin/bash
set -e

echo "==================================="
echo "PHASE 4-B CLEAN ISOLATED SETUP"
echo "==================================="
echo ""
echo "This script creates a COMPLETELY NEW environment for Phase 4-B testing"
echo "NO devnet references, NO old addresses, EVERYTHING FRESH!"
echo ""

# Change to script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $SCRIPT_DIR

# Step 1: Create fresh program directory
echo "Step 1: Creating fresh Phase 4-B program sources..."
mkdir -p phase4b-programs/programs
cd phase4b-programs

# Copy ONLY the programs we need (NO transfer-hook!)
cp -r /home/humiccoils/git/miko_token/programs/programs/absolute-vault programs/
cp -r /home/humiccoils/git/miko_token/programs/programs/smart-dial programs/

# Copy necessary config files
cp /home/humiccoils/git/miko_token/programs/Cargo.toml .
cp /home/humiccoils/git/miko_token/programs/Anchor.toml .

# Step 2: Generate NEW keypairs for Phase 4-B (ONLY vault and smart-dial)
echo -e "\nStep 2: Generating fresh keypairs for Phase 4-B..."
echo "Creating keypairs for the ONLY TWO programs we need!"
VAULT_KEYPAIR="vault-phase4b.json"
SMARTDIAL_KEYPAIR="smartdial-phase4b.json"

solana-keygen new --no-bip39-passphrase --silent --outfile $VAULT_KEYPAIR
solana-keygen new --no-bip39-passphrase --silent --outfile $SMARTDIAL_KEYPAIR

VAULT_ADDRESS=$(solana-keygen pubkey $VAULT_KEYPAIR)
SMARTDIAL_ADDRESS=$(solana-keygen pubkey $SMARTDIAL_KEYPAIR)

echo "Phase 4-B Vault Program: $VAULT_ADDRESS"
echo "Phase 4-B Smart Dial Program: $SMARTDIAL_ADDRESS"

# Step 3: Update source code with Phase 4-B addresses
echo -e "\nStep 3: Updating source code with Phase 4-B addresses..."
sed -i "s/declare_id!(\".*\");/declare_id!(\"$VAULT_ADDRESS\");/" programs/absolute-vault/src/lib.rs
sed -i "s/declare_id!(\".*\");/declare_id!(\"$SMARTDIAL_ADDRESS\");/" programs/smart-dial/src/lib.rs

# Step 4: Update Anchor.toml for local deployment
echo -e "\nStep 4: Configuring Anchor.toml for local fork..."
cat > Anchor.toml << EOF
[toolchain]

[features]
resolution = true
skip-lint = false

[programs.localnet]
absolute_vault = "$VAULT_ADDRESS"
smart_dial = "$SMARTDIAL_ADDRESS"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "localnet"
wallet = "../phase4b-deployer.json"

[scripts]
test = "node --max-old-space-size=8192 node_modules/@coral-xyz/anchor/dist/cjs/cli/cli.js test"
EOF

# Step 5: Build programs
echo -e "\nStep 5: Building Phase 4-B programs..."
anchor build

# Step 6: Deploy to local fork
echo -e "\nStep 6: Deploying to local fork..."
FORK_URL="http://127.0.0.1:8899"

# Create deployer keypair for Phase 4-B
cd ..
DEPLOYER_KEYPAIR="phase4b-deployer.json"
solana-keygen new --no-bip39-passphrase --silent --outfile $DEPLOYER_KEYPAIR
DEPLOYER_ADDRESS=$(solana-keygen pubkey $DEPLOYER_KEYPAIR)

echo "Phase 4-B Deployer: $DEPLOYER_ADDRESS"

# Fund deployer
echo "Funding deployer..."
solana airdrop 100 $DEPLOYER_ADDRESS --url $FORK_URL

# Deploy programs
echo "Deploying Vault..."
solana program deploy --url $FORK_URL --keypair $DEPLOYER_KEYPAIR --program-id phase4b-programs/$VAULT_KEYPAIR phase4b-programs/target/deploy/absolute_vault.so

echo "Deploying Smart Dial..."
solana program deploy --url $FORK_URL --keypair $DEPLOYER_KEYPAIR --program-id phase4b-programs/$SMARTDIAL_KEYPAIR phase4b-programs/target/deploy/smart_dial.so

# Step 7: Create MIKO token for Phase 4-B
echo -e "\nStep 7: Creating Phase 4-B MIKO token..."
ts-node << 'EOF'
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction, PublicKey } from '@solana/web3.js';
import { 
  createMint, 
  getMint, 
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
} from '@solana/spl-token';
import * as fs from 'fs';

const FORK_URL = 'http://127.0.0.1:8899';
const connection = new Connection(FORK_URL, 'confirmed');

// Load deployer
const deployerData = JSON.parse(fs.readFileSync('phase4b-deployer.json', 'utf-8'));
const deployer = Keypair.fromSecretKey(new Uint8Array(deployerData));

// Create MIKO mint
const mintKeypair = Keypair.generate();
const mintLen = getMintLen([ExtensionType.TransferFeeConfig]);
const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

const transaction = new Transaction().add(
  SystemProgram.createAccount({
    fromPubkey: deployer.publicKey,
    newAccountPubkey: mintKeypair.publicKey,
    space: mintLen,
    lamports,
    programId: TOKEN_2022_PROGRAM_ID,
  }),
  createInitializeTransferFeeConfigInstruction(
    mintKeypair.publicKey,
    deployer.publicKey,
    deployer.publicKey,
    3000, // 30% initial fee
    BigInt(10_000_000_000), // max fee
    TOKEN_2022_PROGRAM_ID
  ),
  createInitializeMintInstruction(
    mintKeypair.publicKey,
    9,
    deployer.publicKey,
    null,
    TOKEN_2022_PROGRAM_ID
  )
);

await sendAndConfirmTransaction(connection, transaction, [deployer, mintKeypair]);

// Mint total supply
const deployerAta = await getOrCreateAssociatedTokenAccount(
  connection,
  deployer,
  mintKeypair.publicKey,
  deployer.publicKey,
  false,
  'confirmed',
  undefined,
  TOKEN_2022_PROGRAM_ID
);

await mintTo(
  connection,
  deployer,
  mintKeypair.publicKey,
  deployerAta.address,
  deployer,
  1_000_000_000 * 10 ** 9,
  [],
  undefined,
  TOKEN_2022_PROGRAM_ID
);

console.log('Phase 4-B MIKO Token:', mintKeypair.publicKey.toBase58());
console.log('Total Supply: 1,000,000,000 MIKO');

// Save Phase 4-B config
const config = {
  programs: {
    vault: fs.readFileSync('phase4b-programs/vault-phase4b.json', 'utf-8').trim(),
    smartDial: fs.readFileSync('phase4b-programs/smartdial-phase4b.json', 'utf-8').trim(),
  },
  deployer: deployer.publicKey.toBase58(),
  mikoToken: mintKeypair.publicKey.toBase58(),
  deployerAta: deployerAta.address.toBase58(),
  createdAt: new Date().toISOString(),
};

fs.writeFileSync('phase4b-config.json', JSON.stringify(config, null, 2));
EOF

echo -e "\n==================================="
echo "PHASE 4-B SETUP COMPLETE!"
echo "==================================="
echo ""
echo "All components are FRESH and ISOLATED for Phase 4-B testing"
echo "Configuration saved to: phase4b-config.json"
echo ""
echo "Next steps:"
echo "1. Initialize Vault and Smart Dial programs"
echo "2. Run launch sequence tests"
echo "3. Test fee transitions and keeper bot"