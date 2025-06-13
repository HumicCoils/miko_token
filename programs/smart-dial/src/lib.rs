use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("KNKv3pAEiA313iGTSWUZ9yLF5pPDSCpDKb3KLJ9ibPA");

#[program]
pub mod smart_dial {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        keeper_bot_pubkey: Pubkey,
        treasury_wallet: Pubkey,
        owner_wallet: Pubkey,
        ai_agent_twitter_id: String,
    ) -> Result<()> {
        instructions::initialize::handler(
            ctx,
            keeper_bot_pubkey,
            treasury_wallet,
            owner_wallet,
            ai_agent_twitter_id,
        )
    }

    pub fn update_reward_token_mint(
        ctx: Context<UpdateRewardToken>,
        new_mint: Pubkey,
    ) -> Result<()> {
        instructions::update_reward_token::handler(ctx, new_mint)
    }

    pub fn update_wallets(
        ctx: Context<UpdateWallets>,
        new_treasury_wallet: Option<Pubkey>,
        new_owner_wallet: Option<Pubkey>,
    ) -> Result<()> {
        instructions::update_wallets::handler(ctx, new_treasury_wallet, new_owner_wallet)
    }
}