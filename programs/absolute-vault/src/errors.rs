use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Already initialized")]
    AlreadyInitialized,
    
    #[msg("Not initialized")]
    NotInitialized,
    
    #[msg("Invalid tax configuration")]
    InvalidTaxConfig,
    
    #[msg("Insufficient funds for distribution")]
    InsufficientFunds,
    
    #[msg("Invalid holder registry")]
    InvalidHolderRegistry,
    
    #[msg("Holder registry chunk full")]
    HolderRegistryChunkFull,
    
    #[msg("Invalid chunk ID")]
    InvalidChunkId,
    
    #[msg("No eligible holders")]
    NoEligibleHolders,
    
    #[msg("Unauthorized access")]
    UnauthorizedAccess,
    
    #[msg("Math overflow")]
    MathOverflow,
    
    #[msg("Invalid token mint")]
    InvalidTokenMint,
    
    #[msg("Invalid reward amount")]
    InvalidRewardAmount,
}