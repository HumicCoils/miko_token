pub const TAX_CONFIG_SEED: &[u8] = b"tax_config";
pub const FEE_AUTHORITY_SEED: &[u8] = b"fee_authority";
pub const WITHDRAW_AUTHORITY_SEED: &[u8] = b"withdraw_authority";
pub const HOLDER_REGISTRY_SEED: &[u8] = b"holder_registry";
pub const EXCLUSIONS_SEED: &[u8] = b"exclusions";

pub const TAX_RATE_BASIS_POINTS: u16 = 500; // 5% = 500 basis points
pub const OWNER_SHARE_BASIS_POINTS: u16 = 100; // 1% = 20% of tax
pub const TREASURY_SHARE_BASIS_POINTS: u16 = 400; // 4% = 80% of tax

pub const MAX_HOLDERS_PER_REGISTRY: usize = 500;