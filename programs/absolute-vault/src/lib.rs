use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("355Ey2cQSCMmBRSnbKSQJfvCcXzzyCC3eC1nGTyeaFXt");

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
        min_holder_threshold: u64,
    ) -> Result<()> {
        instructions::update_holders::handler(ctx, chunk_id, start_index, batch_size, min_holder_threshold)
    }

    pub fn calculate_and_distribute_rewards(
        ctx: Context<DistributeRewards>,
        reward_token_amount: u64,
    ) -> Result<()> {
        instructions::distribute::handler(ctx, reward_token_amount)
    }

    pub fn initialize_exclusions(
        ctx: Context<InitializeExclusions>,
        initial_reward_exclusions: Vec<Pubkey>,
        initial_tax_exemptions: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::manage_exclusions::initialize_exclusions(ctx, initial_reward_exclusions, initial_tax_exemptions)
    }

    pub fn add_reward_exclusion(
        ctx: Context<UpdateRewardExclusions>,
        address: Pubkey,
    ) -> Result<()> {
        instructions::manage_exclusions::add_reward_exclusion(ctx, address)
    }

    pub fn remove_reward_exclusion(
        ctx: Context<UpdateRewardExclusions>,
        address: Pubkey,
    ) -> Result<()> {
        instructions::manage_exclusions::remove_reward_exclusion(ctx, address)
    }

    pub fn add_tax_exemption(
        ctx: Context<UpdateTaxExemptions>,
        address: Pubkey,
    ) -> Result<()> {
        instructions::manage_exclusions::add_tax_exemption(ctx, address)
    }

    pub fn remove_tax_exemption(
        ctx: Context<UpdateTaxExemptions>,
        address: Pubkey,
    ) -> Result<()> {
        instructions::manage_exclusions::remove_tax_exemption(ctx, address)
    }
}