const fs = require("fs");
const path = require("path");

// Configuration
const config = {
    network: "devnet",
    programs: {
        absoluteVault: "838Ra5u255By2HkV7mtzP6KFgXnjrQiQDB3Gmdpbrf2d",
        smartDial: "67sZQtNqoRs5RjncYXMaeRAGrgUK49GSaLJCvHA2SXrj",
    },
    wallets: {
        keeperBot: "CqjraVtYWqwfxZjHPemqoqNu1QYZvjBZoonJxTm7CinG",
        treasury: "ESEQvotDCxHancsHSsV4UXLPrhyFe6K16ncbJbi9Y4DQ",
        owner: "FwN6tCpJkHhuYxBKwcrGU6PDW4aRNuukQBi58ay4iYGM",
    },
    aiAgentTwitterId: "1807336107638001665", // @mikolovescrypto
    timestamp: new Date().toISOString(),
    status: "Programs deployed, awaiting initialization"
};

// Save configuration
const outputPath = path.join(__dirname, "..", "program-init-config.json");
fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));

console.log("✅ Configuration saved to:", outputPath);
console.log("\nProgram Configuration:");
console.log(JSON.stringify(config, null, 2));