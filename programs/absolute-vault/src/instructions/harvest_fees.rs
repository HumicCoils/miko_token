use anchor_lang::prelude::*;
use anchor_lang::solana_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{self, Token2022},
    token_interface::{Mint, TokenAccount, TokenInterface},
};
// Import necessary SPL Token 2022 modules
use spl_token_2022::{
    extension::{StateWithExtensions, BaseStateWithExtensions},
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
        seeds = [VAULT_SEED, vault_state.token_mint.as_ref()],
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

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, HarvestFees<'info>>,
    accounts_to_harvest: Vec<Pubkey>,
) -> Result<()> {
    let vault_state = &mut ctx.accounts.vault_state;
    let clock = Clock::get()?;

    require!(
        accounts_to_harvest.len() <= MAX_ACCOUNTS_PER_TX,
        VaultError::TooManyAccounts
    );

    msg!("Starting fee harvest for {} accounts", accounts_to_harvest.len());

    let mut total_harvested: u64 = 0;
    
    // 1. Harvest withheld fees from specified token accounts to the mint.
    let harvest_accounts_infos: Vec<AccountInfo> = ctx.remaining_accounts
        .iter()
        .filter(|acc| accounts_to_harvest.contains(&acc.key()))
        .cloned()
        .collect();

    if !harvest_accounts_infos.is_empty() {
        msg!("Harvesting withheld fees to mint...");
        
        let harvest_sources: Vec<&Pubkey> = accounts_to_harvest.iter().collect();
        let harvest_ix = spl_token_2022::extension::transfer_fee::instruction::harvest_withheld_tokens_to_mint(
            &spl_token_2022::ID,
            &ctx.accounts.token_mint.key(),
            &harvest_sources,
        )?;
        
        // Build accounts for invoke
        let mut invoke_accounts = vec![
            ctx.accounts.token_mint.to_account_info(),
        ];
        invoke_accounts.extend(harvest_accounts_infos.clone());
        
        // Invoke the harvest instruction
        solana_program::program::invoke(
            &harvest_ix,
            &invoke_accounts,
        )?;
    }

    // 2. Check the total amount of withheld fees now stored in the mint.
    let mint_data = ctx.accounts.token_mint.try_borrow_data()?;
    let mint_with_extension = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&mint_data)?;
    
    // Get the transfer fee config extension to read withheld amount
    if let Ok(fee_config) = mint_with_extension.get_extension::<spl_token_2022::extension::transfer_fee::TransferFeeConfig>() {
        let withheld_amount = u64::from(fee_config.withheld_amount);
        msg!("Total withheld amount in mint: {}", withheld_amount);

        if withheld_amount > 0 {
            // 3. Withdraw the fees from the mint to the vault's token account.
            // The vault program PDA must be the `withdraw_withheld_authority` for the mint.
            let seeds = &[VAULT_SEED, vault_state.token_mint.as_ref(), &[vault_state.bump]];
            let signer_seeds = &[&seeds[..]];

            let withdraw_ix = spl_token_2022::extension::transfer_fee::instruction::withdraw_withheld_tokens_from_mint(
                &spl_token_2022::ID,
                &ctx.accounts.token_mint.key(),
                &ctx.accounts.vault_token_account.key(),
                &vault_state.key(), // The vault PDA is the authority
                &[],
            )?;

            solana_program::program::invoke_signed(
                &withdraw_ix,
                &[
                    ctx.accounts.token_2022_program.to_account_info(),
                    ctx.accounts.token_mint.to_account_info(),
                    ctx.accounts.vault_token_account.to_account_info(),
                    vault_state.to_account_info(),
                ],
                signer_seeds,
            )?;
            
            total_harvested = withheld_amount;
            msg!("Withdrew {} from mint to vault", total_harvested);
        }
    }
    
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
            let seeds = &[VAULT_SEED, vault_state.token_mint.as_ref(), &[vault_state.bump]];
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
            let seeds = &[VAULT_SEED, vault_state.token_mint.as_ref(), &[vault_state.bump]];
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