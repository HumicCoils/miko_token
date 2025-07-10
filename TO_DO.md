# MIKO Token Development Checklist - Docker-Based Approach

## Core Principle

Each development phase operates in an isolated Docker container with its own dependency environment. This prevents cross-phase contamination and allows independent progress even when dependency conflicts arise.

## Prerequisites

### Docker Environment Setup
- [x] Install Docker and verify it works
- [x] Set up project directory structure with docker/ subdirectory
- [x] Create separate directories for each phase under docker/
- [x] Understand volume mounting for sharing build artifacts

## Phase 1: Foundation and Token Creation

### Container Environment Goals
- [x] Create a container with Rust, Solana CLI, and Anchor Framework
- [x] Find a stable version combination that works together
- [x] Document the working combination for reproducibility

### Development Tasks
- [x] Initialize Anchor workspace inside container
- [x] Create and deploy MIKO token with 5% transfer fee
- [x] Verify fee mechanism works correctly
- [x] Revoke transfer fee authority to make it permanent
- [x] Export token mint address and configuration

### Validation Criteria
- [x] Token exists on devnet
- [x] 5% fee is collected on transfers
- [x] Fee cannot be changed (authority revoked)
- [x] All deployment information is documented

## Phase 2: Absolute Vault Program

### Container Environment Goals
- [x] Build on Phase 1 container or create new one
- [x] Ensure SPL Token-2022 integration works
- [x] Find dependency versions that allow multi-token vault compilation

### Development Tasks
- [x] Implement vault state management with multi-token support
- [ ] Create all required instructions (initialize, harvest, distribute, etc.) - BLOCKED: Token-2022 CPI functions not available in Anchor
- [ ] Ensure PDA derivation includes token mint for isolation - BLOCKED: Cannot verify until compilation succeeds
- [ ] Build and deploy the program successfully - BLOCKED by Token-2022 integration issues

### Testing Requirements
- [ ] Deploy program to devnet
- [ ] Initialize separate vaults for production and dev tokens
- [ ] Verify fee harvesting functionality
- [ ] Test reward distribution mechanism
- [ ] Validate exclusion list management
- [ ] Confirm emergency functions work

### Critical Success Factors
- [ ] Program compiles without dependency errors
- [ ] Can create multiple vault instances (one per token)
- [ ] All core features are testable with dev token

## Phase 3: Smart Dial Program

### Container Environment Goals
- [ ] Use minimal dependencies (simpler than Phase 2)
- [ ] Can reuse Phase 1 base container if compatible

### Development Tasks
- [ ] Implement dial state for reward token configuration
- [ ] Create update mechanism with time constraints
- [ ] Build treasury management functions
- [ ] Deploy and initialize on devnet

### Testing Requirements
- [ ] Verify reward token can be updated
- [ ] Confirm 24-hour minimum between updates
- [ ] Test authority controls

## Phase 4: Keeper Bot Development

### Container Environment Goals
- [ ] Node.js environment separate from Rust/Anchor
- [ ] Include all necessary npm packages
- [ ] Configure for API integrations

### Development Tasks
- [ ] Create modular architecture for bot components
- [ ] Implement Twitter monitoring for token selection
- [ ] Build fee harvesting automation
- [ ] Integrate Jupiter for token swaps
- [ ] Create distribution engine with Birdeye integration
- [ ] Set up cron-based scheduling

### Testing Requirements
- [ ] Each module works independently
- [ ] Complete flow from harvest to distribution functions
- [ ] API integrations handle errors gracefully
- [ ] Meets 5-minute cycle requirement

## Phase 5: System Integration

### Integration Environment Goals
- [ ] Combine all components using Docker Compose
- [ ] Create network for inter-container communication
- [ ] Set up shared volumes for configuration

### Integration Tasks
- [ ] Define service dependencies correctly
- [ ] Configure environment variables for each service
- [ ] Create initialization scripts for full system startup
- [ ] Implement health checks for each component

### End-to-End Testing
- [ ] Full system starts correctly
- [ ] Programs deploy and initialize
- [ ] Keeper bot connects to programs
- [ ] Complete tax cycle works (collect → swap → distribute)
- [ ] System handles various load scenarios

## Phase 6: Production Preparation

### Security Review Tasks
- [ ] Audit all program authorities and access controls
- [ ] Verify arithmetic operations are safe
- [ ] Check for reentrancy vulnerabilities
- [ ] Validate input parameters thoroughly
- [ ] Review emergency function permissions

### Documentation Requirements
- [ ] Document all deployed program IDs
- [ ] Create operational runbooks
- [ ] Write troubleshooting guides
- [ ] Prepare incident response procedures

## Phase 7: Mainnet Deployment

### Pre-deployment Checklist
- [ ] All tests pass in devnet environment
- [ ] Security concerns addressed
- [ ] Production infrastructure ready
- [ ] Monitoring and alerting configured
- [ ] Backup procedures in place

### Deployment Process
- [ ] Generate production keypairs securely
- [ ] Deploy programs with correct configurations
- [ ] Initialize systems with production parameters
- [ ] Start keeper bot with monitoring
- [ ] Verify first 24 hours of operation

## Key Principles for Docker-Based Development

1. **Isolation First**: Each phase has its own container to prevent conflicts
2. **Version Discovery**: Find working combinations through experimentation
3. **Documentation**: Record what works for each phase
4. **Incremental Progress**: Move forward even if previous phases have issues
5. **Flexibility**: Adapt container configurations as needed

## Success Metrics

- Each phase can be built and tested independently
- No single dependency conflict blocks entire project
- Development can continue in parallel across phases
- System works end-to-end despite build complexities
