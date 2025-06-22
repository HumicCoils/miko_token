pub const TAX_RATE: u8 = 5;              // 5% tax rate
pub const OWNER_SHARE_BASIS_POINTS: u16 = 100;   // 1% of total = 100 basis points
pub const TREASURY_SHARE_BASIS_POINTS: u16 = 400; // 4% of total = 400 basis points
pub const MAX_HOLDERS_PER_CHUNK: usize = 100;    // Account size limit

pub const TAX_CONFIG_SEED: &[u8] = b"tax_config";
pub const TAX_AUTHORITY_SEED: &[u8] = b"tax_authority";
pub const TAX_HOLDING_SEED: &[u8] = b"tax_holding";
pub const HOLDER_REGISTRY_SEED: &[u8] = b"holder_registry";