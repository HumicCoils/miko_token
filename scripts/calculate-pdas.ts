import { PublicKey } from "@solana/web3.js";

const ABSOLUTE_VAULT_PROGRAM = new PublicKey("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt");
const SMART_DIAL_PROGRAM = new PublicKey("KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA");

console.log("=== ABSOLUTE VAULT PDAs ===");

const [taxConfigPDA, taxConfigBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("tax_config")],
  ABSOLUTE_VAULT_PROGRAM
);
console.log("Tax Config PDA:", taxConfigPDA.toBase58());
console.log("Tax Config Bump:", taxConfigBump);

const [taxAuthorityPDA, taxAuthorityBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("tax_authority")],
  ABSOLUTE_VAULT_PROGRAM
);
console.log("\nTax Authority PDA:", taxAuthorityPDA.toBase58());
console.log("Tax Authority Bump:", taxAuthorityBump);

const [taxHoldingPDA, taxHoldingBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("tax_holding")],
  ABSOLUTE_VAULT_PROGRAM
);
console.log("\nTax Holding PDA:", taxHoldingPDA.toBase58());
console.log("Tax Holding Bump:", taxHoldingBump);

const [holderRegistryPDA, holderRegistryBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("holder_registry"), Buffer.from([0])],
  ABSOLUTE_VAULT_PROGRAM
);
console.log("\nHolder Registry PDA (chunk 0):", holderRegistryPDA.toBase58());
console.log("Holder Registry Bump:", holderRegistryBump);

const [rewardExclusionsPDA, rewardExclusionsBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("reward_exclusions")],
  ABSOLUTE_VAULT_PROGRAM
);
console.log("\nReward Exclusions PDA:", rewardExclusionsPDA.toBase58());
console.log("Reward Exclusions Bump:", rewardExclusionsBump);

const [taxExemptionsPDA, taxExemptionsBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("tax_exemptions")],
  ABSOLUTE_VAULT_PROGRAM
);
console.log("\nTax Exemptions PDA:", taxExemptionsPDA.toBase58());
console.log("Tax Exemptions Bump:", taxExemptionsBump);

console.log("\n=== SMART DIAL PDAs ===");

const [configPDA, configBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("config")],
  SMART_DIAL_PROGRAM
);
console.log("Config PDA:", configPDA.toBase58());
console.log("Config Bump:", configBump);