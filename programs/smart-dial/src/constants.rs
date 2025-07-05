use anchor_lang::prelude::*;

/// PDA seed for the dial state account
pub const DIAL_STATE_SEED: &[u8] = b"dial_state";

/// PDA seed for update records
pub const UPDATE_RECORD_SEED: &[u8] = b"update_record";

/// Maximum number of update records to store
pub const MAX_UPDATE_RECORDS: usize = 52; // One year of weekly updates

/// Size of the DialState account
pub const DIAL_STATE_SIZE: usize = 8 + // discriminator
    32 + // authority
    32 + // current_reward_token
    32 + // treasury_wallet
    8 + // last_update (i64)
    4 + // update_count (u32)
    1 + // is_initialized (bool)
    1 + // bump
    100; // padding for future fields

/// Size of each UpdateRecord account
pub const UPDATE_RECORD_SIZE: usize = 8 + // discriminator
    8 + // timestamp (i64)
    32 + // reward_token
    32 + // updated_by
    4 + // update_index (u32)
    1 + // bump
    50; // padding