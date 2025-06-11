use anchor_lang::prelude::*;

#[error_code]
pub enum SmartDialError {
    #[msg("Already initialized")]
    AlreadyInitialized,
    
    #[msg("Not initialized")]
    NotInitialized,
    
    #[msg("Unauthorized access - only keeper bot can perform this action")]
    UnauthorizedAccess,
    
    #[msg("Invalid reward token mint")]
    InvalidRewardTokenMint,
    
    #[msg("Invalid wallet address")]
    InvalidWalletAddress,
    
    #[msg("Twitter ID too long")]
    TwitterIdTooLong,
    
    #[msg("No changes requested")]
    NoChangesRequested,
}