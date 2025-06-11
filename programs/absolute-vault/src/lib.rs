use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod absolute_vault {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        smart_dial_program: Pubkey,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, smart_dial_program)
    }

    pub fn process_collected_taxes(
        ctx: Context<ProcessTax>,
    ) -> Result<()> {
        instructions::process_tax::handler(ctx)
    }

    pub fn update_holder_registry(
        ctx: Context<UpdateHolders>,
        chunk_id: u8,
        start_index: u32,
        batch_size: u32,
    ) -> Result<()> {
        instructions::update_holders::handler(ctx, chunk_id, start_index, batch_size)
    }

    pub fn calculate_and_distribute_rewards(
        ctx: Context<DistributeRewards>,
        reward_token_amount: u64,
    ) -> Result<()> {
        instructions::distribute::handler(ctx, reward_token_amount)
    }
}