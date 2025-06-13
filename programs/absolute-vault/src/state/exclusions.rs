use anchor_lang::prelude::*;

#[account]
pub struct RewardExclusions {
    pub authority: Pubkey,
    pub excluded_addresses: Vec<Pubkey>,
    pub bump: u8,
}

impl RewardExclusions {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        4 + (32 * 200) + // vec with up to 200 addresses
        1; // bump
        
    pub fn is_excluded(&self, address: &Pubkey) -> bool {
        self.excluded_addresses.contains(address)
    }
}

#[account]
pub struct TaxExemptions {
    pub authority: Pubkey,
    pub exempt_addresses: Vec<Pubkey>,
    pub bump: u8,
}

impl TaxExemptions {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        4 + (32 * 200) + // vec with up to 200 addresses
        1; // bump
        
    pub fn is_exempt(&self, address: &Pubkey) -> bool {
        self.exempt_addresses.contains(address)
    }
}