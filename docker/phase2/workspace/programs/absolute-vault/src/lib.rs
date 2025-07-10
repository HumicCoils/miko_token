use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub mod state;
pub mod constants;
pub mod errors;
pub mod instructions;

use crate::instructions::*;

#[program]
pub mod absolute_vault {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        min_hold_amount: u64,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, min_hold_amount)
    }
    
    pub fn harvest_fees(ctx: Context<HarvestFees>) -> Result<()> {
        instructions::harvest_fees::handler(ctx)
    }
    
    pub fn distribute_rewards(
        ctx: Context<DistributeRewards>,
        holder_balance: u64,
        total_eligible_balance: u64,
        reward_token_is_sol: bool,
    ) -> Result<()> {
        instructions::distribute_rewards::handler(ctx, holder_balance, total_eligible_balance, reward_token_is_sol)
    }
    
    pub fn manage_exclusions(
        ctx: Context<ManageExclusions>,
        wallet: Pubkey,
        exclusion_type: u8,
        action: bool,
    ) -> Result<()> {
        instructions::manage_exclusions::handler(ctx, wallet, exclusion_type, action)
    }
    
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_min_hold_amount: Option<u64>,
    ) -> Result<()> {
        instructions::update_config::handler(ctx, new_min_hold_amount)
    }
    
    pub fn emergency_withdraw_vault(
        ctx: Context<EmergencyWithdrawVault>,
        withdraw_sol: bool,
        amount: Option<u64>,
    ) -> Result<()> {
        instructions::emergency_withdraw_vault::handler(ctx, withdraw_sol, amount)
    }
    
    pub fn emergency_withdraw_withheld(
        ctx: Context<EmergencyWithdrawWithheld>
    ) -> Result<()> {
        instructions::emergency_withdraw_withheld::handler(ctx)
    }
}
