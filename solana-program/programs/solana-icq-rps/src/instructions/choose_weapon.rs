use crate::end_turn_or_win;
use crate::errors::ErrorCode;
use crate::events::{Battle, GameOver, MoveMade, TieChoice, TieResolved};
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ChooseWeapon<'info> {
    #[account(mut)]
    pub game: Account<'info, Game>,
    pub signer: Signer<'info>,
}

pub fn choose_weapon(ctx: Context<ChooseWeapon>, choice: u8) -> Result<()> {
    let g = &mut ctx.accounts.game;
    let me = ctx.accounts.signer.key();

    require!(g.phase() == Phase::Active, ErrorCode::GameNotActive);
    require!(g.tie_pending, ErrorCode::NoTiePending);

    if me == g.player0 {
        require!(!g.choice_made0, ErrorCode::AlreadyChose);
        g.choice0 = Choice::from(choice) as u8;
        g.choice_made0 = true;
    } else if me == g.player1 {
        require!(!g.choice_made1, ErrorCode::AlreadyChose);
        g.choice1 = Choice::from(choice) as u8;
        g.choice_made1 = true;
    } else {
        return err!(ErrorCode::NotParticipant);
    }
    emit!(TieChoice {
        player: me,
        choice: Choice::from(choice)
    });

    if !(g.choice_made0 && g.choice_made1) {
        return Ok(());
    }

    let t_from = g.tie_from as usize;
    let t_to = g.tie_to as usize;

    let attacker_owner = if g.is_player1_turn {
        BoardCellOwner::P1
    } else {
        BoardCellOwner::P0
    };
    let defender_owner = if attacker_owner == BoardCellOwner::P0 {
        BoardCellOwner::P1
    } else {
        BoardCellOwner::P0
    };

    let attacker_piece = Piece::from(g.board_pieces[t_from]);

    let p0_choice = Choice::from(g.choice0);
    let p1_choice = Choice::from(g.choice1);
    let outcome = rps_choice(p0_choice, p1_choice);

    emit!(TieResolved {
        outcome,
        p0_choice,
        p1_choice
    });

    let attacker_is_p1 = g.is_player1_turn;

    let attacker_wins = if attacker_is_p1 {
        outcome == -1
    } else {
        outcome == 1
    };
    let is_tie = outcome == 0;

    if attacker_wins {
        if defender_owner == BoardCellOwner::P0 {
            g.live_player0 = g.live_player0.saturating_sub(1);
        } else {
            g.live_player1 = g.live_player1.saturating_sub(1);
        }

        g.board_cells_owner[t_to] = BoardCellOwner::None as u8;
        g.board_pieces[t_to] = Piece::Empty as u8;

        g.board_cells_owner[t_from] = BoardCellOwner::None as u8;
        g.board_pieces[t_from] = Piece::Empty as u8;

        g.board_cells_owner[t_to] = attacker_owner as u8;
        g.board_pieces[t_to] = attacker_piece as u8;

        if attacker_piece == Piece::Flag {
            if attacker_owner == BoardCellOwner::P0 {
                g.flag_pos0 = g.tie_to;
            } else {
                g.flag_pos1 = g.tie_to;
            }
        }
    } else if is_tie {
        g.board_cells_owner[t_from] = BoardCellOwner::None as u8;
        g.board_pieces[t_from] = Piece::Empty as u8;

        g.board_cells_owner[t_to] = BoardCellOwner::None as u8;
        g.board_pieces[t_to] = Piece::Empty as u8;

        if attacker_owner == BoardCellOwner::P0 {
            g.live_player0 = g.live_player0.saturating_sub(1);
        } else {
            g.live_player1 = g.live_player1.saturating_sub(1);
        }
        if defender_owner == BoardCellOwner::P0 {
            g.live_player0 = g.live_player0.saturating_sub(1);
        } else {
            g.live_player1 = g.live_player1.saturating_sub(1);
        }
    } else {
        // програв атакер — прибрати його фігуру
        g.board_cells_owner[t_from] = BoardCellOwner::None as u8;
        g.board_pieces[t_from] = Piece::Empty as u8;

        if attacker_owner == BoardCellOwner::P0 {
            g.live_player0 = g.live_player0.saturating_sub(1);
        } else {
            g.live_player1 = g.live_player1.saturating_sub(1);
        }
    }

    g.tie_pending = false;
    g.choice_made0 = false;
    g.choice_made1 = false;
    g.choice0 = Choice::None as u8;
    g.choice1 = Choice::None as u8;

    let pass_to_opponent = !g.is_player1_turn;
    end_turn_or_win(g, pass_to_opponent)
}
