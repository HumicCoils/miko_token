use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Unauthorized access")]
    Unauthorized,
    
    #[msg("Invalid authority")]
    InvalidAuthority,
    
    #[msg("Invalid token mint")]
    InvalidTokenMint,
    
    #[msg("Insufficient balance")]
    InsufficientBalance,
    
    #[msg("Account already excluded")]
    AlreadyExcluded,
    
    #[msg("Account not excluded")]
    NotExcluded,
    
    #[msg("Invalid exclusion type")]
    InvalidExclusionType,
    
    #[msg("Too many accounts to process")]
    TooManyAccounts,
    
    #[msg("Invalid holder data")]
    InvalidHolderData,
    
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    
    #[msg("Invalid fee configuration")]
    InvalidFeeConfig,
    
    #[msg("Cannot exclude system account")]
    CannotExcludeSystemAccount,
    
    #[msg("Cannot remove system account exclusion")]
    CannotRemoveSystemExclusion,
    
    #[msg("Invalid withdraw amount")]
    InvalidWithdrawAmount,
    
    #[msg("Token account not found")]
    TokenAccountNotFound,
    
    #[msg("Invalid reward token")]
    InvalidRewardToken,
}