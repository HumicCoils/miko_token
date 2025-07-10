use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::{self, TokenAccount, TokenInterface};
use crate::state::*;
use crate::constants::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct EmergencyWithdrawVault<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.token_mint.as_ref()],
        bump = vault.bump,
        has_one = authority,
    )]
    pub vault: Account<'info, VaultState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: Destination wallet for emergency withdrawal
    #[account(mut)]
    pub destination: AccountInfo<'info>,
    
    #[account(mut)]
    pub vault_token_account: Option<InterfaceAccount<'info, TokenAccount>>,
    
    pub token_program: Option<Interface<'info, TokenInterface>>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<EmergencyWithdrawVault>,
    withdraw_sol: bool,
    amount: Option<u64>,
) -> Result<()> {
    let vault = &ctx.accounts.vault;
    
    let vault_seeds = &[
        VAULT_SEED,
        vault.token_mint.as_ref(),
        &[vault.bump],
    ];
    let signer = &[&vault_seeds[..]];
    
    if withdraw_sol {
        // Withdraw SOL
        let vault_balance = ctx.accounts.vault.to_account_info().lamports();
        let rent = Rent::get()?.minimum_balance(VaultState::LEN);
        let available = vault_balance.saturating_sub(rent);
        
        let withdraw_amount = amount.unwrap_or(available);
        require\!(withdraw_amount <= available, VaultError::InsufficientSolBalance);
        
        // Transfer SOL
        let transfer_ix = system_program::Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
        };
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            transfer_ix,
            signer,
        );
        system_program::transfer(transfer_ctx, withdraw_amount)?;
        
        msg\!("Emergency withdrew {} SOL from vault", withdraw_amount);
    } else {
        // Withdraw tokens
        let vault_token_account = ctx.accounts.vault_token_account
            .as_ref()
            .ok_or(VaultError::InvalidTokenMint)?;
        let token_program = ctx.accounts.token_program
            .as_ref()
            .ok_or(VaultError::InvalidTokenMint)?;
        
        let available = vault_token_account.amount;
        let withdraw_amount = amount.unwrap_or(available);
        require\!(withdraw_amount <= available, VaultError::InsufficientSolBalance);
        
        // Transfer tokens
        let cpi_accounts = token_interface::Transfer {
            from: vault_token_account.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        
        token_interface::transfer(cpi_ctx, withdraw_amount)?;
        
        msg\!("Emergency withdrew {} tokens from vault", withdraw_amount);
    }
    
    Ok(())
}
