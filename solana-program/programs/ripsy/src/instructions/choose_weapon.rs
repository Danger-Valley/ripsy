use anchor_lang::prelude::*;

use crate::{
    constants::{GAME_SEED, PLAYER_DATA_SEED},
    errors::ErrorCode,
    events::TieResolved,
    state::{BoardCellOwner, Choice, Game, Phase, Piece, PlayerData},
};

#[derive(Accounts)]
pub struct ChooseWeapon<'info> {
    #[account(
        mut,
        seeds = [GAME_SEED, game.player0.as_ref(), game.nonce.as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        has_one = game,
        seeds = [PLAYER_DATA_SEED, game.key().as_ref(), opponent.key().as_ref()],
        bump = opponent_data.bump,
    )]
    pub opponent_data: Account<'info, PlayerData>,

    #[account(
        constraint = player.key() == game.player0 || player.key() == game.player1 @ErrorCode::NotParticipant,
        constraint = opponent.key() != player.key(),
    )]
    pub opponent: SystemAccount<'info>,

    #[account(
        mut,
        has_one = game,
        seeds = [PLAYER_DATA_SEED, game.key().as_ref(), player.key().as_ref()],
        bump = player_data.bump,
    )]
    pub player_data: Account<'info, PlayerData>,

    #[account(
        constraint = player.key() == game.player0 || player.key() == game.player1 @ErrorCode::NotParticipant,
    )]
    pub player: Signer<'info>,
}

pub fn choose_weapon(ctx: Context<ChooseWeapon>, choice: u8) -> Result<()> {
    let g = &mut ctx.accounts.game;
    let player = ctx.accounts.player.key();
    let player_data = &mut ctx.accounts.player_data;
    let opponent_data = &mut ctx.accounts.opponent_data;

    require!(g.phase() == Phase::Active, ErrorCode::GameNotActive);
    require!(g.tie_pending, ErrorCode::NoTiePending);

    require!(!player_data.choice.is_selected(), ErrorCode::AlreadyChose);
    player_data.choice = Choice::from(choice);

    if !(player_data.choice.is_selected() && opponent_data.choice.is_selected()) {
        return Ok(());
    }

    let t_from = g.tie_from as usize;
    let t_to = g.tie_to as usize;

    let is_p1 = player == g.player1;
    let is_attacker_p1 = if g.board_cells_owner[t_from] == BoardCellOwner::P1 as u8 {
        true
    } else {
        false
    };
    let is_attacker = is_attacker_p1 == is_p1;

    let (p0_choice, p1_choice) = if is_attacker {
        (player_data.choice, opponent_data.choice)
    } else {
        (opponent_data.choice, player_data.choice)
    };

    let outcome = Choice::rps_choice(p0_choice, p1_choice);

    emit!(TieResolved {
        outcome,
        p0_choice,
        p1_choice
    });

    let is_tie = outcome == 0;
    if !is_tie {
        let attacker_wins = if is_attacker_p1 {
            outcome == -1
        } else {
            outcome == 1
        };

        if attacker_wins {
            g.board_cells_owner[t_to] = if is_attacker_p1 {
                BoardCellOwner::P1 as u8
            } else {
                BoardCellOwner::P0 as u8
            };

            let attacker_piece = if is_attacker {
                player_data.choice
            } else {
                opponent_data.choice
            };

            player_data.board_pieces[t_to] = attacker_piece as u8;
            opponent_data.board_pieces[t_to] = attacker_piece as u8;

            if is_attacker_p1 {
                g.live_player0 = g.live_player0.saturating_sub(1);
            } else {
                g.live_player1 = g.live_player1.saturating_sub(1);
            }
        } else {
            let defender_piece = if is_attacker {
                opponent_data.choice
            } else {
                player_data.choice
            };

            player_data.board_pieces[t_to] = defender_piece as u8;
            opponent_data.board_pieces[t_to] = defender_piece as u8;

            if is_attacker_p1 {
                g.live_player1 = g.live_player1.saturating_sub(1);
            } else {
                g.live_player0 = g.live_player0.saturating_sub(1);
            }
        }

        g.board_cells_owner[t_from] = BoardCellOwner::None as u8;

        player_data.board_pieces[t_from] = Piece::Empty as u8;
        opponent_data.board_pieces[t_from] = Piece::Empty as u8;

        g.tie_pending = false;
    }

    g.attacker = p0_choice as u8;
    g.defender = p1_choice as u8;
    g.outcome = outcome;

    player_data.choice = Choice::None;
    opponent_data.choice = Choice::None;

    g.end_turn_or_win()
}
