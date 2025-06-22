use anchor_lang::prelude::*;
use crate::{errors::VaultError, state::TaxExemptions};

#[derive(Accounts)]
pub struct CheckExemption<'info> {
    /// CHECK: The wallet to check for tax exemption
    pub wallet: UncheckedAccount<'info>,
    
    #[account(
        seeds = [b"tax_exemptions"],
        bump = tax_exemptions.bump,
        constraint = tax_exemptions.authority != Pubkey::default() @ VaultError::NotInitialized
    )]
    pub tax_exemptions: Account<'info, TaxExemptions>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ExemptionStatus {
    pub is_tax_exempt: bool,
}

pub fn handler(ctx: Context<CheckExemption>) -> Result<ExemptionStatus> {
    let tax_exemptions = &ctx.accounts.tax_exemptions;
    let wallet = ctx.accounts.wallet.key();
    
    // Check if wallet is in tax exemptions list
    let is_tax_exempt = tax_exemptions.is_exempt(&wallet);
    
    msg!("Exemption check for {}: tax_exempt={}", wallet, is_tax_exempt);
    
    Ok(ExemptionStatus { is_tax_exempt })
}