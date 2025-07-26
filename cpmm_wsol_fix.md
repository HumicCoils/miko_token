# CPMM Pool Creation – WSOL Handling Fix

## TL;DR
Raydium SDK (v2, CPMM module) does **not** auto‑create a wrapped‑SOL (WSOL) token account.  
Before calling `createPool()` you must:

1. Create — or verify the existence of — the deployer’s WSOL ATA.
2. Wrap the desired SOL amount into that ATA (`transfer + syncNative`).
3. Call `createPool()` with `ownerInfo.useSOLBalance: true`, **without** custom flags such as `mintBUseSOLBalance`.

This document walks through the exact steps, code snippets, and validation checks to unblock Phase 4‑b.

---

## Background
| Model | SOL Handling | WSOL ATA Auto‑Creation |
|-------|--------------|------------------------|
| **CLMM** | Accepts `ownerInfo.useSOLBalance` and internally inserts `createWrappedNativeAccount` | **Yes** |
| **CPMM** | Requires WSOL mint; SOL must be pre‑wrapped | **No** |

Because CPMM lacks the helper, the transaction fails with `Custom:3012` ("AccountNotInitialized") when the WSOL ATA is missing.

---

## Prerequisites
* **Raydium SDK v2** (commit ≥ `d1a7…`)
* **@solana/web3.js** ≥ 1.95
* **@solana/spl‑token** ≥ 0.4
* A mainnet‑fork or devnet RPC with sufficient SOL funded to the deployer keypair

---

## Step‑by‑Step Implementation

### 1 · Ensure/Create WSOL ATA
```ts
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";

export async function ensureWsolAta(
  connection: Connection,
  deployer: Keypair,
  amountLamports: bigint,
): Promise<PublicKey> {
  const wsolAta = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    deployer.publicKey,
  );

  const ataInfo = await connection.getAccountInfo(wsolAta);
  const tx = new Transaction();

  if (!ataInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        deployer.publicKey,
        wsolAta,
        deployer.publicKey,
        NATIVE_MINT,
      ),
    );
  }

  tx.add(
    SystemProgram.transfer({
      fromPubkey: deployer.publicKey,
      toPubkey: wsolAta,
      lamports: amountLamports, // e.g. 0.5 SOL
    }),
    createSyncNativeInstruction(wsolAta),
  );

  await sendAndConfirmTransaction(connection, tx, [deployer]);
  return wsolAta;
}
```

### 2 · Call `createPool()` (CPMM)
```ts
const { execute } = await raydium.cpmm.createPool({
  programId: CPMM_PROGRAM_ID,
  poolFeeAccount,
  mintA: tokenInfoA,            // e.g. MIKO mint
  mintB: WSOL_MINT,            // So111…12
  mintAAmount: BigInt(45_000_000 * 1e6), // 45M MIKO (6 decimals)
  mintBAmount: BigInt(0.5 * 1e9),        // 0.5 SOL wrapped
  feeConfig,
  associatedOnly: true,
  ownerInfo: { useSOLBalance: true },
  txVersion: TxVersion.V0,
});

const txid = await execute();
console.log("Pool created", txid);
```
**Important**: remove unsupported flags such as `mintBUseSOLBalance` or `checkCreateATAOwner`.

### 3 · Integrate Into Launch Coordinator
Inside `launch-coordinator-final.ts` add:
```ts
await ensureWsolAta(connection, deployer, BigInt(0.5 * 1e9));
await createCpmmpool();
```
Place the call immediately before the pool‑creation step in Phase 4‑b.

---

## Verification Checklist
| Code Tag | Assertion | How to Check |
|----------|-----------|--------------|
| `VC:4.CPMM_WSOLA` | Deployer WSOL ATA exists & rent‑exempt | `spl-token accounts --owner <DEPLOYER>` |
| `VC:4.CPMM_POOL_CREATED` | `poolId` account exists | `connection.getAccountInfo(poolId)` |
| `VC:4.BOOTSTRAP_LIQ_ADDED` | `vaultB.amount == 0.5 SOL` | `poolKeys.vaultB` info |
| `VC:4.SET_LAUNCH_TIME` | Launch timestamp set | On‑chain state variable != 0 |

Automate these in CI to guard against regressions.

---

## Troubleshooting
| Error | Likely Cause | Remedy |
|-------|-------------|--------|
| `Custom:3012` | WSOL ATA missing or not rent‑exempt | Re‑run `ensureWsolAta()` |
| `Custom:3014` | `mintB` not WSOL | Pass correct WSOL mint to `createPool()` |
| Transaction simulation passes but on‑chain fails | Wrapped lamports < desired amount | Increase `lamports` in transfer step |

---

## References
* Raydium CPMM Example – https://github.com/raydium-io/raydium-sdk/tree/master/examples/cpmm
* Raydium Issue #89 – https://github.com/raydium-io/raydium-sdk/issues/89
* SPL Token Program – `createSyncNativeInstruction` docs
* Solana Cookbook – Wrapping SOL
* Project docs: `DEVELOPMENT_STATUS.md`, `LAUNCH_LIQUIDITY_PARAMS.md`, `README.md`

> _Last updated: 2025‑07‑23_

