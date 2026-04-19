use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Not allowed to join game")]
    NotAllowedJoinGame,
    #[msg("Bad cell")]
    BadCell,
    #[msg("Bad phase")]
    BadPhase,
    #[msg("Cell already taken")]
    CellTaken,
    #[msg("Not a participant")]
    NotParticipant,
    #[msg("Player0: bad row")]
    Player0BadRow,
    #[msg("Player1: bad row")]
    Player1BadRow,
    #[msg("Player0 lineup already placed")]
    Player0LineupAlreadyPlaced,
    #[msg("Player1 lineup already placed")]
    Player1LineupAlreadyPlaced,
    #[msg("Lineup length mismatch")]
    LineupLengthMismatch,
    #[msg("Lineup positions empty")]
    LineupPositionsEmpty,
    #[msg("Only R/P/S/F/T allowed")]
    OnlyRpsftAllowed,
    #[msg("Game not active")]
    GameNotActive,
    #[msg("Tie in progress")]
    TieInProgress,
    #[msg("Invalid move")]
    InvalidMove,
    #[msg("Not your turn")]
    NotYourTurn,
    #[msg("Cannot stack own piece")]
    CannotStackOwnPiece,
    #[msg("No tie pending")]
    NoTiePending,
    #[msg("Already chose")]
    AlreadyChose,
    #[msg("Overflow")]
    Overflow,
    #[msg("You must include exactly one Flag in your lineup")]
    MustHaveExactlyOneFlag,
    #[msg("You may place at most one Trap")]
    TooManyTraps,
    #[msg("Trap must be placed only on the inner spawn row")]
    TrapBadRow,
}
