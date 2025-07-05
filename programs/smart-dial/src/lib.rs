use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("Dia11111111111111111111111111111111111111111");

#[program]
pub mod smart_dial {
    use super::*;

    /// Initialize the Smart Dial program
    /// Sets up the dial configuration for reward token selection
    pub fn initialize(
        ctx: Context<Initialize>,
        initial_reward_token: Pubkey,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, initial_reward_token)
    }

    /// Update the reward token
    /// Called weekly based on AI selection from Twitter
    pub fn update_reward_token(
        ctx: Context<UpdateRewardToken>,
        new_reward_token: Pubkey,
    ) -> Result<()> {
        instructions::update_reward_token::handler(ctx, new_reward_token)
    }

    /// Update treasury wallet
    /// Allows changing where the 4% treasury fees go
    pub fn update_treasury(
        ctx: Context<UpdateTreasury>,
        new_treasury: Pubkey,
    ) -> Result<()> {
        instructions::update_treasury::handler(ctx, new_treasury)
    }

    /// Get current configuration (view function)
    /// Returns the current reward token and treasury settings
    pub fn get_config(ctx: Context<GetConfig>) -> Result<()> {
        instructions::get_config::handler(ctx)
    }
}