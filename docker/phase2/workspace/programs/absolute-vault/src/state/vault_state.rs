use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct VaultState {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub owner_wallet: Pubkey,
    pub token_mint: Pubkey,
    pub min_hold_amount: u64,
    pub fee_exclusions: Vec<Pubkey>,
    pub reward_exclusions: Vec<Pubkey>,
    pub total_fees_collected: u64,
    pub total_rewards_distributed: u64,
    pub last_harvest_timestamp: i64,
    pub last_distribution_timestamp: i64,
    pub initialized: bool,
    pub bump: u8,
}

impl VaultState {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // treasury
        32 + // owner_wallet
        32 + // token_mint
        8 + // min_hold_amount
        4 + (32 * 100) + // fee_exclusions (max 100)
        4 + (32 * 100) + // reward_exclusions (max 100)
        8 + // total_fees_collected
        8 + // total_rewards_distributed
        8 + // last_harvest_timestamp
        8 + // last_distribution_timestamp
        1 + // initialized
        1; // bump
        
    pub fn add_fee_exclusion(&mut self, address: Pubkey) -> Result<()> {
        require!(
            self.fee_exclusions.len() < 100,
            crate::errors::VaultError::ExclusionListFull
        );
        require!(
            !self.fee_exclusions.contains(&address),
            crate::errors::VaultError::AddressAlreadyExcluded
        );
        self.fee_exclusions.push(address);
        Ok(())
    }
    
    pub fn remove_fee_exclusion(&mut self, address: &Pubkey) -> Result<()> {
        let pos = self.fee_exclusions.iter().position(|x| x == address)
            .ok_or(crate::errors::VaultError::AddressNotExcluded)?;
        self.fee_exclusions.remove(pos);
        Ok(())
    }
    
    pub fn add_reward_exclusion(&mut self, address: Pubkey) -> Result<()> {
        require!(
            self.reward_exclusions.len() < 100,
            crate::errors::VaultError::ExclusionListFull
        );
        require!(
            !self.reward_exclusions.contains(&address),
            crate::errors::VaultError::AddressAlreadyExcluded
        );
        self.reward_exclusions.push(address);
        Ok(())
    }
    
    pub fn remove_reward_exclusion(&mut self, address: &Pubkey) -> Result<()> {
        let pos = self.reward_exclusions.iter().position(|x| x == address)
            .ok_or(crate::errors::VaultError::AddressNotExcluded)?;
        self.reward_exclusions.remove(pos);
        Ok(())
    }
    
    pub fn is_fee_excluded(&self, address: &Pubkey) -> bool {
        self.fee_exclusions.contains(address)
    }
    
    pub fn is_reward_excluded(&self, address: &Pubkey) -> bool {
        self.reward_exclusions.contains(address)
    }
}
