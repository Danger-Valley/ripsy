use anchor_lang::prelude::*;

use ephemeral_rollups_sdk::{
    access_control::{
        instructions::ClosePermissionCpiBuilder, 
    },
    consts::PERMISSION_PROGRAM_ID
};

use crate::helpers::AccountType;

#[derive(Accounts)]
pub struct ClosePermission<'info> {
    /// CHECK: Validated via permission program CPI
    pub permissioned_account: UncheckedAccount<'info>,
    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: PERMISSION PROGRAM
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
}

pub fn close_permission(
    ctx: Context<ClosePermission>,
    account_type: AccountType,
) -> Result<()> {
    let ClosePermission {
        permissioned_account,
        permission,
        payer,
        permission_program,
    } = ctx.accounts;

    let seed_data = account_type.derive_seeds();

    let (_, bump) = Pubkey::find_program_address(
        &seed_data.iter().map(|s| s.as_slice()).collect::<Vec<_>>(),
        &crate::ID,
    );

    let mut seeds = seed_data.clone();
    seeds.push(vec![bump]);
    let seed_refs: Vec<&[u8]> = seeds.iter().map(|s| s.as_slice()).collect();

    ClosePermissionCpiBuilder::new(&permission_program)
        .permissioned_account(&permissioned_account.to_account_info(), true)
        .permission(&permission)
        .payer(&payer)
        .authority(&permissioned_account.to_account_info(), true)
        .invoke_signed(&[seed_refs.as_slice()])?;

    Ok(())
}
