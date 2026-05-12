#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use anchor_lang::prelude::*;

use ephemeral_rollups_sdk::anchor::{ ephemeral};
use ephemeral_rollups_sdk::access_control::structs::{Member};

pub mod state;
pub mod instructions;
pub mod errors;
pub mod events;
pub mod constants;
pub mod helpers;

use instructions::*;
use helpers::account_type::AccountType;

declare_id!("3f8KnTctrgiyzGCNLpH9tcuDT9hEwqEgWiagYhRiBNwT");

#[ephemeral]
#[program]
pub mod ripsy {
    use crate::helpers::AccountType;

    use super::*;

    pub fn create_game(ctx: Context<CreateGame>, nonce: [u8; 32]) -> Result<()> {
        instructions::create_game(ctx, nonce)
    }

    pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
        instructions::join_game(ctx)
    }

    pub fn delegate_pda(ctx: Context<DelegatePda>, account_type: AccountType) -> Result<()> {
        instructions::delegate_pda(ctx, account_type)
    }

    pub fn create_permission(
        ctx: Context<CreatePermission>,
        account_type: AccountType,
        members: Option<Vec<Member>>
    ) -> Result<()> {
        instructions::create_permission(ctx, account_type, members)
    }

    pub fn close_permission(
        ctx: Context<ClosePermission>,
        account_type: AccountType,
    ) -> Result<()> {
        instructions::close_permission(ctx, account_type)
    }

    pub fn submit_lineup_xy(
        ctx: Context<SubmitLineupXY>,
        xs: Vec<u8>,
        ys: Vec<u8>,
        pieces: Vec<u8>,
    ) -> Result<()> {
        instructions::submit_lineup_xy(ctx, xs, ys, pieces)
    }

    pub fn move_piece_xy(
        ctx: Context<MovePieceXY>,
        from_x: u8,
        from_y: u8,
        to_x: u8,
        to_y: u8,
    ) -> Result<()> {
        instructions::move_piece_xy(ctx, from_x, from_y, to_x, to_y)
    }

    pub fn choose_weapon(ctx: Context<ChooseWeapon>, choice: u8) -> Result<()> {
        instructions::choose_weapon(ctx, choice)
    }

    pub fn close_game(ctx: Context<CloseGame>) -> Result<()> {
        instructions::close_game(ctx)
    }

    pub fn close_player_data(ctx: Context<ClosePlayerData>) -> Result<()> {
        instructions::close_player_data(ctx)
    }

    pub fn undelegate_pda(ctx: Context<UndelegatePda>) -> Result<()> {
        instructions::undelegate_pda(ctx)
    }
}
