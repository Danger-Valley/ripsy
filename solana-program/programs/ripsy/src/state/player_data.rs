use anchor_lang::prelude::*;

use crate::{constants::CELLS, state::Choice};

#[account]
#[derive(InitSpace)]
pub struct PlayerData {
    pub game: Pubkey,
    pub player: Pubkey,
    pub choice: Choice,
    pub board_pieces: [u8; CELLS],
    pub bump: u8,
}

impl PlayerData {
    pub fn init(&mut self, game: Pubkey, player: Pubkey, bump: u8)  {
        self.game = game;
        self.player = player;
        self.bump = bump;
    }
}