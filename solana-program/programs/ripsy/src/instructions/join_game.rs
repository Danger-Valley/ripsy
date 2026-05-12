use anchor_lang::prelude::*;

use crate::{
    constants::{GAME_SEED, PLAYER_DATA_SEED},
    errors::ErrorCode,
    events::GameJoined,
    state::{Game, Phase, PlayerData},
};

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(
        mut,
        seeds = [GAME_SEED, game.player0.as_ref(), game.nonce.as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,

    #[account(
        init,
        seeds = [PLAYER_DATA_SEED, game.key().as_ref(), player.key().as_ref()],
        payer = player,
        space = PlayerData::DISCRIMINATOR.len() + PlayerData::INIT_SPACE,
        bump,
    )]
    pub player_data: Account<'info, PlayerData>,

    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player = ctx.accounts.player.key();
    let player_data = &mut ctx.accounts.player_data;

    match game.phase() {
        Phase::Created | Phase::LineupP0Set => {}
        _ => return err!(ErrorCode::BadPhase),
    }

    require!(game.player0 != player && game.player1 == Pubkey::default(), ErrorCode::NotAllowedJoinGame);

    game.player1 = player;

    if game.phase() == Phase::Created {
        game.phase = Phase::Joined as u8;
    }

    player_data.init(game.key(), player.key(), ctx.bumps.player_data);

    emit!(GameJoined {
        participant: player
    });

    Ok(())
}
