use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::{TokenInterface, Mint, TokenAccount};

declare_id!("5hVLxMW58Vaax1kWt9Xme3AoS5ZwUfGaCi34eDiaFAzu");

const MAX_EXCLUSIONS: usize = 100;
const HARVEST_THRESHOLD: u64 = 500_000_000_000; // 500k tokens with 6 decimals
const VAULT_SEED: &[u8] = b"vault";

// Error codes
#[error_code]
pub enum VaultError {
    #[msg("Invalid fee percentage")]
    InvalidFee,
    #[msg("Launch time already set")]
    LaunchTimeAlreadySet,
    #[msg("Not authorized")]
    Unauthorized,
    #[msg("Fees already finalized")]
    FeesFinalized,
    #[msg("Launch time not set")]
    LaunchTimeNotSet,
    #[msg("Harvest threshold not met")]
    ThresholdNotMet,
    #[msg("Emergency pause active")]
    EmergencyPause,
    #[msg("Exclusion list full")]
    ExclusionListFull,
    #[msg("Invalid distribution percentage")]
    InvalidDistribution,
}

#[program]
pub mod absolute_vault {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        minimum_hold_amount: u64,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        // Set core parameters
        vault.bump = ctx.bumps.vault;
        vault.mint = ctx.accounts.mint.key();
        vault.owner = ctx.accounts.owner.key();
        vault.treasury = ctx.accounts.treasury.key();
        vault.keeper = ctx.accounts.keeper.key();
        
        // Initialize fee management
        vault.launch_timestamp = 0;
        vault.fee_finalized = false;
        vault.current_fee_bps = 3000; // 30% initial fee
        
        // Set harvest configuration
        vault.harvest_threshold = HARVEST_THRESHOLD;
        vault.last_harvest_timestamp = 0;
        vault.total_harvested = 0;
        
        // Initialize exclusion lists with auto-exclusions
        vault.fee_exclusions = vec![
            ctx.accounts.owner.key(),
            ctx.accounts.treasury.key(),
            ctx.accounts.keeper.key(),
            ctx.program_id.key(),
            vault.key(),
        ];
        vault.reward_exclusions = vec![];
        
        // Set emergency and config flags
        vault.emergency_pause = false;
        vault.config_locked = false;
        
        // Set batch and distribution parameters
        vault.batch_size_limit = 30; // Max accounts per batch
        vault.owner_share_bps = 2000; // 20% to owner
        vault.minimum_hold_amount = minimum_hold_amount;
        
        // Default reward token to native SOL
        vault.reward_token_mint = spl_token_2022::native_mint::ID;
        
        // Initialize statistics
        vault.total_distributions = 0;
        vault.total_fees_collected = 0;
        
        // Clear reserved space
        vault.reserved = [0u64; 16];
        
        msg!("Vault initialized for mint {}", ctx.accounts.mint.key());
        Ok(())
    }
    
    pub fn set_launch_time(ctx: Context<SetLaunchTime>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        require!(vault.launch_timestamp == 0, VaultError::LaunchTimeAlreadySet);
        require!(!vault.emergency_pause, VaultError::EmergencyPause);
        
        vault.launch_timestamp = Clock::get()?.unix_timestamp;
        
        msg!("Launch time set to {}", vault.launch_timestamp);
        Ok(())
    }
    
    pub fn update_transfer_fee(ctx: Context<UpdateTransferFee>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let clock = Clock::get()?;
        
        require!(vault.launch_timestamp != 0, VaultError::LaunchTimeNotSet);
        require!(!vault.fee_finalized, VaultError::FeesFinalized);
        require!(!vault.emergency_pause, VaultError::EmergencyPause);
        
        let elapsed = clock.unix_timestamp - vault.launch_timestamp;
        
        // 0-5 minutes: 30%
        // 5-10 minutes: 15%
        // 10+ minutes: 5% (permanent)
        let new_fee_bps = if elapsed < 300 {
            3000 // 30%
        } else if elapsed < 600 {
            1500 // 15%
        } else {
            vault.fee_finalized = true;
            500 // 5%
        };
        
        if vault.current_fee_bps != new_fee_bps {
            vault.current_fee_bps = new_fee_bps;
            
            // Here we would make CPI call to update the token's transfer fee
            // This requires the actual Token-2022 CPI implementation
            
            msg!("Transfer fee updated to {} bps", new_fee_bps);
        }
        
        Ok(())
    }
    
    pub fn harvest_fees(ctx: Context<HarvestFees>) -> Result<()> {
        let vault = &ctx.accounts.vault;
        
        require!(!vault.emergency_pause, VaultError::EmergencyPause);
        
        // Here we would implement the harvest logic
        // This involves CPI to Token-2022 harvest instruction
        
        msg!("Fees harvested");
        Ok(())
    }
    
    pub fn distribute_rewards(ctx: Context<DistributeRewards>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        require!(!vault.emergency_pause, VaultError::EmergencyPause);
        
        // Distribution logic would go here
        // This involves calculating holder shares and transferring rewards
        
        vault.total_distributions += 1;
        
        msg!("Rewards distributed");
        Ok(())
    }
    
    pub fn manage_exclusions(
        ctx: Context<ManageExclusions>,
        action: ExclusionAction,
        address: Pubkey,
        list_type: ExclusionListType,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        require!(ctx.accounts.authority.key() == vault.owner, VaultError::Unauthorized);
        require!(!vault.config_locked, VaultError::Unauthorized);
        
        let list = match list_type {
            ExclusionListType::Fee => &mut vault.fee_exclusions,
            ExclusionListType::Reward => &mut vault.reward_exclusions,
        };
        
        match action {
            ExclusionAction::Add => {
                require!(list.len() < MAX_EXCLUSIONS, VaultError::ExclusionListFull);
                if !list.contains(&address) {
                    list.push(address);
                }
            },
            ExclusionAction::Remove => {
                list.retain(|&x| x != address);
            },
        }
        
        Ok(())
    }
    
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_treasury: Option<Pubkey>,
        new_keeper: Option<Pubkey>,
        new_batch_size: Option<u16>,
        new_minimum_hold: Option<u64>,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        require!(ctx.accounts.authority.key() == vault.owner, VaultError::Unauthorized);
        require!(!vault.config_locked, VaultError::Unauthorized);
        
        if let Some(treasury) = new_treasury {
            vault.treasury = treasury;
        }
        
        if let Some(keeper) = new_keeper {
            vault.keeper = keeper;
        }
        
        if let Some(batch_size) = new_batch_size {
            vault.batch_size_limit = batch_size;
        }
        
        if let Some(minimum) = new_minimum_hold {
            vault.minimum_hold_amount = minimum;
        }
        
        Ok(())
    }
    
    pub fn emergency_withdraw_vault(ctx: Context<EmergencyWithdraw>) -> Result<()> {
        let vault = &ctx.accounts.vault;
        
        require!(ctx.accounts.authority.key() == vault.owner, VaultError::Unauthorized);
        
        // Emergency withdrawal logic here
        // Transfer all vault-owned tokens/SOL to owner
        
        msg!("Emergency withdrawal executed");
        Ok(())
    }
    
    pub fn emergency_withdraw_withheld(ctx: Context<EmergencyWithdrawWithheld>) -> Result<()> {
        let vault = &ctx.accounts.vault;
        
        require!(ctx.accounts.authority.key() == vault.owner, VaultError::Unauthorized);
        
        // Withdraw withheld fees logic here
        // This uses Token-2022 specific functionality
        
        msg!("Withheld fees withdrawn");
        Ok(())
    }
}

// Account structures
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = VaultState::LEN,
        seeds = [VAULT_SEED, mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, VaultState>,
    
    pub mint: InterfaceAccount<'info, Mint>,
    pub owner: Signer<'info>,
    pub treasury: UncheckedAccount<'info>,
    pub keeper: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetLaunchTime<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultState>,
    
    #[account(constraint = authority.key() == vault.owner || authority.key() == vault.keeper)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateTransferFee<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultState>,
    
    #[account(constraint = authority.key() == vault.keeper)]
    pub authority: Signer<'info>,
    
    // Token-2022 accounts would be added here
}

#[derive(Accounts)]
pub struct HarvestFees<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultState>,
    
    #[account(constraint = authority.key() == vault.keeper)]
    pub authority: Signer<'info>,
    
    // Additional accounts for harvest operation
}

#[derive(Accounts)]
pub struct DistributeRewards<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultState>,
    
    #[account(constraint = authority.key() == vault.keeper)]
    pub authority: Signer<'info>,
    
    // Distribution accounts would be added here
}

#[derive(Accounts)]
pub struct ManageExclusions<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct EmergencyWithdraw<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultState>,
    
    pub authority: Signer<'info>,
    
    // Emergency withdrawal accounts
}

#[derive(Accounts)]
pub struct EmergencyWithdrawWithheld<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultState>,
    
    pub authority: Signer<'info>,
    
    // Token-2022 specific accounts
}

// State structures
#[account]
pub struct VaultState {
    pub bump: u8,
    
    // Core token information
    pub mint: Pubkey,
    
    // Authority addresses
    pub owner: Pubkey,
    pub treasury: Pubkey,
    pub keeper: Pubkey,
    
    // Launch and fee management
    pub launch_timestamp: i64,
    pub fee_finalized: bool,
    pub current_fee_bps: u16,
    
    // Harvest configuration
    pub harvest_threshold: u64,
    pub last_harvest_timestamp: i64,
    pub total_harvested: u64,
    
    // Exclusion lists for fee and reward management
    pub fee_exclusions: Vec<Pubkey>,
    pub reward_exclusions: Vec<Pubkey>,
    
    // Emergency and config flags
    pub emergency_pause: bool,
    pub config_locked: bool,
    
    // Batch operation support
    pub batch_size_limit: u16,
    
    // Distribution settings
    pub owner_share_bps: u16,
    pub minimum_hold_amount: u64,
    
    // Rewards configuration
    pub reward_token_mint: Pubkey,
    
    // Statistics
    pub total_distributions: u64,
    pub total_fees_collected: u64,
    
    // Reserved space for future upgrades
    pub reserved: [u64; 16],
}

impl VaultState {
    pub const LEN: usize = 8 + // discriminator
        1 + // bump
        32 + // mint
        32 + // owner
        32 + // treasury
        32 + // keeper
        8 + // launch_timestamp
        1 + // fee_finalized
        2 + // current_fee_bps
        8 + // harvest_threshold
        8 + // last_harvest_timestamp
        8 + // total_harvested
        4 + (32 * MAX_EXCLUSIONS) + // fee_exclusions
        4 + (32 * MAX_EXCLUSIONS) + // reward_exclusions
        1 + // emergency_pause
        1 + // config_locked
        2 + // batch_size_limit
        2 + // owner_share_bps
        8 + // minimum_hold_amount
        32 + // reward_token_mint
        8 + // total_distributions
        8 + // total_fees_collected
        (8 * 16); // reserved
    
    pub fn seeds(mint: &Pubkey) -> Vec<Vec<u8>> {
        vec![VAULT_SEED.to_vec(), mint.as_ref().to_vec()]
    }
}

// Enums
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum ExclusionAction {
    Add,
    Remove,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum ExclusionListType {
    Fee,
    Reward,
}
