use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("AbsV1111111111111111111111111111111111111111");

#[program]
pub mod absolute_vault {
    use super::*;

    /// Initialize the Absolute Vault program
    /// This sets up the vault configuration and automatically adds system accounts to exclusion lists
    pub fn initialize(
        ctx: Context<Initialize>,
        params: InitializeParams,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Harvest withheld fees from token accounts
    /// Collects fees from accounts not in the fee_exclusions list
    pub fn harvest_fees(
        ctx: Context<HarvestFees>,
        accounts_to_harvest: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::harvest_fees::handler(ctx, accounts_to_harvest)
    }

    /// Distribute rewards to eligible holders
    /// Holders must have >= $100 worth of MIKO and not be in reward_exclusions list
    pub fn distribute_rewards(
        ctx: Context<DistributeRewards>,
        holder_data: Vec<HolderData>,
    ) -> Result<()> {
        instructions::distribute_rewards::handler(ctx, holder_data)
    }

    /// Manage exclusion lists (add/remove wallets)
    /// Supports FEE_ONLY, REWARD_ONLY, or BOTH exclusion types
    pub fn manage_exclusions(
        ctx: Context<ManageExclusions>,
        wallet: Pubkey,
        exclusion_type: ExclusionType,
        action: ExclusionAction,
    ) -> Result<()> {
        instructions::manage_exclusions::handler(ctx, wallet, exclusion_type, action)
    }

    /// Update vault configuration
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        params: UpdateConfigParams,
    ) -> Result<()> {
        instructions::update_config::handler(ctx, params)
    }

    /// Emergency withdraw from vault accounts
    /// Authority-only function for maintenance
    pub fn emergency_withdraw_vault(
        ctx: Context<EmergencyWithdrawVault>,
        amount: u64,
    ) -> Result<()> {
        instructions::emergency_withdraw_vault::handler(ctx, amount)
    }

    /// Emergency withdraw withheld fees from specific token accounts
    /// Authority-only function for recovering stuck fees
    pub fn emergency_withdraw_withheld(
        ctx: Context<EmergencyWithdrawWithheld>,
        accounts_to_withdraw: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::emergency_withdraw_withheld::handler(ctx, accounts_to_withdraw)
    }

    /// Initialize system exclusions after vault initialization
    pub fn initialize_system_exclusions(
        ctx: Context<InitializeSystemExclusions>,
    ) -> Result<()> {
        instructions::initialize::initialize_system_exclusions(ctx)
    }

    /// Update vault authority
    pub fn update_authority(
        ctx: Context<UpdateAuthority>,
    ) -> Result<()> {
        instructions::update_config::update_authority(ctx)
    }

    /// Check exclusion status for a wallet
    pub fn check_exclusion(
        ctx: Context<CheckExclusion>,
    ) -> Result<(bool, bool)> {
        instructions::manage_exclusions::check_exclusion(ctx)
    }

    /// Emergency withdraw all funds from a vault account
    pub fn emergency_withdraw_all(
        ctx: Context<EmergencyWithdrawAll>,
    ) -> Result<()> {
        instructions::emergency_withdraw_vault::emergency_withdraw_all(ctx)
    }

    /// Harvest withheld tokens to mint without withdrawing
    pub fn harvest_withheld_to_mint(
        ctx: Context<HarvestWithheldToMint>,
        accounts_to_harvest: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::emergency_withdraw_withheld::harvest_withheld_to_mint(ctx, accounts_to_harvest)
    }
}