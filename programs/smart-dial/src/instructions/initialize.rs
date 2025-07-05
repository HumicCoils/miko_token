use anchor_lang::prelude::*;
use crate::{
    constants::*,
    errors::DialError,
    state::DialState,
};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = DialState::LEN,
        seeds = [DIAL_STATE_SEED],
        bump
    )]
    pub dial_state: Account<'info, DialState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: Treasury wallet can be any valid account
    pub treasury_wallet: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<Initialize>,
    initial_reward_token: Pubkey,
) -> Result<()> {
    let dial_state = &mut ctx.accounts.dial_state;
    
    // Ensure not already initialized
    require!(
        !dial_state.is_initialized,
        DialError::AlreadyInitialized
    );
    
    // Initialize the dial state
    dial_state.authority = ctx.accounts.authority.key();
    dial_state.current_reward_token = initial_reward_token;
    dial_state.treasury_wallet = ctx.accounts.treasury_wallet.key();
    dial_state.last_update = Clock::get()?.unix_timestamp;
    dial_state.update_count = 0;
    dial_state.is_initialized = true;
    dial_state.bump = ctx.bumps.dial_state;
    
    msg!("Smart Dial initialized successfully");
    msg!("Authority: {}", dial_state.authority);
    msg!("Initial reward token: {}", dial_state.current_reward_token);
    msg!("Treasury wallet: {}", dial_state.treasury_wallet);
    
    Ok(())
}