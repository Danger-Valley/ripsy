use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum BoardCellOwner {
    None = 0,
    P0 = 1,
    P1 = 2,
}

impl From<u8> for BoardCellOwner {
    fn from(v: u8) -> Self {
        match v {
            1 => Self::P0,
            2 => Self::P1,
            _ => Self::None,
        }
    }
}
