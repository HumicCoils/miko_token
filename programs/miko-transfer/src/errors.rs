use anchor_lang::prelude::*;

#[error_code]
pub enum TransferError {
    #[msg("Program is not initialized")]
    NotInitialized,
    
    #[msg("Invalid token mint")]
    InvalidTokenMint,
    
    #[msg("Insufficient balance for transfer and tax")]
    InsufficientBalance,
    
    #[msg("Overflow in tax calculation")]
    TaxCalculationOverflow,
    
    #[msg("Unauthorized access")]
    UnauthorizedAccess,
    
    #[msg("Invalid decimals")]
    InvalidDecimals,
}