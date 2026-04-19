use anchor_lang::prelude::*;

use crate::{events::GameCreated, state::Game};

#[derive(Accounts)]
#[instruction(nonce: [u8; 32])]
pub struct CreateGame<'info> {
    #[account(
        init,
        seeds = [b"game", payer.key().as_ref(), &nonce],
        bump,
        payer = payer,
        space = Game::DISCRIMINATOR.len() + Game::INIT_SPACE,
    )]
    pub game: Account<'info, Game>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_game(ctx: Context<CreateGame>, nonce: [u8; 32]) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let payer = &ctx.accounts.payer.key();

    game.init_board(payer, nonce);

    emit!(GameCreated {
        creator: payer.key()
    });
    Ok(())
}
