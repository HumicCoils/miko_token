use anchor_lang::prelude::*;
use crate::{state::DialConfig, errors::DialError};

#[derive(Accounts)]
pub struct UpdateRewardToken<'info> {
    #[account(mut)]
    pub keeper_bot: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"smart_dial_config"],
        bump = dial_config.bump,
        constraint = dial_config.keeper_bot_wallet == keeper_bot.key() @ ErrorCode::ConstraintAddress
    )]
    pub dial_config: Account<'info, DialConfig>,
}

pub fn handler(
    ctx: Context<UpdateRewardToken>,
    new_reward_token: Pubkey,
    token_symbol: String,
) -> Result<()> {
    let config = &mut ctx.accounts.dial_config;
    
    require!(token_symbol.len() <= 32, DialError::InvalidTokenSymbol);
    
    config.current_reward_token = new_reward_token;
    config.current_token_symbol = token_symbol.clone();
    config.last_update = Clock::get()?.unix_timestamp;
    config.total_updates += 1;
    
    msg!("Reward token updated to: {} ({})", token_symbol, new_reward_token);
    msg!("Update #{} at timestamp {}", config.total_updates, config.last_update);
    
    Ok(())
}