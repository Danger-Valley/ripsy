use anchor_lang::prelude::*;

use ephemeral_rollups_sdk::{anchor::delegate, cpi::DelegateConfig};

use crate::helpers::AccountType;

#[delegate]
#[derive(Accounts)]
pub struct DelegatePda<'info> {
    /// CHECK: The PDA to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
    pub payer: Signer<'info>,
    /// CHECK: Checked by the delegate program
    pub validator: Option<AccountInfo<'info>>,
}
    
pub fn delegate_pda(ctx: Context<DelegatePda>, account_type: AccountType) -> Result<()> {
    let seed_data = account_type.derive_seeds();
    let seeds_refs: Vec<&[u8]> = seed_data.iter().map(|s| s.as_slice()).collect();

    let validator = ctx.accounts.validator.as_ref().map(|v| v.key());

    ctx.accounts.delegate_pda(
        &ctx.accounts.payer,
        &seeds_refs,
        DelegateConfig {
            validator,
            ..Default::default()
        },
    )?;

    Ok(())
}
