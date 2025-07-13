# MIKO Token Development Status

**Date**: July 13, 2025  
**Phase**: Phase 1 - Core Programs Development  
**Status**: BLOCKED

## Summary

Development is currently blocked at the Docker environment setup stage for Phase 1 due to incompatible dependency versions between Rust, Solana CLI, and Anchor framework.

## Current Progress

### Completed
- ✅ Docker and Docker Compose installed and verified
- ✅ Project directory structure created according to specifications
- ✅ Docker volume mounting configuration for shared artifacts established
- ✅ docker-compose.yml configured with all phases
- ✅ Solana CLI 1.18.23 successfully installed in Docker using direct GitHub release download

### Blocked
- ❌ Anchor CLI 0.30.1 installation failing due to Rust version compatibility issues

## Technical Issues Encountered

### 1. Circular Dependency Conflict

We encountered a circular dependency problem between Rust versions and framework requirements:

1. **Rust 1.75 Issue**: Initial attempt with Rust 1.75 failed because the AVM (Anchor Version Manager) uses `LazyLock`, which was only stabilized in Rust 1.80+. Error: `use of unstable library feature 'lazy_cell'`

2. **Rust 1.81 Issue**: After upgrading to Rust 1.81, Anchor 0.30.1 installation fails due to the `time` crate compatibility issue introduced in Rust 1.80. Error: `type annotations needed for Box<_>` in time-0.3.29

3. **Cannot Downgrade**: Going back to Rust 1.79 or lower would recreate the original LazyLock issue

### 2. Root Cause Analysis

The issue stems from:
- Anchor 0.30.1 has locked dependencies that include `time` crate v0.3.29
- Rust 1.80 introduced a breaking change in type inference that affects `time` crate versions < 0.3.35
- The `--locked` flag in cargo install prevents updating the `time` crate to a compatible version
- Pre-built binaries for Anchor 0.30.1 are not available (this feature was introduced in v0.31.0+)

### 3. Attempted Solutions

1. **Direct Solana Installation**: ✅ Successfully resolved by downloading binaries directly from GitHub releases
2. **Cargo Install with Different Rust Versions**: ❌ Failed due to circular dependency
3. **Search for Pre-built Anchor Binaries**: ❌ Not available for version 0.30.1
4. **Alternative Installation Methods**: ❌ All require cargo compilation which hits the same issue

## Potential Solutions (Not Yet Attempted)

1. **Use Official Anchor Docker Image**: 
   - Pull `solanafoundation/anchor:0.30.1` if it exists
   - This would bypass the compilation issue entirely

2. **Upgrade to Anchor 0.31.0+**:
   - Newer versions have better Rust 1.80+ compatibility
   - However, this deviates from the specified requirement of Anchor 0.30.1

3. **Patch Anchor 0.30.1 Dependencies**:
   - Fork Anchor 0.30.1 and update the `time` crate dependency
   - Build from the forked version
   - This is complex and may introduce other compatibility issues

4. **Build Without --locked Flag**:
   - Remove `--locked` to allow cargo to update dependencies
   - Risk: May pull in incompatible versions of other dependencies

## Recommendation

The most pragmatic solution would be to use the official Anchor Docker image if available, or upgrade to a newer version of Anchor that has resolved these compatibility issues. The current combination of Anchor 0.30.1 with modern Rust versions appears to have fundamental compatibility problems that cannot be resolved without modifying the dependencies.

## Next Steps

1. Investigate if `solanafoundation/anchor:0.30.1` Docker image exists and is usable
2. If not available, consider upgrading to Anchor 0.31.0 or newer
3. Alternatively, consider using a complete development environment Docker image that has all tools pre-installed with compatible versions

## Environment Details

- Host OS: Linux 6.15.6-arch1-1
- Docker: 28.3.0
- Docker Compose: 2.38.2
- Target Rust: 1.81 (attempted multiple versions)
- Target Solana CLI: 1.18.23 (successfully installed)
- Target Anchor: 0.30.1 (failed to install)