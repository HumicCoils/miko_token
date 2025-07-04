use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;

use crate::{
    constants::*,
    errors::VaultError,
    state::{VaultState, ExclusionEntry, ExclusionType},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub treasury: Pubkey,
    pub owner_wallet: Pubkey,
    pub keeper_wallet: Pubkey,
    pub min_hold_amount: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = VaultState::LEN,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault_state: Account<'info, VaultState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: MIKO token mint (Token-2022)
    pub token_mint: AccountInfo<'info>,
    
    /// CHECK: Initial reward token mint (can be updated later)
    pub reward_token_mint: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    let vault_state = &mut ctx.accounts.vault_state;
    let clock = Clock::get()?;
    
    // Initialize vault state
    vault_state.authority = ctx.accounts.authority.key();
    vault_state.treasury = params.treasury;
    vault_state.owner_wallet = params.owner_wallet;
    vault_state.keeper_wallet = params.keeper_wallet;
    vault_state.token_mint = ctx.accounts.token_mint.key();
    vault_state.min_hold_amount = params.min_hold_amount;
    vault_state.reward_token_mint = ctx.accounts.reward_token_mint.key();
    vault_state.total_fees_harvested = 0;
    vault_state.total_rewards_distributed = 0;
    vault_state.last_harvest_timestamp = clock.unix_timestamp;
    vault_state.last_distribution_timestamp = clock.unix_timestamp;
    vault_state.unique_reward_recipients = 0;
    vault_state.bump = ctx.bumps.vault_state;
    vault_state._reserved = [0u8; 128];
    
    msg!("Vault initialized successfully");
    msg!("Authority: {}", vault_state.authority);
    msg!("Treasury: {}", vault_state.treasury);
    msg!("Owner wallet: {}", vault_state.owner_wallet);
    msg!("Token mint: {}", vault_state.token_mint);
    msg!("Min hold amount: ${}", vault_state.min_hold_amount);
    
    // Auto-add system accounts to exclusion lists
    // We'll need to create these exclusions in a separate transaction
    // due to account limits, but we log them here for clarity
    msg!("System accounts to be auto-excluded:");
    msg!("- Authority: {}", vault_state.authority);
    msg!("- Treasury: {}", vault_state.treasury);
    msg!("- Owner: {}", vault_state.owner_wallet);
    msg!("- Keeper: {}", vault_state.keeper_wallet);
    msg!("- Program: {}", crate::ID);
    
    Ok(())
}

// Separate instruction to add system exclusions after initialization
#[derive(Accounts)]
pub struct InitializeSystemExclusions<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault_state.bump
    )]
    pub vault_state: Account<'info, VaultState>,
    
    #[account(
        init,
        payer = authority,
        space = ExclusionEntry::LEN,
        seeds = [EXCLUSION_SEED, system_wallet.as_ref()],
        bump
    )]
    pub exclusion_entry: Account<'info, ExclusionEntry>,
    
    #[account(mut, constraint = authority.key() == vault_state.authority @ VaultError::InvalidAuthority)]
    pub authority: Signer<'info>,
    
    /// CHECK: System wallet to exclude
    pub system_wallet: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn initialize_system_exclusions(ctx: Context<InitializeSystemExclusions>) -> Result<()> {
    let vault_state = &ctx.accounts.vault_state;
    let exclusion_entry = &mut ctx.accounts.exclusion_entry;
    let clock = Clock::get()?;
    
    // Verify this is a system account
    require!(
        vault_state.is_system_account(&ctx.accounts.system_wallet.key()),
        VaultError::InvalidAuthority
    );
    
    // Create exclusion entry for both fees and rewards
    exclusion_entry.wallet = ctx.accounts.system_wallet.key();
    exclusion_entry.exclusion_type = ExclusionType::Both;
    exclusion_entry.created_at = clock.unix_timestamp;
    exclusion_entry.added_by = ctx.accounts.authority.key();
    exclusion_entry.bump = ctx.bumps.exclusion_entry;
    
    msg!("System account excluded: {}", exclusion_entry.wallet);
    
    Ok(())
}