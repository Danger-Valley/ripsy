use anchor_lang::prelude::*;

use ephemeral_rollups_sdk::{
    access_control::{instructions::CreatePermissionCpiBuilder, structs::{Member, MembersArgs}},
    consts::PERMISSION_PROGRAM_ID,
};

use crate::helpers::AccountType;

#[derive(Accounts)]
pub struct CreatePermission<'info> {
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
    pub system_program: Program<'info, System>,
}

pub fn create_permission(
    ctx: Context<CreatePermission>,
    account_type: AccountType,
    members: Option<Vec<Member>>,
) -> Result<()> {
    let CreatePermission {
        permissioned_account,
        permission,
        payer,
        permission_program,
        system_program,
    } = ctx.accounts;

    let seed_data = account_type.derive_seeds();

    let (_, bump) = Pubkey::find_program_address(
        &seed_data.iter().map(|s| s.as_slice()).collect::<Vec<_>>(),
        &crate::ID,
    );

    let mut seeds = seed_data.clone();
    seeds.push(vec![bump]);
    let seed_refs: Vec<&[u8]> = seeds.iter().map(|s| s.as_slice()).collect();

    CreatePermissionCpiBuilder::new(&permission_program)
        .permissioned_account(&permissioned_account.to_account_info())
        .permission(&permission)
        .payer(&payer)
        .system_program(&system_program)
        .args(MembersArgs { members })
        .invoke_signed(&[seed_refs.as_slice()])?;
    
    Ok(())
}
