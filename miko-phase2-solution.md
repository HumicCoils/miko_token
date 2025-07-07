# MIKO Token Phase 2 Complete Solution Guide

## Executive Summary

The MIKO token project is currently blocked at Phase 2 testing due to an architectural limitation. This document provides a comprehensive solution that enables full testing of all features while maintaining complete PRD-level functionality.

---

## 1. The Core Problem

The `Absolute Vault` program is architecturally designed to support only a single token mint. This is because the Program Derived Address (PDA) for the `VaultState` is derived using a fixed seed (`"vault"`), making it impossible to:

- Test with a Dev-Token that has mint authority
- Verify core features like fee harvesting and reward distribution
- Proceed to Phase 3 without compromising quality standards

**Current State:**
- Vault initialized with production MIKO token (mint authority revoked)
- Cannot test fee harvesting, reward distribution, or emergency functions
- Development blocked

---

## 2. The Solution: Multi-Token Vault Architecture

Refactor the `Absolute Vault` program to support multiple independent vault instances by including the token mint in the PDA derivation.

### Conceptual Change

**Before (Current):**
```
PDA = find_program_address(["vault"], program_id)
Result: Only ONE vault possible for entire program
```

**After (Solution):**
```
PDA = find_program_address(["vault", token_mint.pubkey], program_id)
Result: Unique vault for EACH token mint
```

---

## 3. Implementation Guide

### Step 1: Modify Program Instructions

Update the following files in `programs/absolute-vault/src/instructions/`:

#### A. initialize.rs

**Find:**
```rust
#[account(
    init,
    payer = authority,
    space = VaultState::LEN,
    seeds = [VAULT_SEED],
    bump
)]
pub vault_state: Account<'info, VaultState>,
```

**Replace with:**
```rust
#[account(
    init,
    payer = authority,
    space = VaultState::LEN,
    seeds = [VAULT_SEED, token_mint.key().as_ref()],
    bump
)]
pub vault_state: Account<'info, VaultState>,
```

**Also update InitializeSystemExclusions:**
```rust
#[account(
    mut,
    seeds = [VAULT_SEED, vault_state.token_mint.as_ref()],
    bump = vault_state.bump
)]
pub vault_state: Account<'info, VaultState>,
```

#### B. harvest_fees.rs

**Find:**
```rust
#[account(
    mut,
    seeds = [VAULT_SEED],
    bump = vault_state.bump
)]
pub vault_state: Account<'info, VaultState>,
```

**Replace with:**
```rust
#[account(
    mut,
    seeds = [VAULT_SEED, token_mint.key().as_ref()],
    bump = vault_state.bump
)]
pub vault_state: Account<'info, VaultState>,
```

#### C. Apply Same Pattern to:
- `distribute_rewards.rs` - Use `vault_state.token_mint.as_ref()`
- `manage_exclusions.rs` - Use `vault_state.token_mint.as_ref()`
- `update_config.rs` - Use `vault_state.token_mint.as_ref()`
- `emergency_withdraw_vault.rs` - Use `vault_state.token_mint.as_ref()`
- `emergency_withdraw_withheld.rs` - Use `vault_state.token_mint.as_ref()`

### Step 2: Build and Deploy

```bash
# Build the updated program
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Note the new program ID if changed
```

### Step 3: Update Client Scripts

#### Update PDA Derivation in TypeScript

**initialize-vault-dev-token.ts:**
```typescript
// Old
const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault')],
    VAULT_PROGRAM_ID
);

// New
const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), MIKO_DEV_TOKEN_MINT.toBuffer()],
    VAULT_PROGRAM_ID
);
```

**Apply same change to all test scripts**

---

## 4. Verification Checklist

### Pre-Implementation
- [ ] Backup current program state
- [ ] Document current vault PDA for production MIKO
- [ ] Ensure you have authority wallet access

### Implementation
- [ ] All instruction files updated with new PDA seeds
- [ ] Program builds successfully
- [ ] Program deployed to devnet
- [ ] Client scripts updated with new PDA derivation

### Post-Implementation Testing

#### Test 1: Verify Separate Vaults
```typescript
// Production MIKO vault
const [prodVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), MIKO_TOKEN_MINT.toBuffer()],
    VAULT_PROGRAM_ID
);

// Dev Token vault
const [devVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), DEV_TOKEN_MINT.toBuffer()],
    VAULT_PROGRAM_ID
);

// Verify they are different
console.log('Production Vault:', prodVaultPda.toBase58());
console.log('Dev Vault:', devVaultPda.toBase58());
console.log('Are different:', !prodVaultPda.equals(devVaultPda));
```

#### Test 2: Initialize Dev Token Vault
- [ ] Run `initialize-vault-dev-token.ts`
- [ ] Verify new vault created successfully
- [ ] Check vault state has correct token mint

#### Test 3: Complete Feature Testing
- [ ] **Fee Harvesting**: Create transfers, generate fees, harvest successfully
- [ ] **Fee Splitting**: Verify 80% to treasury, 20% to owner
- [ ] **Reward Distribution**: Test with multiple holders, verify proportional distribution
- [ ] **Exclusion Management**: Add/update/remove exclusions
- [ ] **Emergency Functions**: Test vault withdrawal and withheld fee recovery

#### Test 4: Production Vault Integrity
- [ ] Verify original production vault still exists
- [ ] Confirm it remains unchanged
- [ ] Test that it still functions correctly

---

## 5. Success Criteria

### Phase 2 Completion Requirements
1. ✅ All core features tested with Dev Token
2. ✅ Production vault remains functional
3. ✅ No feature simplification or compromise
4. ✅ Complete test coverage achieved

### Evidence of Success
- Transaction signatures for all tested features
- Screenshots/logs of successful operations
- Documented test results for each function

---

## 6. Common Issues and Solutions

### Issue 1: PDA Mismatch Errors
**Symptom**: "Invalid seeds" or "Account not found"  
**Solution**: Ensure ALL instructions use the same PDA derivation pattern

### Issue 2: Build Failures
**Symptom**: Compilation errors after changes  
**Solution**: Check that `token_mint` is available in the instruction context

### Issue 3: Client Script Failures
**Symptom**: Transaction fails with program error  
**Solution**: Verify client-side PDA derivation matches on-chain logic

---

## 7. Benefits Achieved

1. **Complete Testing**: All features can be tested without restrictions
2. **Environment Isolation**: Development and production completely separate
3. **Future Scalability**: Architecture supports multiple tokens
4. **PRD Compliance**: Full functionality maintained without compromise

---

## 8. Next Steps After Implementation

1. **Complete all Phase 2 tests** with Dev Token
2. **Document test results** in DEVELOPMENT_STATUS.md
3. **Update status**: Mark Phase 2 as COMPLETED
4. **Proceed to Phase 3**: Smart Dial Program development

---

## Important Notes

- **Manual Implementation**: Apply changes manually to avoid automation errors
- **Incremental Testing**: Test each change before proceeding
- **Backup Everything**: Keep copies of original files
- **No Feature Shortcuts**: Maintain full PRD functionality

This solution unblocks development while maintaining the highest quality standards and complete feature implementation.