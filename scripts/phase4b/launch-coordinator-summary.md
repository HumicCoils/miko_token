# Launch Coordinator - Production Ready Summary

## Key Points Fixed:

1. **Launch Time = Pool Creation Time**
   - Launch timestamp is automatically set when CLMM pool is created
   - No separate "set launch time" step needed
   - Vault's `set_launch_time` is called immediately after pool creation

2. **Oracle Price Fetch Timing**
   - SOL price is fetched RIGHT BEFORE pool creation (not during preflight)
   - Ensures the most current price for initial MIKO pricing
   - If oracle fetch fails, launch is aborted

3. **Production-Level Functionality**
   - Uses real Raydium SDK (`@raydium-io/raydium-sdk-v2`)
   - Direct Pyth oracle integration (mainnet account)
   - Actual on-chain pool creation and liquidity additions
   - Strict timing enforcement (±5s windows)

## Launch Sequence:
1. Get launch parameters
2. Run preflight checks (balance, programs)
3. Show confirmation prompt
4. **FETCH ORACLE PRICE** (immediately before pool)
5. Calculate initial MIKO price
6. Create CLMM pool (T0) - **THIS IS THE LAUNCH TIME**
7. Set launch time in Vault
8. Add bootstrap liquidity
9. Execute staged liquidity (A, B, C)
10. Monitor fee transitions

## References LAUNCH_LIQUIDITY_PARAMS.md:
- ✅ 4-stage liquidity deployment
- ✅ Exact MIKO/SOL quantities
- ✅ Price bands as specified
- ✅ Oracle price requirement
- ✅ Fee schedule (30% → 15% → 5%)