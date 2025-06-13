# How to Use Exclusions and Exemptions

## Setup (One-time)

```bash
# 1. Install dependencies
npm install

# 2. Build the program to generate types
anchor build

# 3. Initialize exclusion accounts
npm run initialize-exclusions
```

## Managing Reward Exclusions

```bash
# Add address to exclusions (won't receive rewards)
npm run add-reward-exclusion -- --address=ADDRESS_HERE

# Remove address from exclusions
npm run remove-reward-exclusion -- --address=ADDRESS_HERE
```

## Managing Tax Exemptions

```bash
# Add address to exemptions (no 5% tax)
npm run add-tax-exemption -- --address=ADDRESS_HERE

# Remove address from exemptions
npm run remove-tax-exemption -- --address=ADDRESS_HERE
```

## Example Commands

```bash
# Exclude MIKO token mint from rewards
npm run add-reward-exclusion -- --address=YOUR_MIKO_TOKEN_MINT_ADDRESS

# Exempt treasury wallet from tax
npm run add-tax-exemption -- --address=YOUR_TREASURY_WALLET_ADDRESS

# Exempt liquidity pool from tax
npm run add-tax-exemption -- --address=YOUR_LP_ADDRESS
```

## TypeScript Example

```typescript
// Initialize exclusions
const initializeExclusions = async () => {
  const [rewardExclusionsPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("reward_exclusions")],
    ABSOLUTE_VAULT_PROGRAM_ID
  );
  
  const [taxExemptionsPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("tax_exemptions")],
    ABSOLUTE_VAULT_PROGRAM_ID
  );
  
  const tx = await program.methods
    .initializeExclusions(
      [], // initial reward exclusions (empty)
      []  // initial tax exemptions (empty)
    )
    .accounts({
      authority: wallet.publicKey,
      taxConfig: taxConfigPDA,
      rewardExclusions: rewardExclusionsPDA,
      taxExemptions: taxExemptionsPDA,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
};

// Add reward exclusion
const addRewardExclusion = async (addressToExclude: PublicKey) => {
  const [rewardExclusionsPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("reward_exclusions")],
    ABSOLUTE_VAULT_PROGRAM_ID
  );
  
  const tx = await program.methods
    .addRewardExclusion(addressToExclude)
    .accounts({
      authority: wallet.publicKey,
      rewardExclusions: rewardExclusionsPDA,
    })
    .rpc();
};

// Add tax exemption
const addTaxExemption = async (addressToExempt: PublicKey) => {
  const [taxExemptionsPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("tax_exemptions")],
    ABSOLUTE_VAULT_PROGRAM_ID
  );
  
  const tx = await program.methods
    .addTaxExemption(addressToExempt)
    .accounts({
      authority: wallet.publicKey,
      taxExemptions: taxExemptionsPDA,
    })
    .rpc();
};
```

## Common Addresses to Exclude/Exempt

1. **Reward Exclusions** (prevent from receiving rewards):
   - MIKO token mint address
   - Tax holding PDA
   - Treasury wallet
   - Program-owned accounts
   - Liquidity pool addresses

2. **Tax Exemptions** (no 5% tax on transfers):
   - Treasury wallet
   - Tax holding PDA
   - Liquidity pool addresses
   - Bridge contracts
   - Other protocol-owned addresses

## PDAs Reference

```typescript
// Tax Config PDA
const [taxConfigPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("tax_config")],
  new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt")
);

// Reward Exclusions PDA
const [rewardExclusionsPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("reward_exclusions")],
  new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt")
);

// Tax Exemptions PDA
const [taxExemptionsPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("tax_exemptions")],
  new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt")
);
```