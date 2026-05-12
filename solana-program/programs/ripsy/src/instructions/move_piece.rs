use anchor_lang::prelude::*;

use crate::{
    constants::{GAME_SEED, PLAYER_DATA_SEED, HEIGHT, WIDTH},
    errors::ErrorCode,
    events::{Battle, MoveMade, TieStarted},
    state::{BoardCellOwner, Game, Phase, Piece, PlayerData},
};

#[derive(Accounts)]
pub struct MovePieceXY<'info> {
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

pub fn move_piece_xy(
    ctx: Context<MovePieceXY>,
    from_x: u8,
    from_y: u8,
    to_x: u8,
    to_y: u8,
) -> Result<()> {
    require!(
        from_x < WIDTH && from_y < HEIGHT && to_x < WIDTH && to_y < HEIGHT,
        ErrorCode::BadCell
    );
    let from_idx = from_y * WIDTH + from_x;
    let to_idx = to_y * WIDTH + to_x;
    do_move_piece(
        &mut ctx.accounts.game,
        &ctx.accounts.player.key(),
        &mut ctx.accounts.player_data,
        &mut ctx.accounts.opponent_data,
        from_idx,
        to_idx,
    )
}

fn do_move_piece(
    g: &mut Game, 
    player: &Pubkey,
    player_data: &mut PlayerData,
    opponent_data: &mut PlayerData,
    from_idx: u8, 
    to_idx: u8
) -> Result<()> {
    require!(g.phase() == Phase::Active, ErrorCode::GameNotActive);
    require!(!g.tie_pending, ErrorCode::TieInProgress);

    Game::validate_cell(from_idx)?;
    Game::validate_cell(to_idx)?;
    require!(Game::adjacent_orth(from_idx, to_idx), ErrorCode::InvalidMove);

    let current = if g.is_player1_turn {
        g.player1
    } else {
        g.player0
    };
    require!(*player == current, ErrorCode::NotYourTurn);

    let player_owner = if g.is_player1_turn {
        BoardCellOwner::P1
    } else {
        BoardCellOwner::P0
    };

    let from = from_idx as usize;
    let to = to_idx as usize;

    require!(
        BoardCellOwner::from(g.board_cells_owner[from]) == player_owner,
        ErrorCode::InvalidMove
    );

    let attacker = Piece::from(player_data.board_pieces[from]);
    require!(attacker != Piece::Empty, ErrorCode::InvalidMove);
    require!(attacker != Piece::Trap, ErrorCode::InvalidMove);

    let dest_owner = BoardCellOwner::from(g.board_cells_owner[to]);
    require!(dest_owner != player_owner, ErrorCode::CannotStackOwnPiece);

    let defender = Piece::from(opponent_data.board_pieces[to]);

    if dest_owner == BoardCellOwner::None {
        g.board_cells_owner[to] = player_owner as u8;

        player_data.board_pieces[to] = attacker as u8;
        opponent_data.board_pieces[to] = opponent_data.board_pieces[from];

        g.board_cells_owner[from] = BoardCellOwner::None as u8;

        player_data.board_pieces[from] = Piece::Empty as u8;
        opponent_data.board_pieces[from] = Piece::Empty as u8;

        emit!(MoveMade {
            player: player.key(),
            from_idx,
            to_idx
        });
        return g.end_turn_or_win();
    }

    g.attacker = attacker as u8;
    g.defender = defender as u8;

    if defender == Piece::Trap {
        g.board_cells_owner[from] = BoardCellOwner::None as u8;
        player_data.board_pieces[from] = Piece::Empty as u8;

        if player_owner == BoardCellOwner::P0 {
            g.live_player0 = g.live_player0.saturating_sub(1);
        } else {
            g.live_player1 = g.live_player1.saturating_sub(1);
        }

        if attacker == Piece::Flag {
            let trap_owner_is_p0 = dest_owner == BoardCellOwner::P0;
            let trap_owner_pubkey = if trap_owner_is_p0 {
                g.player0
            } else {
                g.player1
            };

            emit!(Battle {
                from_idx,
                to_idx,
                attacker,
                defender,
                outcome: -1,
            });

            return g.finish(trap_owner_pubkey, "flag_walked_into_trap");
        }

        emit!(Battle {
            from_idx,
            to_idx,
            attacker,
            defender,
            outcome: -1,
        });

        emit!(MoveMade {
            player: player.key(),
            from_idx,
            to_idx,
        });

        return g.end_turn_or_win();
    }

    if defender == Piece::Flag {
        g.board_cells_owner[from] = BoardCellOwner::None as u8;
        player_data.board_pieces[from] = Piece::Empty as u8;
        if player_owner == BoardCellOwner::P0 {
            g.live_player0 = g.live_player0.saturating_sub(1);
        } else {
            g.live_player1 = g.live_player1.saturating_sub(1);
        }

        g.board_cells_owner[to] = BoardCellOwner::None as u8;
        player_data.board_pieces[to] = Piece::Empty as u8;

        emit!(Battle {
            from_idx,
            to_idx,
            attacker,
            defender,
            outcome: 1
        });

        return g.finish(
            if player_owner == BoardCellOwner::P0 {
                g.player0
            } else {
                g.player1
            },
            "captured_flag",
        );
    }

    let outcome = Piece::rps(attacker, defender);
    g.outcome = outcome;

    if outcome == 0 {
        g.tie_pending = true;
        g.tie_from = from_idx;
        g.tie_to = to_idx;

        player_data.board_pieces[from] = attacker as u8;
        player_data.board_pieces[to] = defender as u8;

        opponent_data.board_pieces[from] = attacker as u8;
        opponent_data.board_pieces[to] = defender as u8;

        emit!(TieStarted { from_idx, to_idx });
        return Ok(());
    }

    emit!(Battle {
        from_idx,
        to_idx,
        attacker,
        defender,
        outcome
    });

    if outcome == 1 {
        g.board_cells_owner[to] = player_owner as u8;

        player_data.board_pieces[to] = attacker as u8;
        opponent_data.board_pieces[to] = attacker as u8;

        if dest_owner == BoardCellOwner::P0 {
            g.live_player0 = g.live_player0.saturating_sub(1);
        } else {
            g.live_player1 = g.live_player1.saturating_sub(1);
        }
    } else {
        player_data.board_pieces[to] = defender as u8;
        opponent_data.board_pieces[to] = defender as u8;

        if player_owner == BoardCellOwner::P0 {
            g.live_player0 = g.live_player0.saturating_sub(1);
        } else {
            g.live_player1 = g.live_player1.saturating_sub(1);
        }
    }

    g.board_cells_owner[from] = BoardCellOwner::None as u8;

    player_data.board_pieces[from] = Piece::Empty as u8;
    opponent_data.board_pieces[from] = Piece::Empty as u8;

    g.end_turn_or_win()?;

    emit!(MoveMade {
        player: player.key(),
        from_idx,
        to_idx
    });

    Ok(())
}