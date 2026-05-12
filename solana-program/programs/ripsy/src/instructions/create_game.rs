use anchor_lang::prelude::*;

use crate::{
    constants::{GAME_SEED, PLAYER_DATA_SEED},
    events::GameCreated, 
    state::{Game, PlayerData}
};

#[derive(Accounts)]
#[instruction(nonce: [u8; 32])]
pub struct CreateGame<'info> {
    #[account(
        init,
        seeds = [GAME_SEED, player.key().as_ref(), &nonce],
        payer = player,
        space = Game::DISCRIMINATOR.len() + Game::INIT_SPACE,
        bump,
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

pub fn create_game(ctx: Context<CreateGame>, nonce: [u8; 32]) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player = &ctx.accounts.player.key();
    let player_data = &mut ctx.accounts.player_data;

    game.init(player, nonce, ctx.bumps.game);
    player_data.init(game.key(), player.key(), ctx.bumps.player_data);

    emit!(GameCreated {
        creator: player.key(),
    });

    Ok(())
}
