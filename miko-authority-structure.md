# MIKO Token System Authority Structure

## Overview

This document defines the complete authority structure for the MIKO token system, detailing which accounts hold specific permissions and their respective capabilities. This serves as a reference for proper authority management during development and deployment.

## 1. Token-2022 Authorities

### 1.1 Token Mint Authorities

| Authority | Holder | Status | Purpose |
|-----------|--------|--------|---------|
| **Mint Authority** | `null` | Revoked after supply minted | Prevents additional token minting |
| **Freeze Authority** | `null` | Set to null at creation | Prevents token freezing |
| **Transfer Fee Config Authority** | `Vault PDA` | Active | Manages transfer fee rate (fixed at 5%) |
| **Withdraw Withheld Authority** | `Vault PDA` | Active | Withdraws accumulated fees from mint |

### 1.2 Implementation Notes
```rust
// Token creation (Phase 2)
// 1. Create mint with deployer as temporary authorities
// 2. Mint total supply (1B MIKO)
// 3. Initialize vault program (Phase 3)
// 4. Transfer authorities to Vault PDA
// 5. Revoke mint authority (LAST STEP)
```

## 2. Absolute Vault Program Authorities

### 2.1 Authority Roles

| Role | Account | Description |
|------|---------|-------------|
| **Authority (Admin)** | `Deployer` | Program administrator with configuration control |
| **Keeper Authority** | `Keeper Wallet` | Operational account for automated tasks |

### 2.2 Instruction Permissions

#### Admin-Only Instructions (requires `authority`)
```rust
- update_config()           // Update vault parameters
- emergency_withdraw_vault() // Withdraw tokens/SOL from vault
- emergency_withdraw_withheld() // Recover stuck withheld fees
- manage_exclusions()       // Add/remove from reward exclusions
```

#### Keeper-Only Instructions (requires `keeper_authority`)
```rust
- harvest_fees()            // Harvest withheld fees to mint
- withdraw_fees_from_mint() // Transfer fees from mint to vault
- distribute_rewards()      // Distribute to holders
- update_pool_registry()    // Update detected pools list
```

#### Permissionless Instructions
```rust
- set_launch_time()         // One-time only, sets launch timestamp
```

### 2.3 Critical Security Note
⚠️ **Current Issue**: In the current implementation, `deployer` is set as both `authority` AND `keeper_authority`. This should be fixed to use separate accounts:
- `authority`: Deployer/Admin wallet
- `keeper_authority`: Dedicated keeper wallet

## 3. Smart Dial Program Authorities

| Authority | Holder | Permissions |
|-----------|--------|-------------|
| **Authority** | `Deployer` | • `update_reward_token()` - Change weekly reward token<br>• `update_authority()` - Transfer authority |

### 3.1 Update Constraints
- Reward token updates allowed only after "first Monday" (Monday following launch)
- 24-hour cooldown between updates
- Initial reward token: SOL

## 4. Keeper Bot Requirements

### 4.1 Required Permissions
| Requirement | Purpose |
|-------------|---------|
| **Keeper Private Key** | Sign transactions for keeper-only vault instructions |
| **SOL Balance** | Pay transaction fees and maintain operations |
| **Token Accounts** | Hold and manage collected taxes before distribution |

### 4.2 Automated Operations
```typescript
// Keeper bot executes these operations
1. Monitor accumulated fees (threshold: 500k MIKO)
2. Harvest fees when threshold reached
3. Withdraw fees from mint to vault
4. Swap collected tax via Jupiter (accepts 5% fee)
5. Distribute: 20% to owner, 80% to holders
6. Update reward token every Monday (if changed)
```

## 5. Key Accounts and Roles

### 5.1 System Accounts

| Account | Type | Role | Special Permissions |
|---------|------|------|---------------------|
| **Deployer Wallet** | Keypair | Initial setup & admin | Program authorities |
| **Owner Wallet** | Keypair | Receives 20% of tax | None (recipient only) |
| **Keeper Wallet** | Keypair | Bot operations | Keeper instructions only |
| **Vault PDA** | PDA | System treasury | Token-2022 authorities |
| **Smart Dial PDA** | PDA | Config storage | None |

### 5.2 PDA Derivation
```typescript
// Vault PDA
const [vaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), mintPubkey.toBuffer()],
  vaultProgramId
);

// Smart Dial PDA (implementation-specific)
const [dialPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("dial")],
  smartDialProgramId
);
```

## 6. Authority Transfer Flow (Phase 3)

```mermaid
graph LR
    A[1. Create Token] --> B[2. Deployer has all authorities]
    B --> C[3. Initialize Vault Program]
    C --> D[4. Initialize Smart Dial]
    D --> E[5. Transfer Fee Config → Vault PDA]
    E --> F[6. Transfer Withdraw Withheld → Vault PDA]
    F --> G[7. Revoke Mint Authority]
    G --> H[8. System Ready]
```

### 6.1 Critical Order
1. **MUST** initialize programs before transferring authorities
2. **MUST** mint total supply before revoking mint authority
3. **MUST** verify PDAs exist before authority transfers
4. **MUST** revoke mint authority as the LAST step

## 7. Pool Detection and Exclusions

### 7.1 Exclusion Types

| Type | Implementation | Applies To |
|------|----------------|------------|
| **Fee Exclusions** | ❌ NOT POSSIBLE | Token-2022 limitation - 5% fee applies to ALL transfers |
| **Reward Exclusions** | ✅ IMPLEMENTED | Distribution logic excludes pools from receiving rewards |

### 7.2 Reward Exclusion List
```rust
// Hardcoded system accounts
- Owner wallet
- Keeper wallet  
- Vault program
- Vault PDA
- Smart Dial program

// Dynamically detected
- All liquidity pool vaults
- Pool token accounts
- AMM program accounts
```

## 8. Security Best Practices

### 8.1 DO's
- ✅ Use separate wallets for admin and keeper roles
- ✅ Verify all PDAs exist before authority transfers
- ✅ Test authority transfers on devnet first
- ✅ Keep admin keys in cold storage
- ✅ Monitor keeper wallet SOL balance

### 8.2 DON'Ts
- ❌ Don't use same wallet for authority and keeper_authority
- ❌ Don't revoke mint authority before minting supply
- ❌ Don't transfer authorities before initializing programs
- ❌ Don't store private keys in configuration files
- ❌ Don't skip verification steps

## 9. Emergency Procedures

### 9.1 Admin Emergency Powers
```rust
// If funds get stuck, admin can:
1. emergency_withdraw_vault() - Recover any tokens/SOL
2. emergency_withdraw_withheld() - Recover accumulated fees
3. update_config() - Change parameters if needed
```

### 9.2 Authority Transfer
```rust
// Both programs support authority transfer
vault.update_config(new_authority: Option<Pubkey>)
dial.update_authority(new_authority: Pubkey)
```

## 10. Deployment Checklist

Before mainnet deployment, verify:

- [ ] Deployer wallet ≠ Keeper wallet
- [ ] Vault PDA holds all token authorities
- [ ] Mint authority = null
- [ ] Freeze authority = null
- [ ] Transfer fee = 500 basis points (5%)
- [ ] Maximum fee = u64::MAX
- [ ] Pool registry initialized
- [ ] Reward exclusions include all system accounts
- [ ] Keeper wallet funded with SOL
- [ ] All authorities verified on-chain

## 11. Common Mistakes to Avoid

1. **Using deployer as keeper**: Creates single point of failure
2. **Transferring authorities too early**: Programs must be initialized first
3. **Forgetting to revoke mint**: Allows unlimited token creation
4. **Not verifying PDAs**: Authority transfers will fail
5. **Incorrect exclusion lists**: Pools might receive unfair rewards

---

*This document is critical for proper system deployment. All developers must understand and follow these authority structures to ensure system security and functionality.*