use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{self, Token2022},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::*,
    errors::VaultError,
    state::{VaultState, ExclusionEntry},
};

#[derive(Accounts)]
pub struct HarvestFees<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault_state.bump
    )]
    pub vault_state: Account<'info, VaultState>,
    
    #[account(
        mut,
        constraint = keeper.key() == vault_state.keeper_wallet @ VaultError::InvalidAuthority
    )]
    pub keeper: Signer<'info>,
    
    /// CHECK: MIKO token mint (Token-2022)
    #[account(
        constraint = token_mint.key() == vault_state.token_mint @ VaultError::InvalidTokenMint
    )]
    pub token_mint: AccountInfo<'info>,
    
    /// Treasury token account to receive 4% share
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = vault_state.treasury,
        associated_token::token_program = token_2022_program,
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// Owner token account to receive 1% share  
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = vault_state.owner_wallet,
        associated_token::token_program = token_2022_program,
    )]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// Vault's token account (temporary holding)
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = vault_state,
        associated_token::token_program = token_2022_program,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    mut ctx: Context<HarvestFees>,
    accounts_to_harvest: Vec<Pubkey>,
) -> Result<()> {
    let vault_state = &mut ctx.accounts.vault_state;
    let clock = Clock::get()?;
    
    require!(
        accounts_to_harvest.len() <= MAX_ACCOUNTS_PER_TX,
        VaultError::TooManyAccounts
    );
    
    msg!("Starting fee harvest for {} accounts", accounts_to_harvest.len());
    
    let mut total_harvested = 0u64;
    let mut accounts_processed = 0u32;
    
    // Process each account
    for account_pubkey in accounts_to_harvest.iter() {
        // Check if account is excluded from fees
        let exclusion_pda = Pubkey::find_program_address(
            &[EXCLUSION_SEED, account_pubkey.as_ref()],
            &crate::ID
        ).0;
        
        // Try to load exclusion entry
        if let Ok(exclusion_data) = ctx.remaining_accounts.iter()
            .find(|acc| acc.key() == exclusion_pda)
            .ok_or(ProgramError::AccountNotFound)
            .and_then(|acc| acc.try_borrow_data()) {
            
            // Check if it's a valid exclusion entry
            if exclusion_data.len() >= 8 {
                // Skip if excluded from fees
                msg!("Account {} is excluded from fees, skipping", account_pubkey);
                continue;
            }
        }
        
        // Find the token account in remaining accounts
        let token_account = ctx.remaining_accounts.iter()
            .find(|acc| acc.key() == *account_pubkey)
            .ok_or(VaultError::TokenAccountNotFound)?;
            
        // Harvest withheld fees from this account
        let harvest_result = harvest_from_account(
            &ctx.accounts.token_mint,
            token_account,
            &ctx.accounts.vault_token_account,
            &ctx.accounts.token_2022_program,
            &vault_state.to_account_info(),
            &ctx.bumps,
        );
        
        match harvest_result {
            Ok(amount) => {
                total_harvested = total_harvested.saturating_add(amount);
                accounts_processed += 1;
                msg!("Harvested {} from {}", amount, account_pubkey);
            },
            Err(e) => {
                msg!("Failed to harvest from {}: {:?}", account_pubkey, e);
            }
        }
    }
    
    msg!("Total harvested: {} from {} accounts", total_harvested, accounts_processed);
    
    if total_harvested > 0 {
        // Split the fees: 20% to owner (1% of 5%), 80% to treasury (4% of 5%)
        let owner_amount = total_harvested
            .checked_mul(OWNER_FEE_BPS as u64)
            .ok_or(VaultError::ArithmeticOverflow)?
            .checked_div((OWNER_FEE_BPS + TREASURY_FEE_BPS) as u64)
            .ok_or(VaultError::ArithmeticOverflow)?;
            
        let treasury_amount = total_harvested.saturating_sub(owner_amount);
        
        // Transfer to owner
        if owner_amount > 0 {
            let seeds = &[VAULT_SEED, &[vault_state.bump]];
            let signer_seeds = &[&seeds[..]];
            
            token_2022::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_2022_program.to_account_info(),
                    token_2022::TransferChecked {
                        from: ctx.accounts.vault_token_account.to_account_info(),
                        to: ctx.accounts.owner_token_account.to_account_info(),
                        authority: vault_state.to_account_info(),
                        mint: ctx.accounts.token_mint.to_account_info(),
                    },
                    signer_seeds
                ),
                owner_amount,
                9, // MIKO decimals
            )?;
            
            msg!("Transferred {} to owner", owner_amount);
        }
        
        // Transfer to treasury
        if treasury_amount > 0 {
            let seeds = &[VAULT_SEED, &[vault_state.bump]];
            let signer_seeds = &[&seeds[..]];
            
            token_2022::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_2022_program.to_account_info(),
                    token_2022::TransferChecked {
                        from: ctx.accounts.vault_token_account.to_account_info(),
                        to: ctx.accounts.treasury_token_account.to_account_info(),
                        authority: vault_state.to_account_info(),
                        mint: ctx.accounts.token_mint.to_account_info(),
                    },
                    signer_seeds
                ),
                treasury_amount,
                9, // MIKO decimals
            )?;
            
            msg!("Transferred {} to treasury", treasury_amount);
        }
        
        // Update vault state
        vault_state.total_fees_harvested = vault_state.total_fees_harvested
            .saturating_add(total_harvested);
        vault_state.last_harvest_timestamp = clock.unix_timestamp;
    }
    
    Ok(())
}

fn harvest_from_account<'info>(
    _mint: &AccountInfo<'info>,
    _source_account: &AccountInfo<'info>,
    _destination_account: &InterfaceAccount<'info, TokenAccount>,
    _token_program: &Program<'info, Token2022>,
    _authority: &AccountInfo<'info>,
    _bumps: &std::collections::BTreeMap<String, u8>,
) -> Result<u64> {
    // This is a simplified version - in production, you would use
    // the proper Token-2022 harvest instruction
    
    // For now, return 0 as we need the actual harvest CPI implementation
    // which requires the withdraw withheld authority
    Ok(0)
}