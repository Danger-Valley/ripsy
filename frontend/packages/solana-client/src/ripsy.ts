/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/ripsy.json`.
 */
export type Ripsy = {
  "address": "3f8KnTctrgiyzGCNLpH9tcuDT9hEwqEgWiagYhRiBNwT",
  "metadata": {
    "name": "ripsy",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "chooseWeapon",
      "discriminator": [
        164,
        234,
        168,
        4,
        102,
        6,
        237,
        218
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.player0",
                "account": "game"
              },
              {
                "kind": "account",
                "path": "game.nonce",
                "account": "game"
              }
            ]
          },
          "relations": [
            "opponentData",
            "playerData"
          ]
        },
        {
          "name": "opponentData",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "opponent"
              }
            ]
          }
        },
        {
          "name": "opponent"
        },
        {
          "name": "playerData",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "choice",
          "type": "u8"
        }
      ]
    },
    {
      "name": "closeGame",
      "discriminator": [
        237,
        236,
        157,
        201,
        253,
        20,
        248,
        67
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.player0",
                "account": "game"
              },
              {
                "kind": "account",
                "path": "game.nonce",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "closePermission",
      "discriminator": [
        17,
        241,
        212,
        43,
        238,
        201,
        203,
        210
      ],
      "accounts": [
        {
          "name": "permissionedAccount"
        },
        {
          "name": "permission",
          "writable": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        }
      ],
      "args": [
        {
          "name": "accountType",
          "type": {
            "defined": {
              "name": "accountType"
            }
          }
        }
      ]
    },
    {
      "name": "closePlayerData",
      "discriminator": [
        205,
        16,
        59,
        25,
        202,
        30,
        254,
        83
      ],
      "accounts": [
        {
          "name": "game",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.player0",
                "account": "game"
              },
              {
                "kind": "account",
                "path": "game.nonce",
                "account": "game"
              }
            ]
          },
          "relations": [
            "playerData"
          ]
        },
        {
          "name": "playerData",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "createGame",
      "discriminator": [
        124,
        69,
        75,
        66,
        184,
        220,
        72,
        206
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "player"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "playerData",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "createPermission",
      "discriminator": [
        190,
        182,
        26,
        164,
        156,
        221,
        8,
        0
      ],
      "accounts": [
        {
          "name": "permissionedAccount"
        },
        {
          "name": "permission",
          "writable": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountType",
          "type": {
            "defined": {
              "name": "accountType"
            }
          }
        },
        {
          "name": "members",
          "type": {
            "option": {
              "vec": {
                "defined": {
                  "name": "member"
                }
              }
            }
          }
        }
      ]
    },
    {
      "name": "delegatePda",
      "discriminator": [
        248,
        217,
        193,
        46,
        124,
        191,
        64,
        135
      ],
      "accounts": [
        {
          "name": "bufferPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                39,
                123,
                185,
                200,
                40,
                79,
                229,
                119,
                31,
                221,
                227,
                12,
                76,
                131,
                119,
                64,
                140,
                58,
                143,
                32,
                182,
                136,
                20,
                181,
                183,
                193,
                66,
                177,
                43,
                213,
                224,
                234
              ]
            }
          }
        },
        {
          "name": "delegationRecordPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "pda",
          "writable": true
        },
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "validator",
          "optional": true
        },
        {
          "name": "ownerProgram",
          "address": "3f8KnTctrgiyzGCNLpH9tcuDT9hEwqEgWiagYhRiBNwT"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountType",
          "type": {
            "defined": {
              "name": "accountType"
            }
          }
        }
      ]
    },
    {
      "name": "joinGame",
      "discriminator": [
        107,
        112,
        18,
        38,
        56,
        173,
        60,
        128
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.player0",
                "account": "game"
              },
              {
                "kind": "account",
                "path": "game.nonce",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "playerData",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "movePieceXy",
      "discriminator": [
        153,
        197,
        91,
        226,
        244,
        30,
        250,
        90
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.player0",
                "account": "game"
              },
              {
                "kind": "account",
                "path": "game.nonce",
                "account": "game"
              }
            ]
          },
          "relations": [
            "opponentData",
            "playerData"
          ]
        },
        {
          "name": "opponentData",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "opponent"
              }
            ]
          }
        },
        {
          "name": "opponent"
        },
        {
          "name": "playerData",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "fromX",
          "type": "u8"
        },
        {
          "name": "fromY",
          "type": "u8"
        },
        {
          "name": "toX",
          "type": "u8"
        },
        {
          "name": "toY",
          "type": "u8"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer"
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "submitLineupXy",
      "discriminator": [
        98,
        53,
        146,
        241,
        203,
        192,
        21,
        52
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.player0",
                "account": "game"
              },
              {
                "kind": "account",
                "path": "game.nonce",
                "account": "game"
              }
            ]
          },
          "relations": [
            "playerData"
          ]
        },
        {
          "name": "playerData",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "game"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "xs",
          "type": "bytes"
        },
        {
          "name": "ys",
          "type": "bytes"
        },
        {
          "name": "pieces",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "undelegatePda",
      "discriminator": [
        75,
        52,
        199,
        170,
        6,
        31,
        186,
        19
      ],
      "accounts": [
        {
          "name": "pda",
          "writable": true
        },
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "game",
      "discriminator": [
        27,
        90,
        166,
        125,
        74,
        100,
        121,
        18
      ]
    },
    {
      "name": "playerData",
      "discriminator": [
        197,
        65,
        216,
        202,
        43,
        139,
        147,
        128
      ]
    }
  ],
  "events": [
    {
      "name": "battle",
      "discriminator": [
        139,
        69,
        188,
        38,
        198,
        175,
        195,
        40
      ]
    },
    {
      "name": "gameCreated",
      "discriminator": [
        218,
        25,
        150,
        94,
        177,
        112,
        96,
        2
      ]
    },
    {
      "name": "gameJoined",
      "discriminator": [
        111,
        242,
        51,
        235,
        66,
        43,
        140,
        84
      ]
    },
    {
      "name": "gameOver",
      "discriminator": [
        122,
        28,
        20,
        209,
        123,
        166,
        111,
        64
      ]
    },
    {
      "name": "gameStarted",
      "discriminator": [
        222,
        247,
        78,
        255,
        61,
        184,
        156,
        41
      ]
    },
    {
      "name": "lineupSubmitted",
      "discriminator": [
        19,
        121,
        250,
        4,
        64,
        40,
        76,
        233
      ]
    },
    {
      "name": "moveMade",
      "discriminator": [
        63,
        69,
        224,
        215,
        118,
        250,
        136,
        241
      ]
    },
    {
      "name": "tieResolved",
      "discriminator": [
        199,
        157,
        148,
        87,
        4,
        237,
        234,
        89
      ]
    },
    {
      "name": "tieStarted",
      "discriminator": [
        99,
        40,
        243,
        91,
        1,
        73,
        81,
        193
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notAllowedJoinGame",
      "msg": "Not allowed to join game"
    },
    {
      "code": 6001,
      "name": "badCell",
      "msg": "Bad cell"
    },
    {
      "code": 6002,
      "name": "badPhase",
      "msg": "Bad phase"
    },
    {
      "code": 6003,
      "name": "cellTaken",
      "msg": "Cell already taken"
    },
    {
      "code": 6004,
      "name": "notParticipant",
      "msg": "Not a participant"
    },
    {
      "code": 6005,
      "name": "player0BadRow",
      "msg": "Player0: bad row"
    },
    {
      "code": 6006,
      "name": "player1BadRow",
      "msg": "Player1: bad row"
    },
    {
      "code": 6007,
      "name": "player0LineupAlreadyPlaced",
      "msg": "Player0 lineup already placed"
    },
    {
      "code": 6008,
      "name": "player1LineupAlreadyPlaced",
      "msg": "Player1 lineup already placed"
    },
    {
      "code": 6009,
      "name": "lineupLengthMismatch",
      "msg": "Lineup length mismatch"
    },
    {
      "code": 6010,
      "name": "lineupPositionsEmpty",
      "msg": "Lineup positions empty"
    },
    {
      "code": 6011,
      "name": "onlyRpsftAllowed",
      "msg": "Only R/P/S/F/T allowed"
    },
    {
      "code": 6012,
      "name": "gameNotActive",
      "msg": "Game not active"
    },
    {
      "code": 6013,
      "name": "tieInProgress",
      "msg": "Tie in progress"
    },
    {
      "code": 6014,
      "name": "invalidMove",
      "msg": "Invalid move"
    },
    {
      "code": 6015,
      "name": "notYourTurn",
      "msg": "Not your turn"
    },
    {
      "code": 6016,
      "name": "cannotStackOwnPiece",
      "msg": "Cannot stack own piece"
    },
    {
      "code": 6017,
      "name": "noTiePending",
      "msg": "No tie pending"
    },
    {
      "code": 6018,
      "name": "alreadyChose",
      "msg": "Already chose"
    },
    {
      "code": 6019,
      "name": "overflow",
      "msg": "overflow"
    },
    {
      "code": 6020,
      "name": "flagCountMismatch",
      "msg": "Invalid number of flags provided"
    },
    {
      "code": 6021,
      "name": "trapCountMismatch",
      "msg": "Invalid number of traps provided"
    },
    {
      "code": 6022,
      "name": "rockCountMismatch",
      "msg": "Invalid number of rocks provided"
    },
    {
      "code": 6023,
      "name": "paperCountMismatch",
      "msg": "Invalid number of paper items provided"
    },
    {
      "code": 6024,
      "name": "scissorsCountMismatch",
      "msg": "Invalid number of scissors provided"
    },
    {
      "code": 6025,
      "name": "trapBadRow",
      "msg": "Trap must be placed only on the inner spawn row"
    },
    {
      "code": 6026,
      "name": "gameNotFinished",
      "msg": "Game not finished"
    }
  ],
  "types": [
    {
      "name": "accountType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "game",
            "fields": [
              {
                "name": "player",
                "type": "pubkey"
              },
              {
                "name": "nonce",
                "type": {
                  "array": [
                    "u8",
                    32
                  ]
                }
              }
            ]
          },
          {
            "name": "playerData",
            "fields": [
              {
                "name": "game",
                "type": "pubkey"
              },
              {
                "name": "player",
                "type": "pubkey"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "battle",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fromIdx",
            "type": "u8"
          },
          {
            "name": "toIdx",
            "type": "u8"
          },
          {
            "name": "attacker",
            "type": {
              "defined": {
                "name": "piece"
              }
            }
          },
          {
            "name": "defender",
            "type": {
              "defined": {
                "name": "piece"
              }
            }
          },
          {
            "name": "outcome",
            "type": "i8"
          }
        ]
      }
    },
    {
      "name": "choice",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "none"
          },
          {
            "name": "rock"
          },
          {
            "name": "paper"
          },
          {
            "name": "scissors"
          }
        ]
      }
    },
    {
      "name": "game",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player0",
            "type": "pubkey"
          },
          {
            "name": "player1",
            "type": "pubkey"
          },
          {
            "name": "winner",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "phase",
            "type": "u8"
          },
          {
            "name": "isPlayer1Turn",
            "type": "bool"
          },
          {
            "name": "boardCellsOwner",
            "type": {
              "array": [
                "u8",
                49
              ]
            }
          },
          {
            "name": "livePlayer0",
            "type": "u8"
          },
          {
            "name": "livePlayer1",
            "type": "u8"
          },
          {
            "name": "attacker",
            "type": "u8"
          },
          {
            "name": "defender",
            "type": "u8"
          },
          {
            "name": "outcome",
            "type": "i8"
          },
          {
            "name": "tiePending",
            "type": "bool"
          },
          {
            "name": "tieFrom",
            "type": "u8"
          },
          {
            "name": "tieTo",
            "type": "u8"
          },
          {
            "name": "nonce",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "gameCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "gameJoined",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "participant",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "gameOver",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "gameStarted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "p0",
            "type": "pubkey"
          },
          {
            "name": "p1",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "lineupSubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "count",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "member",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "flags",
            "type": "u8"
          },
          {
            "name": "pubkey",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "moveMade",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "fromIdx",
            "type": "u8"
          },
          {
            "name": "toIdx",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "piece",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "empty"
          },
          {
            "name": "rock"
          },
          {
            "name": "paper"
          },
          {
            "name": "scissors"
          },
          {
            "name": "flag"
          },
          {
            "name": "trap"
          }
        ]
      }
    },
    {
      "name": "playerData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "game",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "choice",
            "type": {
              "defined": {
                "name": "choice"
              }
            }
          },
          {
            "name": "boardPieces",
            "type": {
              "array": [
                "u8",
                49
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tieResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "outcome",
            "type": "i8"
          },
          {
            "name": "p0Choice",
            "type": {
              "defined": {
                "name": "choice"
              }
            }
          },
          {
            "name": "p1Choice",
            "type": {
              "defined": {
                "name": "choice"
              }
            }
          }
        ]
      }
    },
    {
      "name": "tieStarted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fromIdx",
            "type": "u8"
          },
          {
            "name": "toIdx",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "flagLimit",
      "type": "u8",
      "value": "1"
    },
    {
      "name": "gameSeed",
      "type": "bytes",
      "value": "[103, 97, 109, 101]"
    },
    {
      "name": "height",
      "type": "u8",
      "value": "7"
    },
    {
      "name": "paperLimit",
      "type": "u8",
      "value": "4"
    },
    {
      "name": "playerDataSeed",
      "type": "bytes",
      "value": "[112, 108, 97, 121, 101, 114, 95, 100, 97, 116, 97]"
    },
    {
      "name": "playerStartRows",
      "type": "u8",
      "value": "2"
    },
    {
      "name": "rockLimit",
      "type": "u8",
      "value": "4"
    },
    {
      "name": "scissorsLimit",
      "type": "u8",
      "value": "4"
    },
    {
      "name": "trapLimit",
      "type": "u8",
      "value": "1"
    },
    {
      "name": "width",
      "type": "u8",
      "value": "7"
    }
  ]
};
