use anchor_lang::prelude::*;

use crate::{clear_board, errors::ErrorCode, events::GameCreated, Game, Phase};

#[derive(Accounts)]
#[instruction(nonce: [u8; 32])]
pub struct CreateGame<'info> {
    #[account(
        init,
        seeds = [b"game", payer.key().as_ref(), &nonce],
        bump,
        payer = payer,
        space = Game::SIZE,
    )]
    pub game: Account<'info, Game>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_game(ctx: Context<CreateGame>, nonce: [u8; 32]) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let payer = &ctx.accounts.payer;

    game.player0 = payer.key();
    game.player1 = Pubkey::default();
    game.winner = None;
    game.phase = Phase::Created as u8;
    game.is_player1_turn = false;

    clear_board(game);

    game.nonce = nonce;

    emit!(GameCreated {
        creator: payer.key()
    });
    Ok(())
}
