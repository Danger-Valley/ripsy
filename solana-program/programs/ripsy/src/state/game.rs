use anchor_lang::prelude::*;

use crate::constants::{CELLS, WIDTH};
use crate::errors::ErrorCode;
use crate::events::GameOver;
use crate::state::{BoardCellOwner, Choice, Phase, Piece};

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

    pub fn init_board(&mut self, payer: &Pubkey, nonce: [u8; 32]) {
        self.player0 = *payer;
        self.nonce = nonce;

        self.player1 = Pubkey::default();
        self.winner = None;
        self.phase = Phase::Created as u8;
        self.is_player1_turn = false;
        self.board_cells_owner = [BoardCellOwner::None as u8; CELLS];
        self.board_pieces = [Piece::Empty as u8; CELLS];
        self.live_player0 = 0;
        self.live_player1 = 0;
        self.flag_pos0 = 255;
        self.flag_pos1 = 255;
        self.tie_pending = false;
        self.tie_from = 0;
        self.tie_to = 0;
        self.choice_made0 = false;
        self.choice_made1 = false;
        self.choice0 = Choice::None as u8;
        self.choice1 = Choice::None as u8;
    }

    pub fn end_turn_or_win(&mut self, opponent_turn: bool) -> Result<()> {
        if self.live_player0 == 0 || self.live_player1 == 0 {
            let winner = if self.live_player0 == 0 {
                self.player1
            } else {
                self.player0
            };
            self.finish(winner, "no_pieces_left")?;
            return Ok(());
        }
        self.is_player1_turn = opponent_turn;

        Ok(())
    }

    pub fn finish(&mut self, winner: Pubkey, reason: &str) -> Result<()> {
        self.phase = Phase::Finished as u8;
        self.winner = Some(winner);
        emit!(GameOver {
            winner,
            reason: reason.to_string()
        });
        Ok(())
    }
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
