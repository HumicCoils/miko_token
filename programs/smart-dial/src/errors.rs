use anchor_lang::prelude::*;

#[error_code]
pub enum DialError {
    #[msg("Invalid token symbol length")]
    InvalidTokenSymbol,
    
    #[msg("Unauthorized access")]
    UnauthorizedAccess,
}