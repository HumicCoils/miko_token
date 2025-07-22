# CRITICAL: DEPLOYER KEYPAIR INFORMATION

## DO NOT CREATE NEW DEPLOYER KEYPAIRS

**DEPLOYER ADDRESS**: `AnCL6TWEGYo3zVhrXckfFiAqdQpo158JUCWPFQJEpS95`

This deployer keypair is used across ALL phases and has authority over:
- All program deployments (Phase 1)
- Token creation and initial authorities (Phase 2)
- System initialization (Phase 3)
- All subsequent operations

## File Location
- **Shared Artifacts**: `/shared-artifacts/deployer-keypair.json`
- **Original Location**: Phase 1 container `/root/.config/solana/id.json`

## Usage
All scripts MUST use this keypair by referencing:
```typescript
const DEPLOYER_KEYPAIR_PATH = '/shared-artifacts/deployer-keypair.json';
```

## Verification
Always verify the public key before use:
```bash
solana-keygen pubkey /shared-artifacts/deployer-keypair.json
# Must output: AnCL6TWEGYo3zVhrXckfFiAqdQpo158JUCWPFQJEpS95
```

**NEVER**:
- Create a new keypair with `solana-keygen new`
- Use a different path like `/root/.config/solana/id.json`
- Generate a fresh keypair for "testing"

**ALWAYS**:
- Use the existing keypair from shared artifacts
- Verify the address matches before operations
- Document any operation using this keypair

Last verified: 2025-07-19