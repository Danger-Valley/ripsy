use anchor_lang::prelude::*;

use crate::errors::ErrorCode;
use crate::{BoardCellOwner, Choice, Phase, Piece};

pub const WIDTH: u8 = 7;
pub const HEIGHT: u8 = 6;
pub const CELLS: usize = (WIDTH as usize) * (HEIGHT as usize);

#[account]
#[derive(InitSpace)]
pub struct Game {
    pub player0: Pubkey,
    pub player1: Pubkey,
    pub winner: Option<Pubkey>,
    pub phase: u8,
    pub is_player1_turn: bool,

    pub board_cells_owner: [u8; CELLS],
    pub board_pieces: [u8; CELLS],

    pub live_player0: u16,
    pub live_player1: u16,

    pub flag_pos0: u8,
    pub flag_pos1: u8,

    // tie state
    pub tie_pending: bool,
    pub tie_from: u8,
    pub tie_to: u8,
    pub choice_made0: bool,
    pub choice_made1: bool,
    pub choice0: u8,
    pub choice1: u8,

    pub nonce: [u8; 32],
}

impl Game {
    pub fn phase(&self) -> Phase {
        Phase::from(self.phase)
    }

    pub const SIZE_PLAIN: usize = 196 + 32;

    pub const SIZE: usize = 8 + Self::SIZE_PLAIN;
}

pub fn clear_board(g: &mut Game) {
    g.board_cells_owner = [BoardCellOwner::None as u8; CELLS];
    g.board_pieces = [Piece::Empty as u8; CELLS];
    g.live_player0 = 0;
    g.live_player1 = 0;
    g.flag_pos0 = 255;
    g.flag_pos1 = 255;
    g.tie_pending = false;
    g.tie_from = 0;
    g.tie_to = 0;
    g.choice_made0 = false;
    g.choice_made1 = false;
    g.choice0 = Choice::None as u8;
    g.choice1 = Choice::None as u8;
}

pub fn validate_cell(idx: u8) -> Result<()> {
    require!((idx as usize) < CELLS, ErrorCode::BadCell);
    Ok(())
}

pub fn _y(idx: u8) -> u8 {
    idx / WIDTH
}
pub fn _x(idx: u8) -> u8 {
    idx % WIDTH
}

pub fn is_p1_spawn(idx: u8) -> bool {
    _y(idx) <= 1
}
pub fn is_p0_spawn(idx: u8) -> bool {
    _y(idx) >= 4
}
