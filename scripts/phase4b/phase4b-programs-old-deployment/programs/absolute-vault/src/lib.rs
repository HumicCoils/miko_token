use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::{TokenAccount, TokenInterface};
use spl_token_2022::extension::transfer_fee::instruction::{
    harvest_withheld_tokens_to_mint, set_transfer_fee, withdraw_withheld_tokens_from_accounts,
};

declare_id!("C4N6rHoUxrFoXPnythgDY6qWNKsPqtcqLfwrdruV2mK4");

pub const VAULT_SEED: &[u8] = b"vault";
pub const MAX_EXCLUSIONS: u64 = 100;
pub const HARVEST_THRESHOLD: u64 = 500_000_000_000_000; // 500k MIKO with 9 decimals
pub const OWNER_TAX_SHARE: u64 = 20; // 20% to owner
pub const HOLDERS_TAX_SHARE: u64 = 80; // 80% to holders

#[program]
pub mod absolute_vault {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        authority: Pubkey,
        treasury: Pubkey,
        owner_wallet: Pubkey,
        keeper_authority: Pubkey,
        min_hold_amount: u64,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        vault.authority = authority;
        vault.treasury = treasury;
        vault.owner_wallet = owner_wallet;
        vault.token_mint = ctx.accounts.token_mint.key();
        vault.min_hold_amount = min_hold_amount;
        vault.keeper_authority = keeper_authority;
        vault.launch_timestamp = 0;
        vault.fee_finalized = false;
        vault.harvest_threshold = HARVEST_THRESHOLD;
        vault.total_fees_harvested = 0;
        vault.total_rewards_distributed = 0;
        vault.last_harvest_time = 0;
        vault.last_distribution_time = 0;
        
        // Auto-exclude system accounts
        vault.fee_exclusions = vec![
            owner_wallet,
            treasury,
            keeper_authority,
            crate::ID, // Vault program ID
            vault.key(), // Vault PDA
        ];
        
        vault.reward_exclusions = vec![
            owner_wallet,
            treasury,
            keeper_authority,
            crate::ID,
            vault.key(),
        ];
        
        msg!("Vault initialized with auto-exclusions");
        Ok(())
    }

    pub fn set_launch_time(ctx: Context<SetLaunchTime>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        require!(
            vault.launch_timestamp == 0,
            VaultError::AlreadyLaunched
        );
        
        vault.launch_timestamp = Clock::get()?.unix_timestamp;
        msg!("Launch timestamp set: {}", vault.launch_timestamp);
        
        Ok(())
    }

    pub fn update_transfer_fee(ctx: Context<UpdateTransferFee>, new_fee_bps: u16) -> Result<()> {
        let clock = Clock::get()?;
        
        let (token_mint_key, vault_key, expected_fee_bps) = {
            let vault = &mut ctx.accounts.vault;
            
            require!(
                vault.launch_timestamp > 0,
                VaultError::NotLaunched
            );
            
            require!(
                !vault.fee_finalized,
                VaultError::FeeFinalized
            );
            
            let elapsed = clock.unix_timestamp - vault.launch_timestamp;
            let expected_fee_bps = match elapsed {
                0..=299 => 3000u16,      // 0-5 minutes: 30%
                300..=599 => 1500u16,    // 5-10 minutes: 15%
                _ => {
                    vault.fee_finalized = true;
                    500u16               // 10+ minutes: 5% (final)
                }
            };
            
            (vault.token_mint, vault.key(), expected_fee_bps)
        };
        
        require!(
            new_fee_bps == expected_fee_bps,
            VaultError::InvalidFeePercentage
        );
        
        // CPI to update transfer fee
        let seeds = &[
            VAULT_SEED,
            token_mint_key.as_ref(),
            &[ctx.bumps.vault]
        ];
        let signer_seeds = &[&seeds[..]];
        
        let ix = set_transfer_fee(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.token_mint.key(),
            &vault_key,
            &[],
            new_fee_bps,
            u64::MAX,
        )?;
        
        invoke_signed(
            &ix,
            &[
                ctx.accounts.token_mint.to_account_info(),
                ctx.accounts.vault.to_account_info(),
            ],
            signer_seeds,
        )?;
        
        msg!("Transfer fee updated to {} basis points", new_fee_bps);
        
        Ok(())
    }

    pub fn harvest_fees<'info>(
        ctx: Context<'_, '_, '_, 'info, HarvestFees<'info>>, 
        accounts: Vec<Pubkey>
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        require!(
            accounts.len() > 0 && accounts.len() <= 20,
            VaultError::InvalidBatchSize
        );
        
        // Build harvest instruction
        let seeds = &[
            VAULT_SEED,
            vault.token_mint.as_ref(),
            &[ctx.bumps.vault]
        ];
        let signer_seeds = &[&seeds[..]];
        
        // Convert Vec<Pubkey> to Vec<&Pubkey>
        let account_refs: Vec<&Pubkey> = accounts.iter().collect();
        
        let ix = harvest_withheld_tokens_to_mint(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.token_mint.key(),
            &account_refs,
        )?;
        
        // Collect all account infos - first the mint, then all remaining accounts
        let mut account_infos = vec![ctx.accounts.token_mint.to_account_info()];
        account_infos.extend(ctx.remaining_accounts.iter().cloned());
        
        invoke_signed(
            &ix,
            &account_infos,
            signer_seeds,
        )?;
        
        vault.last_harvest_time = Clock::get()?.unix_timestamp;
        vault.total_fees_harvested = vault.total_fees_harvested.saturating_add(1);
        
        msg!("Harvested fees from {} accounts", accounts.len());
        
        Ok(())
    }

    pub fn distribute_rewards(
        ctx: Context<DistributeRewards>,
        owner_amount: u64,
        total_distributed: u64,
    ) -> Result<()> {
        let vault_ref = &ctx.accounts.vault;
        
        // Verify correct split: 20% to owner, 80% to holders
        let expected_owner_amount = total_distributed
            .checked_mul(OWNER_TAX_SHARE)
            .ok_or(VaultError::MathOverflow)?
            .checked_div(100)
            .ok_or(VaultError::MathOverflow)?;
        
        require!(
            owner_amount == expected_owner_amount,
            VaultError::InvalidDistributionSplit
        );
        
        // Transfer owner's share
        let seeds = &[
            VAULT_SEED,
            vault_ref.token_mint.as_ref(),
            &[ctx.bumps.vault]
        ];
        let signer_seeds = &[&seeds[..]];
        
        token_2022::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_2022::TransferChecked {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.owner_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            ),
            owner_amount,
            9, // MIKO decimals
        )?;
        
        // Update vault state
        let vault_mut = &mut ctx.accounts.vault;
        vault_mut.last_distribution_time = Clock::get()?.unix_timestamp;
        vault_mut.total_rewards_distributed = vault_mut.total_rewards_distributed
            .saturating_add(total_distributed);
        
        msg!("Distributed {} total rewards, {} to owner", total_distributed, owner_amount);
        
        Ok(())
    }

    pub fn manage_exclusions(
        ctx: Context<ManageExclusions>,
        action: ExclusionAction,
        list_type: ExclusionListType,
        wallet: Pubkey,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        let list = match list_type {
            ExclusionListType::Fee => &mut vault.fee_exclusions,
            ExclusionListType::Reward => &mut vault.reward_exclusions,
        };
        
        match action {
            ExclusionAction::Add => {
                require!(
                    list.len() < MAX_EXCLUSIONS as usize,
                    VaultError::ExclusionListFull
                );
                require!(
                    !list.contains(&wallet),
                    VaultError::AlreadyExcluded
                );
                list.push(wallet);
                msg!("Added {} to {:?} exclusions", wallet, list_type);
            }
            ExclusionAction::Remove => {
                list.retain(|&x| x != wallet);
                msg!("Removed {} from {:?} exclusions", wallet, list_type);
            }
        }
        
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_treasury: Option<Pubkey>,
        new_owner_wallet: Option<Pubkey>,
        new_min_hold_amount: Option<u64>,
        new_harvest_threshold: Option<u64>,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        if let Some(treasury) = new_treasury {
            vault.treasury = treasury;
        }
        if let Some(owner) = new_owner_wallet {
            vault.owner_wallet = owner;
        }
        if let Some(min_hold) = new_min_hold_amount {
            vault.min_hold_amount = min_hold;
        }
        if let Some(threshold) = new_harvest_threshold {
            vault.harvest_threshold = threshold;
        }
        
        msg!("Vault configuration updated");
        Ok(())
    }

    pub fn emergency_withdraw_vault(
        ctx: Context<EmergencyWithdraw>,
        amount: u64,
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;
        
        let seeds = &[
            VAULT_SEED,
            vault.token_mint.as_ref(),
            &[ctx.bumps.vault]
        ];
        let signer_seeds = &[&seeds[..]];
        
        token_2022::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_2022::TransferChecked {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.destination_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
            9, // MIKO decimals
        )?;
        
        msg!("Emergency withdrawal of {} tokens completed", amount);
        Ok(())
    }

    pub fn emergency_withdraw_withheld<'info>(
        ctx: Context<'_, '_, '_, 'info, EmergencyWithdrawWithheld<'info>>,
        accounts: Vec<Pubkey>,
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;
        
        require!(
            accounts.len() > 0 && accounts.len() <= 20,
            VaultError::InvalidBatchSize
        );
        
        let seeds = &[
            VAULT_SEED,
            vault.token_mint.as_ref(),
            &[ctx.bumps.vault]
        ];
        let signer_seeds = &[&seeds[..]];
        
        // Convert Vec<Pubkey> to Vec<&Pubkey>
        let account_refs: Vec<&Pubkey> = accounts.iter().collect();
        
        let ix = withdraw_withheld_tokens_from_accounts(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.token_mint.key(),
            &ctx.accounts.destination_token_account.key(),
            &vault.key(),
            &[],
            &account_refs,
        )?;
        
        // Collect all account infos properly
        let mut account_infos = vec![
            ctx.accounts.token_mint.to_account_info(),
            ctx.accounts.destination_token_account.to_account_info(),
            ctx.accounts.vault.to_account_info(),
        ];
        account_infos.extend(ctx.remaining_accounts.iter().cloned());
        
        invoke_signed(
            &ix,
            &account_infos,
            signer_seeds,
        )?;
        
        msg!("Emergency withdrawal of withheld tokens from {} accounts", accounts.len());
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + VaultState::INIT_SPACE,
        seeds = [VAULT_SEED, token_mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, VaultState>,
    
    /// CHECK: Token mint address
    pub token_mint: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetLaunchTime<'info> {
    #[account(
        mut,
        constraint = vault.authority == authority.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, VaultState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateTransferFee<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.token_mint.as_ref()],
        bump,
        constraint = vault.keeper_authority == keeper.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, VaultState>,
    
    pub keeper: Signer<'info>,
    
    /// CHECK: Token mint
    #[account(mut)]
    pub token_mint: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct HarvestFees<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.token_mint.as_ref()],
        bump,
        constraint = vault.keeper_authority == keeper.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, VaultState>,
    
    pub keeper: Signer<'info>,
    
    /// CHECK: Token mint
    #[account(mut)]
    pub token_mint: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct DistributeRewards<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.token_mint.as_ref()],
        bump,
        constraint = vault.keeper_authority == keeper.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, VaultState>,
    
    pub keeper: Signer<'info>,
    
    #[account(mut)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(mut)]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// CHECK: Token mint
    pub token_mint: UncheckedAccount<'info>,
    
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ManageExclusions<'info> {
    #[account(
        mut,
        constraint = vault.authority == authority.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, VaultState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        constraint = vault.authority == authority.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, VaultState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct EmergencyWithdraw<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.token_mint.as_ref()],
        bump,
        constraint = vault.authority == authority.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, VaultState>,
    
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(mut)]
    pub destination_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// CHECK: Token mint
    pub token_mint: UncheckedAccount<'info>,
    
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct EmergencyWithdrawWithheld<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.token_mint.as_ref()],
        bump,
        constraint = vault.authority == authority.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, VaultState>,
    
    pub authority: Signer<'info>,
    
    /// CHECK: Token mint
    #[account(mut)]
    pub token_mint: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub destination_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token2022>,
}

#[account]
#[derive(InitSpace)]
pub struct VaultState {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub owner_wallet: Pubkey,
    pub token_mint: Pubkey,
    pub min_hold_amount: u64,
    #[max_len(100)]
    pub fee_exclusions: Vec<Pubkey>,
    #[max_len(100)]
    pub reward_exclusions: Vec<Pubkey>,
    pub keeper_authority: Pubkey,
    pub launch_timestamp: i64,
    pub fee_finalized: bool,
    pub harvest_threshold: u64,
    pub total_fees_harvested: u64,
    pub total_rewards_distributed: u64,
    pub last_harvest_time: i64,
    pub last_distribution_time: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ExclusionAction {
    Add,
    Remove,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExclusionListType {
    Fee,
    Reward,
}

#[error_code]
pub enum VaultError {
    #[msg("Unauthorized")]
    Unauthorized,
    
    #[msg("Already launched")]
    AlreadyLaunched,
    
    #[msg("Not launched yet")]
    NotLaunched,
    
    #[msg("Fee already finalized")]
    FeeFinalized,
    
    #[msg("Exclusion list full")]
    ExclusionListFull,
    
    #[msg("Already excluded")]
    AlreadyExcluded,
    
    #[msg("Invalid fee percentage")]
    InvalidFeePercentage,
    
    #[msg("Harvest threshold not met")]
    HarvestThresholdNotMet,
    
    #[msg("Invalid batch size")]
    InvalidBatchSize,
    
    #[msg("Math overflow")]
    MathOverflow,
    
    #[msg("Invalid distribution split")]
    InvalidDistributionSplit,
}
