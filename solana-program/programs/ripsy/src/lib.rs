#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use anchor_lang::prelude::*;

pub mod state;
pub mod instructions;
pub mod errors;
pub mod events;
pub mod constants;

use instructions::*;

declare_id!("3ueExHyxLr7ahqcBEzse3L21rTaWQ91rLtVnZLsx4ngA");

#[program]
pub mod ripsy {
    use super::*;

    pub fn create_game(ctx: Context<CreateGame>, nonce: [u8; 32]) -> Result<()> {
        instructions::create_game(ctx, nonce)
    }

    pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
        instructions::join_game(ctx)
    }

    pub fn submit_lineup(
        ctx: Context<SubmitLineup>,
        positions: Vec<u8>,
        pieces: Vec<u8>,
    ) -> Result<()> {
        instructions::submit_lineup(ctx, positions, pieces)
    }
    pub fn submit_lineup_xy(
        ctx: Context<SubmitLineupXy>,
        xs: Vec<u8>,
        ys: Vec<u8>,
        pieces: Vec<u8>,
    ) -> Result<()> {
        instructions::submit_lineup_xy(ctx, xs, ys, pieces)
    }

    pub fn move_piece(ctx: Context<MovePiece>, from_idx: u8, to_idx: u8) -> Result<()> {
        instructions::move_piece(ctx, from_idx, to_idx)
    }

    pub fn move_piece_xy(
        ctx: Context<MovePiece>,
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
}
