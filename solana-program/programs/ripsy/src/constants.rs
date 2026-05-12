use anchor_lang::prelude::*;

#[constant]
pub const WIDTH: u8 = 7;
#[constant]
pub const HEIGHT: u8 = 7;

pub const CELLS: usize = (WIDTH as usize) * (HEIGHT as usize);

#[constant]
pub const PLAYER_DATA_SEED: &[u8] = b"player_data";
#[constant]
pub const GAME_SEED: &[u8] = b"game";

#[constant]
pub const PLAYER_START_ROWS: u8 = 2;

#[constant]
pub const TRAP_LIMIT: u8 = 1;

#[constant]
pub const FLAG_LIMIT: u8 = 1;

#[constant]
pub const PAPER_LIMIT: u8 = 4;

#[constant]
pub const ROCK_LIMIT: u8 = 4;

#[constant]
pub const SCISSORS_LIMIT: u8 = 4;

pub const TOTAL_PIECES: u8 = TRAP_LIMIT + FLAG_LIMIT + PAPER_LIMIT + ROCK_LIMIT + SCISSORS_LIMIT;
