use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Not initialized")]
    NotInitialized,
    
    #[msg("Unauthorized access")]
    UnauthorizedAccess,
    
    #[msg("Math overflow")]
    MathOverflow,
    
    #[msg("Invalid token mint")]
    InvalidTokenMint,
    
    #[msg("Holder registry full")]
    HolderRegistryFull,
    
    #[msg("Wallet already excluded")]
    WalletAlreadyExcluded,
    
    #[msg("Wallet not excluded")]
    WalletNotExcluded,
    
    #[msg("Invalid exclusion type")]
    InvalidExclusionType,
    
    #[msg("No fees to collect")]
    NoFeesToCollect,
    
    #[msg("Invalid holder data")]
    InvalidHolderData,
}