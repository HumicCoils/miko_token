use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{self, Token2022},
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use spl_token_2022::{
    instruction::{withdraw_withheld_tokens_from_accounts, harvest_withheld_tokens_to_mint},
};

use crate::{
    constants::*,
    errors::VaultError,
    state::VaultState,
};

#[derive(Accounts)]
pub struct EmergencyWithdrawWithheld<'info> {
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
    
    /// CHECK: MIKO token mint (Token-2022)
    #[account(
        mut,
        constraint = token_mint.key() == vault_state.token_mint @ VaultError::InvalidTokenMint
    )]
    pub token_mint: AccountInfo<'info>,
    
    /// Authority's token account to receive withdrawn fees
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = authority,
        associated_token::token_program = token_2022_program,
    )]
    pub authority_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<EmergencyWithdrawWithheld>,
    accounts_to_withdraw: Vec<Pubkey>,
) -> Result<()> {
    require!(
        accounts_to_withdraw.len() <= MAX_ACCOUNTS_PER_TX,
        VaultError::TooManyAccounts
    );
    
    msg!("Emergency withdrawal of withheld fees from {} accounts", 
        accounts_to_withdraw.len());
    
    // First, harvest all withheld tokens to the mint
    let harvest_accounts = ctx.remaining_accounts.iter()
        .filter(|acc| accounts_to_withdraw.contains(&acc.key()))
        .map(|acc| acc.to_account_info())
        .collect::<Vec<_>>();
        
    if !harvest_accounts.is_empty() {
        msg!("Harvesting withheld tokens from {} accounts to mint", 
            harvest_accounts.len());
            
        // Build harvest instruction
        let harvest_ix = harvest_withheld_tokens_to_mint(
            &spl_token_2022::ID,
            &ctx.accounts.token_mint.key(),
            harvest_accounts.iter().map(|acc| acc.key).collect::<Vec<_>>().as_slice(),
        )?;
        
        // Execute harvest
        solana_program::program::invoke(
            &harvest_ix,
            &[
                ctx.accounts.token_mint.to_account_info(),
                ctx.accounts.token_2022_program.to_account_info(),
            ],
        )?;
        
        msg!("Harvest complete");
    }
    
    // Now withdraw the harvested tokens from the mint to authority
    msg!("Withdrawing harvested tokens from mint to authority");
    
    // Get the withdraw withheld authority (should be the same as the authority)
    // In production, this would be the actual withdraw withheld authority from the mint
    
    // Build withdraw instruction
    let withdraw_ix = withdraw_withheld_tokens_from_accounts(
        &spl_token_2022::ID,
        &ctx.accounts.token_mint.key(),
        &ctx.accounts.authority_token_account.key(),
        &ctx.accounts.authority.key(),
        &[],
        &[ctx.accounts.token_mint.key()],
    )?;
    
    // Execute withdrawal
    solana_program::program::invoke_signed(
        &withdraw_ix,
        &[
            ctx.accounts.token_mint.to_account_info(),
            ctx.accounts.authority_token_account.to_account_info(),
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.token_2022_program.to_account_info(),
        ],
        &[],
    )?;
    
    msg!("Emergency withdrawal of withheld fees complete");
    
    Ok(())
}

// Separate instruction to just harvest without withdrawing
#[derive(Accounts)]
pub struct HarvestWithheldToMint<'info> {
    #[account(
        seeds = [VAULT_SEED],
        bump = vault_state.bump
    )]
    pub vault_state: Account<'info, VaultState>,
    
    #[account(
        constraint = keeper.key() == vault_state.keeper_wallet @ VaultError::InvalidAuthority
    )]
    pub keeper: Signer<'info>,
    
    /// CHECK: MIKO token mint (Token-2022)
    #[account(
        mut,
        constraint = token_mint.key() == vault_state.token_mint @ VaultError::InvalidTokenMint
    )]
    pub token_mint: AccountInfo<'info>,
    
    pub token_2022_program: Program<'info, Token2022>,
}

pub fn harvest_withheld_to_mint(
    ctx: Context<HarvestWithheldToMint>,
    accounts_to_harvest: Vec<Pubkey>,
) -> Result<()> {
    require!(
        accounts_to_harvest.len() <= MAX_ACCOUNTS_PER_TX,
        VaultError::TooManyAccounts
    );
    
    msg!("Harvesting withheld tokens from {} accounts to mint", 
        accounts_to_harvest.len());
    
    // Build harvest instruction
    let harvest_ix = harvest_withheld_tokens_to_mint(
        &spl_token_2022::ID,
        &ctx.accounts.token_mint.key(),
        accounts_to_harvest.as_slice(),
    )?;
    
    // Execute harvest
    solana_program::program::invoke(
        &harvest_ix,
        &[
            ctx.accounts.token_mint.to_account_info(),
            ctx.accounts.token_2022_program.to_account_info(),
        ],
    )?;
    
    msg!("Harvest to mint complete");
    
    Ok(())
}