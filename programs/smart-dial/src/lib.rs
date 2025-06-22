use anchor_lang::prelude::*;

pub mod state;
pub mod instructions;

use instructions::*;

declare_id!("SDia1z3nQJGbcVMnEqFxGEUH5WMCWsUruKFMQkwvjLn");

#[program]
pub mod smart_dial {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        keeper_bot_wallet: Pubkey,
        treasury_wallet: Pubkey,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, keeper_bot_wallet, treasury_wallet)
    }

    pub fn update_reward_token(
        ctx: Context<UpdateRewardToken>,
        new_reward_token: Pubkey,
        token_symbol: String,
    ) -> Result<()> {
        instructions::update_reward::handler(ctx, new_reward_token, token_symbol)
    }
}