use anchor_lang::prelude::*;
use anchor_lang::solana_program;
use anchor_spl::{
    token_2022::{self, Token2022},
    token_interface::{Mint, TokenAccount, TokenInterface},
};
// Import necessary modules
use spl_token_2022::{
    extension::{StateWithExtensions, BaseStateWithExtensions, transfer_fee},
    state::Mint as SplMint,
};

use crate::{
    constants::*,
    errors::VaultError,
    state::VaultState,
};

#[derive(Accounts)]
pub struct EmergencyWithdrawWithheld<'info> {
    #[account(
        seeds = [VAULT_SEED, vault_state.token_mint.as_ref()],
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

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, EmergencyWithdrawWithheld<'info>>,
    accounts_to_withdraw: Vec<Pubkey>,
) -> Result<()> {
    require!(
        !accounts_to_withdraw.is_empty() && accounts_to_withdraw.len() <= MAX_ACCOUNTS_PER_TX,
        VaultError::TooManyAccounts
    );

    // 1. Harvest withheld tokens from the specified accounts to the mint.
    let harvest_accounts_infos: Vec<AccountInfo> = ctx.remaining_accounts
        .iter()
        .filter(|acc| accounts_to_withdraw.contains(&acc.key()))
        .cloned()
        .collect();
    
    if !harvest_accounts_infos.is_empty() {
        let harvest_sources: Vec<Pubkey> = harvest_accounts_infos.iter().map(|acc| acc.key()).collect();
        let harvest_sources_refs: Vec<&Pubkey> = harvest_sources.iter().collect();
        let harvest_ix = transfer_fee::instruction::harvest_withheld_tokens_to_mint(
            &spl_token_2022::ID,
            &ctx.accounts.token_mint.key(),
            &harvest_sources_refs,
        )?;

        // Build accounts for invoke
        let mut invoke_accounts = vec![
            ctx.accounts.token_2022_program.to_account_info(),
            ctx.accounts.token_mint.to_account_info(),
        ];
        invoke_accounts.extend(harvest_accounts_infos.clone());

        solana_program::program::invoke(
            &harvest_ix,
            &invoke_accounts,
        )?;
        msg!("Harvested withheld fees from {} accounts to mint.", harvest_accounts_infos.len());
    }

    // 2. Withdraw all withheld tokens from the mint to the authority's account.
    let mint_data = ctx.accounts.token_mint.try_borrow_data()?;
    let mint_with_extension = StateWithExtensions::<SplMint>::unpack(&mint_data)?;
    
    // Get the transfer fee config extension to read withheld amount
    if let Ok(fee_config) = mint_with_extension.get_extension::<transfer_fee::TransferFeeConfig>() {
        let total_withheld = u64::from(fee_config.withheld_amount);
        
        if total_withheld > 0 {
            // The signer (`authority`) must be the mint's `withdraw_withheld_authority`.
            let withdraw_ix = transfer_fee::instruction::withdraw_withheld_tokens_from_mint(
                &spl_token_2022::ID,
                &ctx.accounts.token_mint.key(),
                &ctx.accounts.authority_token_account.key(),
                &ctx.accounts.authority.key(), // The signer is the authority
                &[],
            )?;

            solana_program::program::invoke_signed(
                &withdraw_ix,
                &[
                    ctx.accounts.token_2022_program.to_account_info(),
                    ctx.accounts.token_mint.to_account_info(),
                    ctx.accounts.authority_token_account.to_account_info(),
                    ctx.accounts.authority.to_account_info(),
                ],
                &[], // No PDA seeds needed since the authority is signing.
            )?;
            msg!("Withdrew {} withheld tokens to authority.", total_withheld);
        } else {
            msg!("No withheld tokens to withdraw from mint.");
        }
    }
    
    Ok(())
}

// Separate instruction to just harvest without withdrawing
#[derive(Accounts)]
pub struct HarvestWithheldToMint<'info> {
    #[account(
        seeds = [VAULT_SEED, vault_state.token_mint.as_ref()],
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

pub fn harvest_withheld_to_mint<'info>(
    ctx: Context<'_, '_, '_, 'info, HarvestWithheldToMint<'info>>,
    accounts_to_harvest: Vec<Pubkey>,
) -> Result<()> {
    require!(
        accounts_to_harvest.len() <= MAX_ACCOUNTS_PER_TX,
        VaultError::TooManyAccounts
    );
    
    msg!("Harvesting withheld tokens from {} accounts to mint", 
        accounts_to_harvest.len());
    
    // Build harvest instruction
    let harvest_sources: Vec<&Pubkey> = accounts_to_harvest.iter().collect();
    let harvest_ix = transfer_fee::instruction::harvest_withheld_tokens_to_mint(
        &spl_token_2022::ID,
        &ctx.accounts.token_mint.key(),
        &harvest_sources,
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