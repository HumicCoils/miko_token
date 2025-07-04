use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, Token, TokenAccount as TokenAccountSpl},
    token_2022::{self, Token2022},
    token_interface::{TokenAccount, TokenInterface},
};

use crate::{
    constants::*,
    errors::VaultError,
    state::VaultState,
};

#[derive(Accounts)]
pub struct EmergencyWithdrawVault<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault_state.bump
    )]
    pub vault_state: Account<'info, VaultState>,
    
    #[account(
        mut,
        constraint = authority.key() == vault_state.authority @ VaultError::InvalidAuthority
    )]
    pub authority: Signer<'info>,
    
    /// Vault's token account to withdraw from
    /// CHECK: This account is validated in the handler
    #[account(mut)]
    pub vault_token_account: AccountInfo<'info>,
    
    /// Authority's token account to receive funds
    /// CHECK: This account is validated in the handler
    #[account(mut)]
    pub authority_token_account: AccountInfo<'info>,
    
    /// CHECK: Token mint for the token being withdrawn
    pub token_mint: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<EmergencyWithdrawVault>,
    amount: u64,
) -> Result<()> {
    let vault_state = &ctx.accounts.vault_state;
    
    require!(
        amount > 0,
        VaultError::InvalidWithdrawAmount
    );
    
    msg!("Emergency withdrawal requested: {} tokens", amount);
    
    // Check if this is native SOL withdrawal
    if ctx.accounts.token_mint.key() == System::id() {
        // Withdraw native SOL
        let vault_lamports = ctx.accounts.vault_token_account.lamports();
        
        require!(
            vault_lamports >= amount,
            VaultError::InsufficientBalance
        );
        
        // Transfer SOL
        **ctx.accounts.vault_token_account.try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.authority_token_account.try_borrow_mut_lamports()? += amount;
        
        msg!("Withdrew {} lamports (SOL)", amount);
    } else {
        // Withdraw SPL tokens
        let is_token_2022 = ctx.accounts.token_mint.owner == &spl_token_2022::ID;
        
        let seeds = &[VAULT_SEED, &[vault_state.bump]];
        let signer_seeds = &[&seeds[..]];
        
        if is_token_2022 {
            // Token-2022 transfer
            anchor_spl::token_2022::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_2022_program.to_account_info(),
                    anchor_spl::token_2022::Transfer {
                        from: ctx.accounts.vault_token_account.to_account_info(),
                        to: ctx.accounts.authority_token_account.to_account_info(),
                        authority: vault_state.to_account_info(),
                    },
                    signer_seeds
                ),
                amount,
            )?;
            
            msg!("Withdrew {} Token-2022 tokens", amount);
        } else {
            // Regular SPL token transfer
            anchor_spl::token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Transfer {
                        from: ctx.accounts.vault_token_account.to_account_info(),
                        to: ctx.accounts.authority_token_account.to_account_info(),
                        authority: vault_state.to_account_info(),
                    },
                    signer_seeds
                ),
                amount,
            )?;
            
            msg!("Withdrew {} SPL tokens", amount);
        }
    }
    
    msg!("Emergency withdrawal complete");
    
    Ok(())
}

// Separate instruction to withdraw all funds from a vault account
#[derive(Accounts)]
pub struct EmergencyWithdrawAll<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault_state.bump
    )]
    pub vault_state: Account<'info, VaultState>,
    
    #[account(
        mut,
        constraint = authority.key() == vault_state.authority @ VaultError::InvalidAuthority
    )]
    pub authority: Signer<'info>,
    
    /// Vault's token account to withdraw from
    /// CHECK: This account is validated in the handler
    #[account(mut)]
    pub vault_token_account: AccountInfo<'info>,
    
    /// Authority's token account to receive funds
    /// CHECK: This account is validated in the handler
    #[account(mut)]
    pub authority_token_account: AccountInfo<'info>,
    
    /// CHECK: Token mint for the token being withdrawn
    pub token_mint: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn emergency_withdraw_all(ctx: Context<EmergencyWithdrawAll>) -> Result<()> {
    // Get current balance
    let balance = if ctx.accounts.token_mint.key() == System::id() {
        ctx.accounts.vault_token_account.lamports()
    } else {
        // Read token account balance
        let data = ctx.accounts.vault_token_account.try_borrow_data()?;
        if data.len() >= 72 {
            let amount_bytes: [u8; 8] = data[64..72].try_into()
                .map_err(|_| VaultError::InvalidWithdrawAmount)?;
            u64::from_le_bytes(amount_bytes)
        } else {
            0
        }
    };
    
    if balance > 0 {
        msg!("Emergency withdrawal of all funds: {} tokens", balance);
        
        // Check if this is native SOL withdrawal
        if ctx.accounts.token_mint.key() == System::id() {
            // Withdraw native SOL
            let vault_lamports = ctx.accounts.vault_token_account.lamports();
            
            require!(
                vault_lamports >= balance,
                VaultError::InsufficientBalance
            );
            
            // Transfer SOL
            **ctx.accounts.vault_token_account.try_borrow_mut_lamports()? -= balance;
            **ctx.accounts.authority_token_account.try_borrow_mut_lamports()? += balance;
            
            msg!("Withdrew {} lamports (SOL)", balance);
        } else {
            // Withdraw SPL tokens
            let is_token_2022 = ctx.accounts.token_mint.owner == &spl_token_2022::ID;
            
            let seeds = &[VAULT_SEED, &[ctx.accounts.vault_state.bump]];
            let signer_seeds = &[&seeds[..]];
            
            if is_token_2022 {
                token_2022::transfer_checked(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_2022_program.to_account_info(),
                        token_2022::TransferChecked {
                            from: ctx.accounts.vault_token_account.to_account_info(),
                            to: ctx.accounts.authority_token_account.to_account_info(),
                            authority: ctx.accounts.vault_state.to_account_info(),
                            mint: ctx.accounts.token_mint.to_account_info(),
                        },
                        signer_seeds
                    ),
                    balance,
                    9, // Decimals (MIKO token has 9 decimals)
                )?;
            } else {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        token::Transfer {
                            from: ctx.accounts.vault_token_account.to_account_info(),
                            to: ctx.accounts.authority_token_account.to_account_info(),
                            authority: ctx.accounts.vault_state.to_account_info(),
                        },
                        signer_seeds
                    ),
                    balance,
                )?;
            }
            
            msg!("Withdrew {} tokens", balance);
        }
    } else {
        msg!("No balance to withdraw");
    }
    
    Ok(())
}