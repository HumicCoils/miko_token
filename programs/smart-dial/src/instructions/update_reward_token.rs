use anchor_lang::prelude::*;
use crate::{
    constants::*,
    errors::DialError,
    state::{DialState, UpdateRecord},
};

#[derive(Accounts)]
#[instruction(new_reward_token: Pubkey)]
pub struct UpdateRewardToken<'info> {
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
    
    #[account(
        init,
        payer = authority,
        space = UpdateRecord::LEN,
        seeds = [
            UPDATE_RECORD_SEED,
            &dial_state.update_count.to_le_bytes()
        ],
        bump
    )]
    pub update_record: Account<'info, UpdateRecord>,
    
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<UpdateRewardToken>,
    new_reward_token: Pubkey,
) -> Result<()> {
    let dial_state = &mut ctx.accounts.dial_state;
    let update_record = &mut ctx.accounts.update_record;
    let current_timestamp = Clock::get()?.unix_timestamp;
    
    // Check if enough time has passed (1 day minimum)
    require!(
        dial_state.can_update(current_timestamp),
        DialError::UpdateTooFrequent
    );
    
    // Validate the new reward token
    require!(
        new_reward_token != Pubkey::default(),
        DialError::InvalidRewardToken
    );
    
    // Check if we've reached max update records
    require!(
        dial_state.update_count < MAX_UPDATE_RECORDS as u32,
        DialError::MaxUpdateRecordsReached
    );
    
    // Store the old token for the record
    let old_token = dial_state.current_reward_token;
    
    // Update the dial state
    dial_state.update_reward_token(new_reward_token, current_timestamp)?;
    
    // Create update record
    update_record.timestamp = current_timestamp;
    update_record.reward_token = new_reward_token;
    update_record.updated_by = ctx.accounts.authority.key();
    update_record.update_index = dial_state.update_count - 1; // Already incremented
    update_record.bump = ctx.bumps.update_record;
    
    msg!("Reward token updated successfully");
    msg!("Old token: {}", old_token);
    msg!("New token: {}", new_reward_token);
    msg!("Update count: {}", dial_state.update_count);
    
    Ok(())
}