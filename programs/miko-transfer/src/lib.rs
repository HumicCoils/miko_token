use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("6THY8LLbyALh8mTQqKgKofVzo6VVq7sCZbFUnVWfpj6g");

#[program]
pub mod miko_transfer {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        miko_token_mint: Pubkey,
        absolute_vault_program: Pubkey,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, miko_token_mint, absolute_vault_program)
    }

    pub fn transfer_with_tax(
        ctx: Context<TransferWithTax>,
        amount: u64,
    ) -> Result<()> {
        instructions::transfer::handler(ctx, amount)
    }

    pub fn transfer_checked_with_tax(
        ctx: Context<TransferWithTax>,
        amount: u64,
        decimals: u8,
    ) -> Result<()> {
        instructions::transfer::handler_checked(ctx, amount, decimals)
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_absolute_vault_program: Option<Pubkey>,
        new_tax_holding_account: Option<Pubkey>,
    ) -> Result<()> {
        instructions::update_config::handler(ctx, new_absolute_vault_program, new_tax_holding_account)
    }
}