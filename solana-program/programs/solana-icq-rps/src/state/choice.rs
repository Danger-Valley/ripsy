use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Choice {
    None = 0,
    Rock = 1,
    Paper = 2,
    Scissors = 3,
}

impl From<u8> for Choice {
    fn from(v: u8) -> Self {
        match v {
            1 => Self::Rock,
            2 => Self::Paper,
            3 => Self::Scissors,
            _ => Self::None,
        }
    }
}

pub fn rps_choice(a: Choice, b: Choice) -> i8 {
    use Choice::*;
    if a as u8 == b as u8 {
        return 0;
    }
    match (a, b) {
        (Rock, Scissors) => 1,
        (Scissors, Paper) => 1,
        (Paper, Rock) => 1,
        _ => -1,
    }
}
