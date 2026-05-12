use anchor_lang::prelude::*;

use crate::constants::{GAME_SEED, PLAYER_DATA_SEED};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    Game { player: Pubkey, nonce: [u8; 32] },
    PlayerData { game: Pubkey, player: Pubkey },
}

impl AccountType {
    pub fn derive_seeds(&self) -> Vec<Vec<u8>> {
    match self {
        AccountType::Game { player, nonce } => {
            vec![GAME_SEED.to_vec(), player.to_bytes().to_vec(), nonce.to_vec()]
        }
        AccountType::PlayerData { game, player } => {
            vec![
                PLAYER_DATA_SEED.to_vec(),
                game.to_bytes().to_vec(),
                player.to_bytes().to_vec(),
            ]
        }
    }
}
}
