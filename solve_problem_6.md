# MIKO Project: Phase 2 Blocker Resolution Guide

## 1. Executive Summary

**Problem:** The MIKO project is critically blocked at Phase 2 testing. The multi-token vault architecture, implemented as per `miko-phase2-solution.md`, cannot be compiled due to a severe dependency conflict within the Solana toolchain. This is documented in `DEVELOPMENT_STATUS.md`.

**Root Cause:** This is not a program logic error. The build failure stems from an upstream incompatibility between `spl-token-2022`, its `solana-zk-token-sdk` dependency, and the version of `anchor-lang` being used. This conflict causes the `PedersenCommitment` type error noted in the development status file.

**Objective:** This guide provides a definitive, step-by-step solution to resolve the dependency conflict, enabling a successful build of the `absolute-vault` program. This will unblock all testing of PRD-level features (fee harvesting, reward distribution) as outlined in `PLAN.md` without simplifying or compromising any functionality.

---

## 2. ⚙️ Step-by-Step Resolution

Follow these steps precisely to fix the build environment and proceed with development.

### Step 1: Resolve Crate Dependencies in `Cargo.toml` (Crucial)

The core of the solution is to pin the `spl-token-2022` crate to a stable version that is compatible with your `anchor` version. This directly addresses the compilation errors.

Navigate to `programs/absolute-vault/Cargo.toml` and **replace** the `[dependencies]` section with the following:

```toml
[dependencies]
anchor-lang = { version = "0.30.1", features = ["init-if-needed"] }
anchor-spl = "0.30.1"
spl-token = { version = "4.0.0", features = ["no-entrypoint"] }
# Pin spl-token-2022 to a compatible version to resolve ZK dependency issues
spl-token-2022 = { version = "1.0.0", features = ["no-entrypoint"] }

This change is based on the contents of the original `programs/absolute-vault/Cargo.toml` file.

### Step 2: Verify Multi-Token Architecture in Program Code

Ensure the PDA seeding logic you previously implemented from `miko-phase2-solution.md` is correct across all relevant instructions. The vault's state PDA must be unique for each token mint to allow for separate production and development vaults.

**Example Check (`programs/absolute-vault/src/instructions/initialize.rs`):**

```rust
// CORRECT IMPLEMENTATION
#[account(
    init,
    payer = authority,
    space = VaultState::LEN,
    seeds = [VAULT_SEED, token_mint.key().as_ref()], // ✅ Correct: Uses token_mint as a seed
    bump
)]
pub vault_state: Account<'info, VaultState>,

This change, making the vault PDA dependent on the token mint, is the central idea of the multi-token vault architecture.

**Action**: Confirm that all instructions interacting with `vault_state` (e.g., `harvest_fees`, `distribute_rewards`, `manage_exclusions`, `update_config`, `emergency_withdraw_vault`) use this same `seeds` derivation pattern: `[VAULT_SEED, vault_state.token_mint.as_ref()]`.

### Step 3: Clean Build and Redeploy

After modifying the dependencies, you must perform a clean build to remove old artifacts. This ensures the newly specified crate versions are used.

```bash
# 1. Clean the workspace of any old build artifacts
anchor clean

# 2. Build the program with the updated dependencies
anchor build

# 3. Deploy the newly built program to Devnet
anchor deploy --provider.cluster devnet

The `test` script in `Anchor.toml` uses `yarn run ts-mocha`, but for deployment, `anchor deploy` is the correct command.

### Step 4: Update Client-Side Scripts

Your TypeScript tests and scripts must mirror the on-chain PDA logic. Update all instances of vault PDA derivation to include the token mint.

**Example Check (`scripts/initialize-vault-dev-token.ts`):**

```typescript
// The mint address for the token you are testing with
const MIKO_DEV_TOKEN_MINT = new PublicKey('PBbVBUPWMzC2LVu4Qb51qJfpp6XfGjY5nCGJhoUWYUf');

// Correct PDA derivation, as suggested in miko-phase2-solution.md
const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), MIKO_DEV_TOKEN_MINT.toBuffer()], // ✅ Correct: Uses token_mint as a seed
    VAULT_PROGRAM_ID
);

Your existing script `scripts/initialize-vault.js` uses a fixed seed `[Buffer.from('vault')]`, which must be updated as shown above to support the multi-token architecture.

---

## 3. ✅ Verification and Next Steps

With the build successful, you can now proceed with end-to-end testing of all features using a separate Dev-Token, unblocking the items in `TO_DO.md`.

1.  **Initialize a New Dev-Token Vault:**
    * Create a new MIKO Dev-Token with retained mint authority using the `create-miko-dev-token.ts` script.
    * Use your updated `initialize-vault-dev-token.ts` script to create a *new, separate* vault instance for this token. The program now supports this multi-vault model.

2.  **Test All Core Functionality:**
    * ✅ **Fee Harvesting:** Mint Dev-Tokens, transfer them to create fees, and run the `harvest_fees` instruction. Verify that fees are collected in the new vault. This is a critical feature mentioned in the project `PLAN.md`.
    * ✅ **Reward Distribution:** Fund the Dev-Token vault with rewards and run the `distribute_rewards` instruction. Verify correct proportional distribution to holders based on their balance and eligibility.
    * ✅ **Exclusion Management:** Test adding and removing wallets from the exclusion list for the new Dev-Token vault.
    * ✅ **Emergency Functions:** Test all emergency withdrawal functions on the new vault as defined in the program (`emergency_withdraw_vault`, `emergency_withdraw_withheld`).

3.  **Complete Phase 2:** Once all tests pass, Phase 2 is complete. You have achieved full PRD-level functionality and verification without compromising on features. Update `DEVELOPMENT_STATUS.md` and `TO_DO.md` to reflect this progress.

4.  **Proceed to Phase 3:** Begin development of the `Smart Dial` program with confidence that the core `Absolute Vault` is stable and fully testable.
