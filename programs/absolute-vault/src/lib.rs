use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("AVau1tVPk2k8uNzxQJbCqZUWhFbmcDQ4ejZvvYPfxJZG");

#[program]
pub mod absolute_vault {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        smart_dial_program: Pubkey,
        keeper_bot_wallet: Pubkey,
        owner_wallet: Pubkey,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, smart_dial_program, keeper_bot_wallet, owner_wallet)
    }

    pub fn harvest_and_collect_fees(
        ctx: Context<HarvestAndCollectFees>,
        source_accounts: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::harvest_fees::handler(ctx, source_accounts)
    }

    pub fn update_holder_registry(
        ctx: Context<UpdateHolderRegistry>,
        holders: Vec<Pubkey>,
        balances: Vec<u64>,
    ) -> Result<()> {
        instructions::update_holders::handler(ctx, holders, balances)
    }

    pub fn distribute_rewards(
        ctx: Context<DistributeRewards>,
        reward_token_mint: Pubkey,
    ) -> Result<()> {
        instructions::distribute_rewards::handler(ctx, reward_token_mint)
    }

    pub fn add_exclusion(
        ctx: Context<ManageExclusions>,
        wallet: Pubkey,
        exclusion_type: ExclusionType,
    ) -> Result<()> {
        instructions::manage_exclusions::add_exclusion(ctx, wallet, exclusion_type)
    }

    pub fn remove_exclusion(
        ctx: Context<ManageExclusions>,
        wallet: Pubkey,
        exclusion_type: ExclusionType,
    ) -> Result<()> {
        instructions::manage_exclusions::remove_exclusion(ctx, wallet, exclusion_type)
    }
}