use anchor_lang::prelude::*;

#[constant]
pub const WIDTH: u8 = 7;
#[constant]
pub const HEIGHT: u8 = 7;

pub const CELLS: usize = (WIDTH as usize) * (HEIGHT as usize);