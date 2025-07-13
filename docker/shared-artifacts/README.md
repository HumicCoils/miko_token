# Shared Artifacts

This directory contains program IDs and configuration data shared between Docker phases.

## File Format

### programs.json
```json
{
  "absoluteVault": {
    "programId": "...",
    "deployedAt": "...",
    "network": "devnet"
  },
  "smartDial": {
    "programId": "...",
    "deployedAt": "...",
    "network": "devnet"
  },
  "transferHook": {
    "programId": "...",
    "deployedAt": "...",
    "network": "devnet"
  }
}
```

### token.json
```json
{
  "mint": "...",
  "vaultPDA": "...",
  "withdrawWithheldAuthority": "...",
  "transferFeeConfigAuthority": "...",
  "mintAuthority": null,
  "freezeAuthority": null,
  "createdAt": "..."
}
```
