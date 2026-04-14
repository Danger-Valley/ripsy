use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Piece {
    Empty = 0,
    Rock = 1,
    Paper = 2,
    Scissors = 3,
    Flag = 4,
    Trap = 5,
}

impl From<u8> for Piece {
    fn from(v: u8) -> Self {
        match v {
            1 => Self::Rock,
            2 => Self::Paper,
            3 => Self::Scissors,
            4 => Self::Flag,
            5 => Self::Trap,
            _ => Self::Empty,
        }
    }
}

pub fn rps(attacker: Piece, defender: Piece) -> i8 {
    use Piece::*;
    if attacker == defender {
        return 0;
    }
    match (attacker, defender) {
        (Rock, Scissors) => 1,
        (Scissors, Paper) => 1,
        (Paper, Rock) => 1,
        _ => -1,
    }
}
