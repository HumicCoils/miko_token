const crypto = require('crypto');

function calculateDiscriminator(instructionName) {
  const preimage = `global:${instructionName}`;
  const hash = crypto.createHash('sha256').update(preimage).digest();
  return hash.slice(0, 8);
}

// Calculate discriminators for our instructions
const instructions = [
  'initialize',
  'harvest_fees',
  'distribute_rewards',
  'manage_exclusions',
  'update_config',
  'emergency_withdraw_vault',
  'emergency_withdraw_withheld'
];

console.log('Anchor Instruction Discriminators:\n');

instructions.forEach(instruction => {
  const discriminator = calculateDiscriminator(instruction);
  console.log(`${instruction}:`);
  console.log(`  Hex: ${discriminator.toString('hex')}`);
  console.log(`  Array: [${Array.from(discriminator).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
  console.log();
});