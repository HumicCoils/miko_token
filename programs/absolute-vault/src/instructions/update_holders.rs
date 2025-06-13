use anchor_lang::prelude::*;
use crate::{constants::*, errors::VaultError, state::{TaxConfig, HolderRegistry, HolderInfo, RewardExclusions}};

#[derive(Accounts)]
#[instruction(chunk_id: u8)]
pub struct UpdateHolders<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        seeds = [TAX_CONFIG_SEED],
        bump = tax_config.bump,
        constraint = tax_config.initialized @ VaultError::NotInitialized
    )]
    pub tax_config: Account<'info, TaxConfig>,
    
    #[account(
        init_if_needed,
        payer = authority,
        space = HolderRegistry::space(MAX_HOLDERS_PER_CHUNK),
        seeds = [HOLDER_REGISTRY_SEED, &chunk_id.to_le_bytes()],
        bump
    )]
    pub holder_registry: Account<'info, HolderRegistry>,
    
    #[account(
        seeds = [b"reward_exclusions"],
        bump
    )]
    pub reward_exclusions: Option<Account<'info, RewardExclusions>>,
    
    pub system_program: Program<'info, System>,
    /// CHECK: Token-2022 program
    pub token_2022_program: UncheckedAccount<'info>,
}

pub fn handler(
    ctx: Context<UpdateHolders>,
    chunk_id: u8,
    start_index: u32,
    batch_size: u32,
    min_holder_threshold: u64,
) -> Result<()> {
    let holder_registry = &mut ctx.accounts.holder_registry;
    let clock = Clock::get()?;
    
    // Initialize if new
    if holder_registry.chunk_id == 0 && holder_registry.eligible_holders.is_empty() {
        holder_registry.chunk_id = chunk_id;
        holder_registry.last_snapshot_slot = clock.slot;
        holder_registry.total_eligible_balance = 0;
        holder_registry.next_chunk = None;
    }
    
    // Validate chunk_id
    require!(
        holder_registry.chunk_id == chunk_id,
        VaultError::InvalidChunkId
    );
    
    // Clear existing holders for this update
    holder_registry.eligible_holders.clear();
    holder_registry.total_eligible_balance = 0;
    
    // TODO: In production, this would iterate through token accounts
    // For now, we'll simulate with placeholder logic
    
    // Update snapshot slot
    holder_registry.last_snapshot_slot = clock.slot;
    
    msg!("Updated holder registry chunk {} with {} holders, total balance: {}", 
        chunk_id, 
        holder_registry.eligible_holders.len(),
        holder_registry.total_eligible_balance
    );
    
    Ok(())
}

impl UpdateHolders<'_> {
    pub fn add_holder(
        holder_registry: &mut Account<HolderRegistry>,
        address: Pubkey,
        balance: u64,
        min_holder_threshold: u64,
        reward_exclusions: &Option<Account<RewardExclusions>>,
    ) -> Result<()> {
        // Check if holder meets threshold
        if balance < min_holder_threshold {
            return Ok(());
        }
        
        // Check if holder is excluded from rewards
        if let Some(exclusions) = reward_exclusions {
            if exclusions.is_excluded(&address) {
                return Ok(());
            }
        }
        
        // Check if registry is full
        require!(
            holder_registry.eligible_holders.len() < MAX_HOLDERS_PER_CHUNK,
            VaultError::HolderRegistryChunkFull
        );
        
        // Add holder
        holder_registry.eligible_holders.push(HolderInfo {
            address,
            balance,
            reward_share: 0, // Will be calculated during distribution
        });
        
        // Update total balance
        holder_registry.total_eligible_balance = holder_registry
            .total_eligible_balance
            .checked_add(balance)
            .ok_or(VaultError::MathOverflow)?;
        
        Ok(())
    }
}