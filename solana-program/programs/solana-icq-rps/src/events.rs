use crate::{Choice, Piece};
use anchor_lang::prelude::*;

#[event]
pub struct GameCreated {
    pub creator: Pubkey,
}

#[event]
pub struct GameJoined {
    pub participant: Pubkey,
}

#[event]
pub struct FlagPlaced {
    pub id: u32,
    pub player: Pubkey,
    pub idx: u8,
}

#[event]
pub struct LineupSubmitted {
    pub player: Pubkey,
    pub count: u8,
}
#[event]
pub struct GameStarted {
    pub p0: Pubkey,
    pub p1: Pubkey,
}

#[event]
pub struct MoveMade {
    pub player: Pubkey,
    pub from_idx: u8,
    pub to_idx: u8,
}
#[event]
pub struct Battle {
    pub from_idx: u8,
    pub to_idx: u8,
    pub attacker: Piece,
    pub defender: Piece,
    pub outcome: i8,
}
#[event]
pub struct TieStarted {
    pub from_idx: u8,
    pub to_idx: u8,
}
#[event]
pub struct GameOver {
    pub winner: Pubkey,
    pub reason: String,
}

#[event]
pub struct TieChoice {
    pub player: Pubkey,
    pub choice: Choice,
}
#[event]
pub struct TieResolved {
    pub outcome: i8,
    pub p0_choice: Choice,
    pub p1_choice: Choice,
}
