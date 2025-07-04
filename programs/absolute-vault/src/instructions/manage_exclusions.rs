use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::VaultError,
    state::{VaultState, ExclusionEntry, ExclusionType, ExclusionAction},
};

#[derive(Accounts)]
#[instruction(wallet: Pubkey, exclusion_type: ExclusionType, action: ExclusionAction)]
pub struct ManageExclusions<'info> {
    #[account(
        seeds = [VAULT_SEED],
        bump = vault_state.bump
    )]
    pub vault_state: Account<'info, VaultState>,
    
    #[account(
        mut,
        constraint = authority.key() == vault_state.authority @ VaultError::InvalidAuthority
    )]
    pub authority: Signer<'info>,
    
    #[account(
        init_if_needed,
        payer = authority,
        space = ExclusionEntry::LEN,
        seeds = [EXCLUSION_SEED, wallet.as_ref()],
        bump
    )]
    pub exclusion_entry: Account<'info, ExclusionEntry>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    mut ctx: Context<ManageExclusions>,
    wallet: Pubkey,
    exclusion_type: ExclusionType,
    action: ExclusionAction,
) -> Result<()> {
    let vault_state = &ctx.accounts.vault_state;
    let exclusion_entry = &mut ctx.accounts.exclusion_entry;
    let clock = Clock::get()?;
    
    match action {
        ExclusionAction::Add => {
            // Check if already initialized (existing exclusion)
            if exclusion_entry.wallet != Pubkey::default() {
                // Update existing exclusion
                msg!("Updating existing exclusion for {}", wallet);
                
                // Cannot remove system account exclusions
                if vault_state.is_system_account(&wallet) {
                    require!(
                        exclusion_type == ExclusionType::Both,
                        VaultError::CannotRemoveSystemExclusion
                    );
                }
                
                exclusion_entry.exclusion_type = exclusion_type;
            } else {
                // New exclusion
                msg!("Adding new exclusion for {}", wallet);
                
                exclusion_entry.wallet = wallet;
                exclusion_entry.exclusion_type = exclusion_type;
                exclusion_entry.created_at = clock.unix_timestamp;
                exclusion_entry.added_by = ctx.accounts.authority.key();
                exclusion_entry.bump = ctx.bumps.exclusion_entry;
            }
            
            msg!("Exclusion added: {} - Type: {:?}", wallet, exclusion_type);
        },
        
        ExclusionAction::Remove => {
            // Verify exclusion exists
            require!(
                exclusion_entry.wallet != Pubkey::default(),
                VaultError::NotExcluded
            );
            
            // Cannot remove system account exclusions
            require!(
                !vault_state.is_system_account(&wallet),
                VaultError::CannotRemoveSystemExclusion
            );
            
            // Close the account and return lamports to authority
            let exclusion_lamports = exclusion_entry.to_account_info().lamports();
            **exclusion_entry.to_account_info().try_borrow_mut_lamports()? = 0;
            **ctx.accounts.authority.to_account_info().try_borrow_mut_lamports()? += exclusion_lamports;
            
            msg!("Exclusion removed: {}", wallet);
        }
    }
    
    Ok(())
}

// Separate instruction to check exclusion status
#[derive(Accounts)]
pub struct CheckExclusion<'info> {
    #[account(
        seeds = [EXCLUSION_SEED, wallet.key().as_ref()],
        bump
    )]
    pub exclusion_entry: Account<'info, ExclusionEntry>,
    
    /// CHECK: Wallet to check
    pub wallet: AccountInfo<'info>,
}

pub fn check_exclusion(ctx: Context<CheckExclusion>) -> Result<(bool, bool)> {
    let exclusion_entry = &ctx.accounts.exclusion_entry;
    
    let excludes_fees = exclusion_entry.excludes_fees();
    let excludes_rewards = exclusion_entry.excludes_rewards();
    
    msg!("Wallet {} - Excludes fees: {}, Excludes rewards: {}", 
        ctx.accounts.wallet.key(), excludes_fees, excludes_rewards);
    
    Ok((excludes_fees, excludes_rewards))
}