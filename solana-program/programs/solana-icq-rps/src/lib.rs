use anchor_lang::prelude::*;

pub mod state;
pub use state::*;

pub mod instructions;
pub use instructions::*;

pub mod errors;
pub mod events;

declare_id!("3ueExHyxLr7ahqcBEzse3L21rTaWQ91rLtVnZLsx4ngA");

#[program]
pub mod solana_icq_rps {
    use super::*;

    pub fn create_game(ctx: Context<CreateGame>, nonce: [u8; 32]) -> Result<()> {
        create_game::create_game(ctx, nonce)?;
        Ok(())
    }

    pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
        join_game::join_game(ctx)?;
        Ok(())
    }

    pub fn submit_lineup(
        ctx: Context<SubmitLineup>,
        positions: Vec<u8>,
        pieces: Vec<u8>,
    ) -> Result<()> {
        submit_lineup::submit_lineup(ctx, positions, pieces)
    }
    pub fn submit_lineup_xy(
        ctx: Context<SubmitLineupXy>,
        xs: Vec<u8>,
        ys: Vec<u8>,
        pieces: Vec<u8>,
    ) -> Result<()> {
        submit_lineup::submit_lineup_xy(ctx, xs, ys, pieces)
    }

    pub fn move_piece(ctx: Context<MovePiece>, from_idx: u8, to_idx: u8) -> Result<()> {
        move_piece::move_piece(ctx, from_idx, to_idx)
    }

    pub fn move_piece_xy(
        ctx: Context<MovePiece>,
        from_x: u8,
        from_y: u8,
        to_x: u8,
        to_y: u8,
    ) -> Result<()> {
        move_piece::move_piece_xy(ctx, from_x, from_y, to_x, to_y)
    }

    pub fn choose_weapon(ctx: Context<ChooseWeapon>, choice: u8) -> Result<()> {
        choose_weapon::choose_weapon(ctx, choice)
    }
}
