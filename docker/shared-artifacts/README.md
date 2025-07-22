# Shared Artifacts Directory

This directory contains shared data between Docker phases. All phases mount this directory as a volume to share critical information.

## Artifact Files

### programs.json
Contains deployed program IDs and metadata:
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

### token-info.json
Contains MIKO token creation details:
```json
{
  "mint": "...",
  "totalSupply": "1000000000",
  "temporaryAuthority": "... (deployer)",
  "freezeAuthority": null,
  "createdAt": "...",
  "verified": {
    "totalSupplyMinted": true,
    "inDeployerWallet": true,
    "transferFeeActive": true,
    "hookProgramLinked": true
  }
}
```

## Usage

Each phase reads from and writes to these files:
- Phase 1: Writes program IDs after deployment
- Phase 2: Reads program IDs, writes token info
- Phase 3: Reads both program IDs and token info
- Phase 4: Reads all artifacts for keeper bot configuration

## Important Notes

- Never manually edit these files during deployment
- Always verify file contents before proceeding to next phase
- Backup these files after successful deployment