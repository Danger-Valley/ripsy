use anchor_lang::prelude::*;

use crate::{
    constants::{FLAG_LIMIT, GAME_SEED, HEIGHT, PAPER_LIMIT, PLAYER_DATA_SEED, ROCK_LIMIT, SCISSORS_LIMIT, TRAP_LIMIT, WIDTH},
    errors::ErrorCode,
    events::{GameStarted, LineupSubmitted},
    state::{BoardCellOwner, Game, Phase, Piece, PlayerData},
};

#[derive(Accounts)]
pub struct SubmitLineupXY<'info> {
    #[account(
        mut,
        seeds = [GAME_SEED, game.player0.as_ref(), game.nonce.as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,

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

    let mut flag_count = 0;
    let mut trap_count = 0;
    let mut paper_count = 0;
    let mut rock_count = 0;
    let mut scissors_count = 0; 

    let cell_owner = if is_p0 { BoardCellOwner::P0 as u8 } else { BoardCellOwner::P1 as u8 }; 

    for (i, &idx) in positions.iter().enumerate() {
        Game::validate_cell(idx)?;

        if is_p0 {
            require!(Game::is_p0_spawn(idx), ErrorCode::Player0BadRow);
        } else {
            require!(Game::is_p1_spawn(idx), ErrorCode::Player1BadRow);
        }

        let cell = idx as usize;
        require!(
            g.board_cells_owner[cell] == BoardCellOwner::None as u8
                && player_data.board_pieces[cell] == Piece::Empty as u8,
            ErrorCode::CellTaken
        );

        let piece = Piece::from(pieces[i]);
        match piece {
            Piece::Empty => return err!(ErrorCode::OnlyRpsftAllowed),
            Piece::Rock => rock_count += 1,
            Piece::Paper => paper_count += 1,
            Piece::Scissors => scissors_count += 1,
            Piece::Flag => flag_count += 1,
            Piece::Trap => trap_count += 1,
        };

        g.board_cells_owner[cell] = cell_owner;
        
        player_data.board_pieces[cell] = piece as u8;
    }

    require!(flag_count == FLAG_LIMIT, ErrorCode::FlagCountMismatch);
    require!(trap_count == TRAP_LIMIT, ErrorCode::TrapCountMismatch);
    require!(rock_count == ROCK_LIMIT, ErrorCode::RockCountMismatch);
    require!(paper_count == PAPER_LIMIT, ErrorCode::PaperCountMismatch);
    require!(scissors_count == SCISSORS_LIMIT, ErrorCode::ScissorsCountMismatch);

    let total_pieces = positions.len() as u8;

    if is_p0 {
        g.live_player0 = g.live_player0.saturating_add(total_pieces);

        g.phase = if g.phase() == Phase::LineupP1Set {
            Phase::Active as u8
        } else {
            Phase::LineupP0Set as u8
        };
    } else {
        g.live_player1 = g.live_player1.saturating_add(total_pieces);

        g.phase = if g.phase() == Phase::LineupP0Set {
            Phase::Active as u8
        } else {
            Phase::LineupP1Set as u8
        };
    }

    emit!(LineupSubmitted {
        player: *player,
        count: total_pieces
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
