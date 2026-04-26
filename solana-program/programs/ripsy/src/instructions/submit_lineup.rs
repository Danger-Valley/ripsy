use anchor_lang::prelude::*;

use crate::{
    constants::{HEIGHT, WIDTH},
    errors::ErrorCode,
    events::{GameStarted, LineupSubmitted},
    state::{BoardCellOwner, Game, Phase, Piece, PlayerData},
};

#[derive(Accounts)]
pub struct SubmitLineupXY<'info> {
    #[account(
        mut,
        seeds = [b"game", game.player0.as_ref(), game.nonce.as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        has_one = game,
        seeds = [b"player_data", game.key().as_ref(), player.key().as_ref()],
        bump = player_data.bump,
    )]
    pub player_data: Account<'info, PlayerData>,

    #[account(
        constraint = player.key() == game.player0 || player.key() == game.player1 @ErrorCode::NotParticipant,
    )]
    pub player: Signer<'info>,
}

pub fn submit_lineup_xy(
    ctx: Context<SubmitLineupXY>,
    xs: Vec<u8>,
    ys: Vec<u8>,
    pieces: Vec<u8>,
) -> Result<()> {
    require!(
        xs.len() == ys.len() && xs.len() == pieces.len(),
        ErrorCode::LineupLengthMismatch
    );
    let mut pos = Vec::with_capacity(xs.len());
    for i in 0..xs.len() {
        require!(xs[i] < WIDTH && ys[i] < HEIGHT, ErrorCode::BadCell);
        pos.push(ys[i] * WIDTH + xs[i]);
    }
    do_submit_lineup(
        &mut ctx.accounts.game,
        &ctx.accounts.player.key(),
        &mut ctx.accounts.player_data,
        &pos,
        &pieces,
    )
}

fn do_submit_lineup(
    g: &mut Game, 
    player: &Pubkey,
    player_data: &mut PlayerData,
    positions: &[u8], 
    pieces: &[u8]
) -> Result<()> {
    match g.phase() {
        Phase::Created | Phase::Joined | Phase::LineupP0Set | Phase::LineupP1Set => {}
        _ => return err!(ErrorCode::BadPhase),
    }
    require!(
        positions.len() == pieces.len(),
        ErrorCode::LineupLengthMismatch
    );
    require!(!positions.is_empty(), ErrorCode::LineupPositionsEmpty);

    let is_p0 = player == &g.player0;
    let is_p1 = player == &g.player1;
    require!(is_p0 || is_p1, ErrorCode::NotParticipant);

    if is_p0 {
        require!(
            g.phase() != Phase::LineupP0Set,
            ErrorCode::Player0LineupAlreadyPlaced
        );
    } else {
        require!(
            g.phase() != Phase::LineupP1Set,
            ErrorCode::Player1LineupAlreadyPlaced
        );
    }

    let mut flag_count = 0usize;
    let mut trap_count: usize = 0;
    let mut trap_idx: u8 = 0;

    for (i, &idx) in positions.iter().enumerate() {
        let p = Piece::from(pieces[i]);
        if p == Piece::Flag {
            flag_count += 1;
        }
        if p == Piece::Trap {
            trap_count += 1;
            trap_idx = idx;
        }
    }

    require!(flag_count == 1, ErrorCode::MustHaveExactlyOneFlag);
    require!(trap_count <= 1, ErrorCode::TooManyTraps);

    if trap_count == 1 {
        let trap_y = Game::_y(trap_idx);

        if is_p0 {
            require!(trap_y == 4 || trap_y == 5, ErrorCode::TrapBadRow);
        } else {
            require!(trap_y == 0 || trap_y == 1, ErrorCode::TrapBadRow);
        }
    }

    for (i, &idx) in positions.iter().enumerate() {
        Game::validate_cell(idx)?;
        let cell = idx as usize;
        require!(
            g.board_cells_owner[cell] == BoardCellOwner::None as u8
                && player_data.board_pieces[cell] == Piece::Empty as u8,
            ErrorCode::CellTaken
        );
        if is_p0 {
            require!(Game::is_p0_spawn(idx), ErrorCode::Player0BadRow);
        } else {
            require!(Game::is_p1_spawn(idx), ErrorCode::Player1BadRow);
        }

        let p = Piece::from(pieces[i]);
        require!(
            matches!(
                p,
                Piece::Rock | Piece::Paper | Piece::Scissors | Piece::Flag | Piece::Trap
            ),
            ErrorCode::OnlyRpsftAllowed
        );

        g.board_cells_owner[cell] = if is_p0 {
            BoardCellOwner::P0 as u8
        } else {
            BoardCellOwner::P1 as u8
        };
        player_data.board_pieces[cell] = p as u8;
        if is_p0 {
            g.live_player0 = g.live_player0.saturating_add(1);
        } else {
            g.live_player1 = g.live_player1.saturating_add(1);
        }
    }

    if is_p0 {
        require!(
            g.phase() != Phase::LineupP0Set,
            ErrorCode::Player0LineupAlreadyPlaced
        );
        g.phase = if g.phase() == Phase::LineupP1Set {
            Phase::Active as u8
        } else {
            Phase::LineupP0Set as u8
        };
    } else {
        require!(
            g.phase() != Phase::LineupP1Set,
            ErrorCode::Player1LineupAlreadyPlaced
        );
        g.phase = if g.phase() == Phase::LineupP0Set {
            Phase::Active as u8
        } else {
            Phase::LineupP1Set as u8
        };
    }

    emit!(LineupSubmitted {
        player: *player,
        count: positions.len() as u8
    });
    if g.phase() == Phase::Active {
        g.is_player1_turn = false;
        emit!(GameStarted {
            p0: g.player0,
            p1: g.player1
        });
    }

    Ok(())
}
