use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    events::GameJoined,
    state::{Game, Phase},
};

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(mut)]
    pub game: Account<'info, Game>,
    pub joiner: Signer<'info>,
}

pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let joiner = ctx.accounts.joiner.key();

    match game.phase() {
        Phase::Created | Phase::LineupP0Set => {}
        _ => return err!(ErrorCode::BadPhase),
    }

    require!(game.player0 != joiner, ErrorCode::NotAllowedJoinGame);
    require!(
        game.player1 == Pubkey::default(),
        ErrorCode::NotAllowedJoinGame
    );

    game.player1 = joiner;

    if game.phase() == Phase::Created {
        game.phase = Phase::Joined as u8;
    }

    emit!(GameJoined {
        participant: joiner
    });
    Ok(())
}
