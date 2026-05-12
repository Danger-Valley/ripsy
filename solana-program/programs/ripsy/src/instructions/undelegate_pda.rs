use anchor_lang::prelude::*;

use ephemeral_rollups_sdk::{anchor::commit, ephem::commit_and_undelegate_accounts};

#[commit]
#[derive(Accounts)]
pub struct UndelegatePda<'info> {
    /// CHECK: The PDA to delegate
    #[account(mut)]
    pub pda: AccountInfo<'info>,
    pub payer: Signer<'info>,
}
    
pub fn undelegate_pda(ctx: Context<UndelegatePda>) -> Result<()> {
    commit_and_undelegate_accounts(
        &ctx.accounts.payer.to_account_info(), 
        vec![&ctx.accounts.pda.to_account_info()], 
        &ctx.accounts.magic_context, 
        &ctx.accounts.magic_program,
        None
    )?;

    Ok(())
}
