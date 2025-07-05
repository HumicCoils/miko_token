use anchor_lang::prelude::*;
use crate::{
    constants::*,
    errors::DialError,
    state::DialState,
};

#[derive(Accounts)]
pub struct GetConfig<'info> {
    #[account(
        seeds = [DIAL_STATE_SEED],
        bump = dial_state.bump,
        constraint = dial_state.is_initialized @ DialError::NotInitialized
    )]
    pub dial_state: Account<'info, DialState>,
}

pub fn handler(ctx: Context<GetConfig>) -> Result<()> {
    let dial_state = &ctx.accounts.dial_state;
    
    msg!("=== Smart Dial Configuration ===");
    msg!("Authority: {}", dial_state.authority);
    msg!("Current reward token: {}", dial_state.current_reward_token);
    msg!("Treasury wallet: {}", dial_state.treasury_wallet);
    msg!("Last update: {}", dial_state.last_update);
    msg!("Update count: {}", dial_state.update_count);
    msg!("Is initialized: {}", dial_state.is_initialized);
    
    Ok(())
}