use anchor_lang::prelude::*;

use crate::constants::{CELLS, HEIGHT, PLAYER_START_ROWS, WIDTH};
use crate::errors::ErrorCode;
use crate::events::GameOver;
use crate::state::{BoardCellOwner, Phase}; //, Piece

#[account]
#[derive(InitSpace)]
pub struct Game {
    pub player0: Pubkey,
    pub player1: Pubkey,
    pub winner: Option<Pubkey>,
    pub phase: u8,
    pub is_player1_turn: bool,

    pub board_cells_owner: [u8; CELLS],

    pub live_player0: u8,
    pub live_player1: u8,

    pub attacker: u8,
    pub defender: u8,
    pub outcome: i8,

    pub tie_pending: bool,
    pub tie_from: u8,
    pub tie_to: u8,

    pub nonce: [u8; 32],

    pub bump: u8,
}

impl Game {
    pub fn init(&mut self, player: &Pubkey, nonce: [u8; 32], bump: u8) {
        self.player0 = *player;
        self.nonce = nonce;
        self.bump = bump;

        self.player1 = Pubkey::default();
        self.winner = None;
        self.phase = Phase::Created as u8;
        self.is_player1_turn = false;
        self.board_cells_owner = [BoardCellOwner::None as u8; CELLS];
        self.live_player0 = 0;
        self.live_player1 = 0;
        self.attacker = 0;
        self.defender = 0;
        self.tie_pending = false;
        self.tie_from = 0;
        self.tie_to = 0;
    }

    pub fn phase(&self) -> Phase {
        Phase::from(self.phase)
    }

    pub fn end_turn(&mut self) {
        self.is_player1_turn = !self.is_player1_turn;
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
        Self::_y(idx) <= PLAYER_START_ROWS - 1
    }

    pub fn is_p0_spawn(idx: u8) -> bool {
        Self::_y(idx) >= HEIGHT - PLAYER_START_ROWS
    }

    pub fn adjacent_orth(from_idx: u8, to_idx: u8) -> bool {
        let fy = Self::_y(from_idx);
        let fx = Self::_x(from_idx);
        let ty = Self::_y(to_idx);
        let tx = Self::_x(to_idx);
        let dy = if fy > ty { fy - ty } else { ty - fy };
        let dx = if fx > tx { fx - tx } else { tx - fx };
        (dx + dy) == 1
    }
}


