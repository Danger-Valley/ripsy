use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    Created = 0,
    Joined = 1,
    LineupP0Set = 2,
    LineupP1Set = 3,
    Active = 4,
    Finished = 5,
}

impl From<u8> for Phase {
    fn from(v: u8) -> Self {
        match v {
            1 => Self::Joined,
            2 => Self::LineupP0Set,
            3 => Self::LineupP1Set,
            4 => Self::Active,
            5 => Self::Finished,
            _ => Self::Created,
        }
    }
}
