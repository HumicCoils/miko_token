pub const TAX_RATE: u8 = 5;              // 5% tax rate
pub const OWNER_SHARE: u8 = 1;           // 1% to owner
pub const HOLDER_SHARE: u8 = 4;          // 4% to holders
pub const MIN_HOLDER_THRESHOLD: u64 = 1_000_000; // 0.1% of 1B supply
pub const MAX_HOLDERS_PER_CHUNK: usize = 100;    // Account size limit

pub const TAX_CONFIG_SEED: &[u8] = b"tax_config";
pub const TAX_AUTHORITY_SEED: &[u8] = b"tax_authority";
pub const TAX_HOLDING_SEED: &[u8] = b"tax_holding";
pub const HOLDER_REGISTRY_SEED: &[u8] = b"holder_registry";