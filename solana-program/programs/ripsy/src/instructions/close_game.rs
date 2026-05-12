use anchor_lang::prelude::*;

use crate::{
    constants::{GAME_SEED},
    errors::ErrorCode,
    state::{Game}
};

#[derive(Accounts)]
pub struct CloseGame<'info> {
    #[account(
        mut,
        close = player,
        constraint = game.player0 == player.key(),
        constraint = game.winner.is_some() @ ErrorCode::GameNotFinished,
        seeds = [GAME_SEED, game.player0.as_ref(), game.nonce.as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,

    #[account(mut)]
    pub player: Signer<'info>,
}

pub fn close_game(_ctx: Context<CloseGame>) -> Result<()> {
    Ok(())
}
