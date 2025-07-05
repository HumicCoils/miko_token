use anchor_lang::prelude::*;

#[error_code]
pub enum DialError {
    #[msg("The Smart Dial has already been initialized")]
    AlreadyInitialized,
    
    #[msg("Unauthorized: Only the authority can perform this action")]
    Unauthorized,
    
    #[msg("Invalid reward token provided")]
    InvalidRewardToken,
    
    #[msg("Invalid treasury wallet provided")]
    InvalidTreasury,
    
    #[msg("Update too frequent: Must wait at least 1 day between updates")]
    UpdateTooFrequent,
    
    #[msg("Maximum update records reached")]
    MaxUpdateRecordsReached,
    
    #[msg("Smart Dial not initialized")]
    NotInitialized,
}