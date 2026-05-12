use anchor_lang::prelude::*;

use crate::{
    constants::{GAME_SEED, PLAYER_DATA_SEED},
    errors::ErrorCode,
    state::{Game, PlayerData},
};

#[derive(Accounts)]
pub struct ClosePlayerData<'info> {
    #[account(
        constraint = game.player0 == player.key() || game.player1 == player.key() @ErrorCode::NotParticipant,
        constraint = game.winner.is_some() @ ErrorCode::GameNotFinished,
        seeds = [GAME_SEED, game.player0.as_ref(), game.nonce.as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        has_one = game,
        close = player,
        seeds = [PLAYER_DATA_SEED, game.key().as_ref(), player.key().as_ref()],
        bump = player_data.bump,
    )]
    pub player_data: Account<'info, PlayerData>,

    #[account(mut)]
    pub player: Signer<'info>,
}

pub fn close_player_data(_ctx: Context<ClosePlayerData>) -> Result<()> {
    Ok(())
}
