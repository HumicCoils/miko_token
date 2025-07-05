# MIKO Token: Development Blocker Resolution Plan

This document provides a concrete action plan to resolve the critical dependency conflict blocking the project's automated testing phase. The objective is to unblock development and ensure the full implementation of all features as specified in `README.md` and `PLAN.md`.

---

### **Core Problem Diagnosis**

The project's primary blocker is a **Dependency Compatibility Crisis**, as detailed in `DEVELOPMENT_STATUS.md`. The `Absolute Vault` program is feature-complete, but version conflicts between Anchor, the Solana SDK, and various SPL token libraries prevent the `anchor test` command from running successfully. This is a toolchain issue, not a logic flaw in the smart contract.

---

### **Action Plan**

Instead of ambiguous suggestions, this plan provides specific, actionable steps to immediately resolve the issue.

#### **Solution 1: Fix the Automated Test Environment via Dependency Patching (Recommended)**

This is the most robust and recommended solution. It involves using Cargo's `[patch]` feature to override the problematic dependencies with compatible versions directly from Solana's official GitHub repository.

**Step 1: Modify `programs/absolute-vault/Cargo.toml`**

Open the `Cargo.toml` file located at `programs/absolute-vault/Cargo.toml`.

**Step 2: Append the Following Code**

Copy the entire TOML code block below and paste it at the **very end** of your `programs/absolute-vault/Cargo.toml` file.

```toml
# === APPEND THE FOLLOWING CODE TO THE END OF YOUR Cargo.toml FILE ===

# Explicitly define the dependencies required for running tests.
[dev-dependencies]
solana-program-test = "1.18.16"
solana-sdk = "1.18.16"

# The [patch.crates-io] section resolves the known compatibility conflicts.
# It forces Cargo to use specific versions from Solana's official Git repository
# instead of the default crates.io versions, ensuring compatibility with Anchor 0.31.1+
# and Solana 1.18.x. This directly fixes the "yanked" version errors.
[patch.crates-io]
solana-program-test = { git = "[https://github.com/solana-labs/solana.git](https://github.com/solana-labs/solana.git)", rev = "v1.18.16" }
solana-program = { git = "[https://github.com/solana-labs/solana.git](https://github.com/solana-labs/solana.git)", rev = "v1.18.16" }
solana-sdk = { git = "[https://github.com/solana-labs/solana.git](https://github.com/solana-labs/solana.git)", rev = "v1.18.16" }
solana-client = { git = "[https://github.com/solana-labs/solana.git](https://github.com/solana-labs/solana.git)", rev = "v1.18.16" }
solana-logger = { git = "[https://github.com/solana-labs/solana.git](https://github.com/solana-labs/solana.git)", rev = "v1.18.16" }
solana-remote-wallet = { git = "[https://github.com/solana-labs/solana.git](https://github.com/solana-labs/solana.git)", rev = "v1.18.16" }
solana-sdk-macro = { git = "[https://github.com/solana-labs/solana.git](https://github.com/solana-labs/solana.git)", rev = "v1.18.16" }
solana-vote-program = { git = "[https://github.com/solana-labs/solana.git](https://github.com/solana-labs/solana.git)", rev = "v1.18.16" }

# Unify the SPL token versions to match what anchor-spl uses.
spl-token = { version = "4.0.1", features = ["no-entrypoint"] }
spl-token-2022 = { version = "3.0.1", features = ["no-entrypoint"] }

**Step 3: Rerun the Test Command**

After saving the `Cargo.toml` file, navigate to your project's root directory in the terminal and execute the following commands in order:

```Bash
# 1. Clean the project to remove any old dependency caches.
cargo clean

# 2. Build the project and run the tests with the patched dependencies.
anchor test

This action will directly resolve the testing blocker outlined in `TO_DO.md` and `DEVELOPMENT_STATUS.md`, allowing the project to proceed with verifying its full functionality.

---

#### **Solution 2: Emergency Functionality Verification via Manual Testing**

If the automated testing environment cannot be immediately restored, you must proceed with manual testing to verify functionality and maintain project momentum.

Use the following checklist to test all features directly on the devnet.

**Manual Testing Checklist ✅**

| Test Case | Actions to Perform | Verification Method (Using Solana Explorer/CLI) | Relevant Files |
| :--- | :--- | :--- | :--- |
| **1. Validate Vault Initialization** | Confirm that the already-initialized Vault PDA (`2udd79GB6eGPLZ11cBeSsKiDZnq3Zdksxx91kir5CJaf`) has the correct configuration values. | - Inspect the Vault account's data (Authority, Treasury, Keeper, etc.). | `DEVELOPMENT_STATUS.md` |
| **2. Fee Harvest** | 1. Create several test wallets and transfer MIKO tokens between them to generate withheld fees. <br> 2. Execute the `harvest_fees` instruction using the designated Keeper wallet. <br> 3. Verify that the collected fees are moved to the Vault and then split correctly: 1% to the Owner wallet and 4% to the Treasury wallet. | - Track the token balance changes in all involved wallets. <br> - Confirm the `total_fees_harvested` state value increases in the Vault account. | `README.md`, `absolute-vault/src/instructions/harvest_fees.rs` |
| **3. Reward Distribution** | 1. Send the designated reward token to the Vault's reward account. <br> 2. Prepare both "eligible" holders (MIKO balance ≥ $100) and "ineligible" holders. <br> 3. Execute the `distribute_rewards` instruction using the Keeper wallet. | - Confirm that only "eligible" holders receive the reward token, distributed proportionally. <br> - Ensure the balances of "ineligible" holders remain unchanged. <br> - Confirm the `total_rewards_distributed` state value increases in the Vault account. | `README.md`, `absolute-vault/src/instructions/distribute_rewards.rs` |
| **4. Exclusion List Management** | 1. Use the Authority wallet to execute the `manage_exclusions` instruction to add/remove wallets from the `FeeOnly`, `RewardOnly`, and `Both` exclusion lists. <br> 2. Repeat steps 2 and 3 to verify that excluded wallets are correctly skipped during fee harvesting and reward distribution. | - Inspect transaction logs for `harvest_fees` and `distribute_rewards`. <br> - Check the account data of the exclusion list PDAs. | `PLAN.md`, `absolute-vault/src/instructions/manage_exclusions.rs` |
| **5. Emergency Withdrawals** | 1. Use the Authority wallet to execute the `emergency_withdraw_vault` and `emergency_withdraw_withheld` instructions. <br> 2. Confirm that funds from the Vault and withheld fees from token accounts are successfully withdrawn to the Authority wallet. | - Verify the increase in the Authority wallet's token and/or SOL balance. | `PLAN.md`, `absolute-vault/src/instructions/emergency_withdraw_vault.rs` |

**Conclusion:** It is strongly recommended to implement Solution 1 first to restore the integrity of the development environment. This will provide the necessary foundation to confidently verify the project's stability and complete all remaining objectives.
