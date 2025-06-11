use anchor_lang::prelude::*;

#[account]
pub struct HolderRegistry {
    pub eligible_holders: Vec<HolderInfo>,
    pub last_snapshot_slot: u64,
    pub total_eligible_balance: u64,
    pub chunk_id: u8,
    pub next_chunk: Option<Pubkey>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct HolderInfo {
    pub address: Pubkey,
    pub balance: u64,
    pub reward_share: u64,
}

impl HolderRegistry {
    pub const BASE_LEN: usize = 8 + // discriminator
        4 + // vec length
        8 + // last_snapshot_slot
        8 + // total_eligible_balance
        1 + // chunk_id
        1 + 32; // next_chunk Option<Pubkey>
    
    pub const HOLDER_INFO_LEN: usize = 32 + 8 + 8; // address + balance + reward_share
    
    pub fn space(max_holders: usize) -> usize {
        Self::BASE_LEN + (Self::HOLDER_INFO_LEN * max_holders)
    }
}