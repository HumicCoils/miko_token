use anchor_lang::prelude::*;
use crate::{
    constants::*,
    errors::DialError,
    state::DialState,
};

#[derive(Accounts)]
pub struct UpdateTreasury<'info> {
    #[account(
        mut,
        seeds = [DIAL_STATE_SEED],
        bump = dial_state.bump,
        constraint = dial_state.is_initialized @ DialError::NotInitialized
    )]
    pub dial_state: Account<'info, DialState>,
    
    #[account(
        constraint = authority.key() == dial_state.authority @ DialError::Unauthorized
    )]
    pub authority: Signer<'info>,
    
    /// CHECK: New treasury wallet can be any valid account
    pub new_treasury: AccountInfo<'info>,
}

pub fn handler(
    ctx: Context<UpdateTreasury>,
    new_treasury: Pubkey,
) -> Result<()> {
    let dial_state = &mut ctx.accounts.dial_state;
    
    // Validate the new treasury
    require!(
        new_treasury != Pubkey::default(),
        DialError::InvalidTreasury
    );
    
    // Ensure the provided account matches the parameter
    require!(
        ctx.accounts.new_treasury.key() == new_treasury,
        DialError::InvalidTreasury
    );
    
    let old_treasury = dial_state.treasury_wallet;
    
    // Update the treasury
    dial_state.update_treasury(new_treasury)?;
    
    msg!("Treasury wallet updated successfully");
    msg!("Old treasury: {}", old_treasury);
    msg!("New treasury: {}", new_treasury);
    
    Ok(())
}