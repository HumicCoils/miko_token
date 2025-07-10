# Phase 2: Token-2022 Fee Harvesting Integration Issue

## Problem Summary

We're building the MIKO token system on Solana with a 5% transfer fee using Token-2022. Phase 2 requires building an Absolute Vault program that can harvest these fees, but we're encountering compilation errors with Anchor 0.30.1.

## Technical Details

### Environment
- Solana CLI: 1.18.23
- Anchor: 0.30.1
- SPL Token-2022: 1.0.0
- Rust: 1.88.0

### The Issue

The Token-2022 transfer fee extension requires specific instructions to harvest withheld fees:
- `harvest_withheld_tokens_to_mint`
- `withdraw_withheld_tokens_from_accounts`

These functions exist in `spl-token-2022` but are NOT exposed through `anchor-spl::token_2022`.

### Compilation Errors

```
error[E0422]: cannot find struct, variant or union type `HarvestWithheldTokensToMint` in module `token_2022`
error[E0425]: cannot find function `harvest_withheld_tokens_to_mint` in module `token_2022`
error[E0422]: cannot find struct, variant or union type `WithdrawWithheldTokensFromAccounts` in module `token_2022`
error[E0425]: cannot find function `withdraw_withheld_tokens_from_accounts` in module `token_2022`
```

### What We've Tried

1. Using `anchor_spl::token_2022` - Functions don't exist
2. Importing `spl_token_2022::instruction` directly - Integration issues
3. Changing types to `InterfaceAccount` - Doesn't resolve the CPI issues

### Code Structure

```
programs/absolute-vault/
├── src/
│   ├── instructions/
│   │   ├── harvest_fees.rs         # NEEDS: harvest_withheld_tokens_to_mint
│   │   ├── emergency_withdraw_withheld.rs  # NEEDS: withdraw_withheld_tokens_from_accounts
│   │   └── ... (other instructions)
│   ├── state/
│   ├── constants.rs
│   ├── errors.rs
│   └── lib.rs
└── Cargo.toml
```

## Question

How can we properly integrate Token-2022 fee harvesting functions with Anchor 0.30.1? 

Options we're considering:
1. Is there a way to call these functions through Anchor?
2. Should we use raw Solana CPI without Anchor wrappers?
3. Do we need a different version of Anchor with better Token-2022 support?

The fee harvesting is critical for our token's tax mechanism - without it, the 5% fees accumulate but cannot be collected.

## To Run

```bash
cd programs/absolute-vault
cargo check
```

You'll see the compilation errors related to the missing Token-2022 functions.