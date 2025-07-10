use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::{TokenAccount, Mint};
use crate::state::*;
use crate::constants::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct EmergencyWithdrawWithheld<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.token_mint.as_ref()],
        bump = vault.bump,
        has_one = authority,
    )]
    pub vault: Account<'info, VaultState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: Token account with withheld fees
    #[account(mut)]
    pub token_account: AccountInfo<'info>,
    
    #[account(mut)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_mint: InterfaceAccount<'info, Mint>,
    
    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<EmergencyWithdrawWithheld>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    
    // Create vault signer seeds
    let vault_seeds = &[
        VAULT_SEED,
        vault.token_mint.as_ref(),
        &[vault.bump],
    ];
    let signer = &[&vault_seeds[..]];
    
    // Withdraw withheld fees using Token-2022
    let cpi_accounts = token_2022::WithdrawWithheldTokensFromAccounts {
        mint: ctx.accounts.token_mint.to_account_info(),
        destination: ctx.accounts.vault_token_account.to_account_info(),
        fee_recipient: ctx.accounts.vault.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    
    // Create the accounts array for the instruction
    let accounts = vec![ctx.accounts.token_account.to_account_info()];
    
    token_2022::withdraw_withheld_tokens_from_accounts(cpi_ctx, &accounts)?;
    
    msg!("Emergency withdrew withheld fees from account: {}", ctx.accounts.token_account.key());
    
    Ok(())
}
