use crate::errors::ErrorCode;
use crate::events::{Battle, GameOver, MoveMade, TieStarted};
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct MovePiece<'info> {
    #[account(mut)]
    pub game: Account<'info, Game>,
    pub signer: Signer<'info>,
}

pub fn move_piece(ctx: Context<MovePiece>, from_idx: u8, to_idx: u8) -> Result<()> {
    do_move_piece(
        &mut ctx.accounts.game,
        &ctx.accounts.signer,
        from_idx,
        to_idx,
    )
}

pub fn move_piece_xy(
    ctx: Context<MovePiece>,
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
        &ctx.accounts.signer,
        from_idx,
        to_idx,
    )
}

// ---------------- core logic ----------------

fn do_move_piece(g: &mut Game, signer: &Signer, from_idx: u8, to_idx: u8) -> Result<()> {
    let me = signer.key();

    require!(g.phase() == Phase::Active, ErrorCode::GameNotActive);
    require!(!g.tie_pending, ErrorCode::TieInProgress);

    validate_cell(from_idx)?;
    validate_cell(to_idx)?;
    require!(_adjacent_orth(from_idx, to_idx), ErrorCode::InvalidMove);

    let current = if g.is_player1_turn {
        g.player1
    } else {
        g.player0
    };
    require!(me == current, ErrorCode::NotYourTurn);

    let me_owner = if g.is_player1_turn {
        BoardCellOwner::P1
    } else {
        BoardCellOwner::P0
    };

    let from = from_idx as usize;
    let to = to_idx as usize;

    require!(
        BoardCellOwner::from(g.board_cells_owner[from]) == me_owner,
        ErrorCode::InvalidMove
    );

    let attacker = Piece::from(g.board_pieces[from]);
    require!(attacker != Piece::Empty, ErrorCode::InvalidMove);
    require!(attacker != Piece::Trap, ErrorCode::InvalidMove);

    let dest_owner = BoardCellOwner::from(g.board_cells_owner[to]);
    let defender = Piece::from(g.board_pieces[to]);

    if dest_owner == BoardCellOwner::None {
        g.board_cells_owner[from] = BoardCellOwner::None as u8;
        g.board_pieces[from] = Piece::Empty as u8;

        g.board_cells_owner[to] = me_owner as u8;
        g.board_pieces[to] = attacker as u8;

        if attacker == Piece::Flag {
            if me_owner == BoardCellOwner::P0 {
                g.flag_pos0 = to_idx;
            } else {
                g.flag_pos1 = to_idx;
            }
        }

        emit!(MoveMade {
            player: me,
            from_idx,
            to_idx
        });
        return end_turn_or_win(g, !g.is_player1_turn);
    }

    require!(dest_owner != me_owner, ErrorCode::CannotStackOwnPiece);

    if defender == Piece::Trap {
        g.board_cells_owner[from] = BoardCellOwner::None as u8;
        g.board_pieces[from] = Piece::Empty as u8;

        if me_owner == BoardCellOwner::P0 {
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

            return finish(g, trap_owner_pubkey, "flag_walked_into_trap");
        }

        emit!(Battle {
            from_idx,
            to_idx,
            attacker,
            defender,
            outcome: -1,
        });

        emit!(MoveMade {
            player: me,
            from_idx,
            to_idx,
        });

        return end_turn_or_win(g, !g.is_player1_turn);
    }

    if defender == Piece::Flag {
        g.board_cells_owner[from] = BoardCellOwner::None as u8;
        g.board_pieces[from] = Piece::Empty as u8;
        if me_owner == BoardCellOwner::P0 {
            g.live_player0 = g.live_player0.saturating_sub(1);
        } else {
            g.live_player1 = g.live_player1.saturating_sub(1);
        }

        g.board_cells_owner[to] = BoardCellOwner::None as u8;
        g.board_pieces[to] = Piece::Empty as u8;

        emit!(Battle {
            from_idx,
            to_idx,
            attacker,
            defender,
            outcome: 1
        });

        return finish(
            g,
            if me_owner == BoardCellOwner::P0 {
                g.player0
            } else {
                g.player1
            },
            "captured_flag",
        );
    }

    let outcome = rps(attacker, defender);

    if outcome == 0 {
        g.tie_pending = true;
        g.tie_from = from_idx;
        g.tie_to = to_idx;
        g.choice_made0 = false;
        g.choice_made1 = false;
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
        if dest_owner == BoardCellOwner::P0 {
            g.live_player0 = g.live_player0.saturating_sub(1);
        } else {
            g.live_player1 = g.live_player1.saturating_sub(1);
        }

        g.board_cells_owner[to] = BoardCellOwner::None as u8;
        g.board_pieces[to] = Piece::Empty as u8;

        g.board_cells_owner[from] = BoardCellOwner::None as u8;
        g.board_pieces[from] = Piece::Empty as u8;

        g.board_cells_owner[to] = me_owner as u8;
        g.board_pieces[to] = attacker as u8;

        if attacker == Piece::Flag {
            if me_owner == BoardCellOwner::P0 {
                g.flag_pos0 = to_idx;
            } else {
                g.flag_pos1 = to_idx;
            }
        }
    } else {
        g.board_cells_owner[from] = BoardCellOwner::None as u8;
        g.board_pieces[from] = Piece::Empty as u8;
        if me_owner == BoardCellOwner::P0 {
            g.live_player0 = g.live_player0.saturating_sub(1);
        } else {
            g.live_player1 = g.live_player1.saturating_sub(1);
        }
    }

    emit!(MoveMade {
        player: me,
        from_idx,
        to_idx
    });
    end_turn_or_win(g, !g.is_player1_turn)
}

fn _adjacent_orth(from_idx: u8, to_idx: u8) -> bool {
    let fy = _y(from_idx);
    let fx = _x(from_idx);
    let ty = _y(to_idx);
    let tx = _x(to_idx);
    let dy = if fy > ty { fy - ty } else { ty - fy };
    let dx = if fx > tx { fx - tx } else { tx - fx };
    (dx + dy) == 1
}

pub fn end_turn_or_win(g: &mut Game, opponent_turn: bool) -> Result<()> {
    if g.live_player0 == 0 || g.live_player1 == 0 {
        let winner = if g.live_player0 == 0 {
            g.player1
        } else {
            g.player0
        };
        finish(g, winner, "no_pieces_left")?;
        return Ok(());
    }
    g.is_player1_turn = opponent_turn;
    Ok(())
}

fn finish(g: &mut Game, winner: Pubkey, reason: &str) -> Result<()> {
    g.phase = Phase::Finished as u8;
    g.winner = Some(winner);
    emit!(GameOver {
        winner,
        reason: reason.to_string()
    });
    Ok(())
}
