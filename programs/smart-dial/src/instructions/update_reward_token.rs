use anchor_lang::prelude::*;
use crate::{errors::SmartDialError, state::{SmartDialConfig, SMART_DIAL_CONFIG_SEED}};

#[derive(Accounts)]
pub struct UpdateRewardToken<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    
    #[account(
        mut,
        seeds = [SMART_DIAL_CONFIG_SEED],
        bump = config.bump,
        constraint = config.initialized @ SmartDialError::NotInitialized
    )]
    pub config: Account<'info, SmartDialConfig>,
}

pub fn handler(
    ctx: Context<UpdateRewardToken>,
    new_mint: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    
    // Only keeper bot can update reward token
    require!(
        ctx.accounts.signer.key() == config.keeper_bot_pubkey,
        SmartDialError::UnauthorizedAccess
    );
    
    // Validate new mint is not default pubkey
    require!(
        new_mint != Pubkey::default(),
        SmartDialError::InvalidRewardTokenMint
    );
    
    let old_mint = config.current_reward_token_mint;
    config.current_reward_token_mint = new_mint;
    
    emit!(RewardTokenUpdated {
        old_mint,
        new_mint,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Reward token updated from {} to {}", old_mint, new_mint);
    
    Ok(())
}

#[event]
pub struct RewardTokenUpdated {
    pub old_mint: Pubkey,
    pub new_mint: Pubkey,
    pub timestamp: i64,
}