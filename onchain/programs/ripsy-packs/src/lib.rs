#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{hash::hashv, program::invoke_signed, sysvar};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, TransferChecked},
};
use ephemeral_vrf_sdk::{
    consts as vrf,
    instructions::{create_request_randomness_ix, RequestRandomnessParams},
    types::SerializableAccountMeta,
};
use mpl_core::{instructions::CreateV1CpiBuilder, types::DataState};

declare_id!("43FcaAGsYrqmviVpmChmCVsrqqqZzH3Usn6HEMztpdQJ");
pub const SKR_MINT: Pubkey = pubkey!("SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3");
pub const INITIAL_PRICE: u64 = 1_099_000_000;
pub const TOTAL_WEIGHT: u32 = 1_000_000;
pub const MAX_DROPS: usize = 32;
pub const PENDING: u8 = 0;
pub const RESOLVED: u8 = 1;
pub const CLAIMED: u8 = 2;

#[program]
pub mod ripsy_packs {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        treasury: Pubkey,
        collection: Pubkey,
        mint_authority: Pubkey,
    ) -> Result<()> {
        require!(
            treasury != Pubkey::default()
                && collection != Pubkey::default()
                && mint_authority != Pubkey::default(),
            PackError::InvalidConfig
        );
        ctx.accounts.config.set_inner(Config {
            admin: ctx.accounts.admin.key(),
            treasury,
            collection,
            mint_authority,
            version: 0,
            paused: true,
            bump: ctx.bumps.config,
        });
        Ok(())
    }

    /// Editions are append-only. Old receipts retain their exact price and drops.
    pub fn publish_edition(
        ctx: Context<PublishEdition>,
        version: u32,
        price: u64,
        drops: Vec<Drop>,
    ) -> Result<()> {
        require!(
            version
                == ctx
                    .accounts
                    .config
                    .version
                    .checked_add(1)
                    .ok_or(PackError::InvalidConfig)?
                && price > 0,
            PackError::InvalidConfig
        );
        validate_drops(&drops)?;
        if version == 1 {
            require!(
                price == INITIAL_PRICE
                    && drops.len() == 2
                    && drops[0].variant == 4
                    && drops[0].weight == 500_000
                    && drops[1].variant == 3
                    && drops[1].weight == 500_000,
                PackError::InvalidConfig
            );
        }
        let config = &mut ctx.accounts.config;
        ctx.accounts.edition.set_inner(Edition {
            version,
            price,
            treasury: config.treasury,
            collection: config.collection,
            mint_authority: config.mint_authority,
            drops,
            bump: ctx.bumps.edition,
        });
        config.version = version;
        Ok(())
    }

    pub fn set_paused(ctx: Context<Admin>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    /// One signed purchase creates one durable entitlement and one VRF request.
    /// There is no SGT, hardware check, re-roll, request replacement or close.
    pub fn buy_pack(
        ctx: Context<BuyPack>,
        nonce: [u8; 32],
        expected_version: u32,
        expected_price: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, PackError::Paused);
        require!(
            ctx.accounts.edition.version == expected_version
                && ctx.accounts.config.version == expected_version
                && ctx.accounts.edition.price == expected_price,
            PackError::StaleQuote
        );
        require!(
            ctx.accounts.buyer.key() != ctx.accounts.edition.treasury,
            PackError::InvalidBuyer
        );
        let receipt_key = ctx.accounts.receipt.key();
        let slot = Clock::get()?.slot;
        let seed = hashv(&[
            b"ripsy-pack-v1",
            receipt_key.as_ref(),
            ctx.accounts.edition.key().as_ref(),
            &slot.to_le_bytes(),
        ])
        .to_bytes();
        ctx.accounts.receipt.set_inner(Receipt {
            buyer: ctx.accounts.buyer.key(),
            edition: ctx.accounts.edition.key(),
            nonce,
            caller_seed: seed,
            randomness: [0; 32],
            price: expected_price,
            state: PENDING,
            drop_index: 0,
            bump: ctx.bumps.receipt,
        });
        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.buyer_tokens.to_account_info(),
                    mint: ctx.accounts.skr_mint.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            expected_price,
            6,
        )?;
        let ix = create_request_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.buyer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: ID,
            callback_discriminator: instruction::ResolvePack::DISCRIMINATOR.to_vec(),
            caller_seed: seed,
            accounts_metas: Some(vec![
                SerializableAccountMeta {
                    pubkey: receipt_key,
                    is_signer: false,
                    is_writable: true,
                },
                SerializableAccountMeta {
                    pubkey: ctx.accounts.edition.key(),
                    is_signer: false,
                    is_writable: false,
                },
            ]),
            callback_args: Some(seed.to_vec()),
        });
        invoke_signed(
            &ix,
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.program_identity.to_account_info(),
                ctx.accounts.oracle_queue.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.slot_hashes.to_account_info(),
                ctx.accounts.vrf_program.to_account_info(),
            ],
            &[&[vrf::IDENTITY, &[ctx.bumps.program_identity]]],
        )?;
        emit!(PackPurchased {
            receipt: receipt_key,
            buyer: ctx.accounts.buyer.key(),
            edition: ctx.accounts.edition.key(),
            caller_seed: seed
        });
        Ok(())
    }

    pub fn resolve_pack(
        ctx: Context<ResolvePack>,
        randomness: [u8; 32],
        caller_seed: [u8; 32],
    ) -> Result<()> {
        let receipt = &mut ctx.accounts.receipt;
        require!(
            receipt.state == PENDING && receipt.caller_seed == caller_seed,
            PackError::InvalidCallback
        );
        let index = choose_drop(&randomness, &ctx.accounts.edition.drops)?;
        receipt.randomness = randomness;
        receipt.drop_index = index as u8;
        receipt.state = RESOLVED;
        emit!(PackResolved {
            receipt: receipt.key(),
            variant: ctx.accounts.edition.drops[index].variant,
            randomness
        });
        Ok(())
    }

    /// Backend pays Core creation/network fees and supplies its existing collection
    /// authority signature, but cannot choose the result, destination or asset ID.
    /// Core issuance and release of SKR to the seller succeed or fail together.
    pub fn claim_pack(ctx: Context<ClaimPack>) -> Result<()> {
        require!(
            ctx.accounts.receipt.state == RESOLVED,
            PackError::NotResolved
        );
        let receipt_key = ctx.accounts.receipt.key();
        let receipt_seeds: &[&[u8]] = &[
            b"pack",
            ctx.accounts.receipt.buyer.as_ref(),
            &ctx.accounts.receipt.nonce,
            &[ctx.accounts.receipt.bump],
        ];
        let asset_seeds: &[&[u8]] = &[b"asset", receipt_key.as_ref(), &[ctx.bumps.asset]];
        let drop = &ctx.accounts.edition.drops[ctx.accounts.receipt.drop_index as usize];
        CreateV1CpiBuilder::new(&ctx.accounts.core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .collection(Some(&ctx.accounts.collection.to_account_info()))
            .authority(Some(&ctx.accounts.mint_authority.to_account_info()))
            .payer(&ctx.accounts.payer.to_account_info())
            .owner(Some(&ctx.accounts.buyer.to_account_info()))
            .system_program(&ctx.accounts.system_program.to_account_info())
            .data_state(DataState::AccountState)
            .name(drop.name.clone())
            .uri(drop.uri.clone())
            .invoke_signed(&[asset_seeds])?;
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.escrow.to_account_info(),
                    mint: ctx.accounts.skr_mint.to_account_info(),
                    to: ctx.accounts.treasury_tokens.to_account_info(),
                    authority: ctx.accounts.receipt.to_account_info(),
                },
                &[receipt_seeds],
            ),
            ctx.accounts.receipt.price,
            6,
        )?;
        // Return ATA rent and any unsolicited token dust to the buyer, not the seller.
        ctx.accounts.escrow.reload()?;
        if ctx.accounts.escrow.amount > 0 {
            token::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.escrow.to_account_info(),
                        mint: ctx.accounts.skr_mint.to_account_info(),
                        to: ctx.accounts.buyer_tokens.to_account_info(),
                        authority: ctx.accounts.receipt.to_account_info(),
                    },
                    &[receipt_seeds],
                ),
                ctx.accounts.escrow.amount,
                6,
            )?;
        }
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::CloseAccount {
                account: ctx.accounts.escrow.to_account_info(),
                destination: ctx.accounts.buyer.to_account_info(),
                authority: ctx.accounts.receipt.to_account_info(),
            },
            &[receipt_seeds],
        ))?;
        ctx.accounts.receipt.state = CLAIMED;
        emit!(PackClaimed {
            receipt: receipt_key,
            asset: ctx.accounts.asset.key(),
            buyer: ctx.accounts.buyer.key(),
            variant: drop.variant
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, crate::program::RipsyPacks>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()))]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
#[instruction(version: u32)]
pub struct PublishEdition<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
    #[account(init, payer = admin, space = 8 + Edition::INIT_SPACE, seeds = [b"edition".as_ref(), version.to_le_bytes().as_ref()], bump)]
    pub edition: Account<'info, Edition>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct Admin<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
}
#[derive(Accounts)]
#[instruction(nonce: [u8; 32])]
pub struct BuyPack<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"edition", &edition.version.to_le_bytes()], bump = edition.bump)]
    pub edition: Account<'info, Edition>,
    #[account(init, payer = buyer, space = 8 + Receipt::INIT_SPACE, seeds = [b"pack", buyer.key().as_ref(), &nonce], bump)]
    pub receipt: Account<'info, Receipt>,
    #[account(address = SKR_MINT, constraint = skr_mint.decimals == 6)]
    pub skr_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = skr_mint, associated_token::authority = buyer)]
    pub buyer_tokens: Account<'info, TokenAccount>,
    #[account(init, payer = buyer, associated_token::mint = skr_mint, associated_token::authority = receipt)]
    pub escrow: Account<'info, TokenAccount>,
    /// CHECK: Canonical VRF request identity, signed only by this program's CPI.
    #[account(seeds = [vrf::IDENTITY], bump)]
    pub program_identity: UncheckedAccount<'info>,
    /// CHECK: Pin the official base-layer queue, not a caller-supplied oracle.
    #[account(mut, address = vrf::DEFAULT_QUEUE)]
    pub oracle_queue: UncheckedAccount<'info>,
    /// CHECK: Canonical sysvar; randomness input includes onchain slot.
    #[account(address = sysvar::slot_hashes::ID)]
    pub slot_hashes: UncheckedAccount<'info>,
    /// CHECK: Pin executable VRF CPI program.
    #[account(address = vrf::VRF_PROGRAM_ID, executable)]
    pub vrf_program: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct ResolvePack<'info> {
    /// Per-program identity prevents a malicious consumer borrowing the global
    /// oracle signature to invoke our callback with fabricated randomness.
    #[account(address = vrf::scoped_vrf_identity(&ID))]
    pub vrf_program_identity: Signer<'info>,
    #[account(mut, seeds = [b"pack", receipt.buyer.as_ref(), &receipt.nonce], bump = receipt.bump, has_one = edition)]
    pub receipt: Account<'info, Receipt>,
    #[account(seeds = [b"edition", &edition.version.to_le_bytes()], bump = edition.bump)]
    pub edition: Account<'info, Edition>,
}
#[derive(Accounts)]
pub struct ClaimPack<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [b"pack", receipt.buyer.as_ref(), &receipt.nonce], bump = receipt.bump, has_one = edition, has_one = buyer)]
    pub receipt: Box<Account<'info, Receipt>>,
    #[account(seeds = [b"edition", &edition.version.to_le_bytes()], bump = edition.bump, has_one = collection, has_one = mint_authority)]
    pub edition: Box<Account<'info, Edition>>,
    #[account(mut)]
    pub buyer: SystemAccount<'info>,
    pub mint_authority: Signer<'info>,
    /// CHECK: Address pinned by immutable edition; Core checks collection authority.
    #[account(mut, owner = mpl_core::ID)]
    pub collection: UncheckedAccount<'info>,
    /// CHECK: Unique per-receipt new Core asset, signer supplied by program PDA.
    #[account(mut, seeds = [b"asset", receipt.key().as_ref()], bump, constraint = asset.data_is_empty())]
    pub asset: UncheckedAccount<'info>,
    #[account(address = SKR_MINT, constraint = skr_mint.decimals == 6)]
    pub skr_mint: Box<Account<'info, Mint>>,
    #[account(mut, associated_token::mint = skr_mint, associated_token::authority = receipt)]
    pub escrow: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = skr_mint, associated_token::authority = buyer)]
    pub buyer_tokens: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = treasury_tokens.owner == edition.treasury, constraint = treasury_tokens.mint == SKR_MINT)]
    pub treasury_tokens: Box<Account<'info, TokenAccount>>,
    /// CHECK: Fixed executable Core CPI, never arbitrary code.
    #[account(address = mpl_core::ID, executable)]
    pub core_program: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub collection: Pubkey,
    pub mint_authority: Pubkey,
    pub version: u32,
    pub paused: bool,
    pub bump: u8,
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Drop {
    pub variant: u8,
    pub weight: u32,
    #[max_len(64)]
    pub name: String,
    #[max_len(200)]
    pub uri: String,
}
#[account]
#[derive(InitSpace)]
pub struct Edition {
    pub version: u32,
    pub price: u64,
    pub treasury: Pubkey,
    pub collection: Pubkey,
    pub mint_authority: Pubkey,
    #[max_len(32)]
    pub drops: Vec<Drop>,
    pub bump: u8,
}
#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub buyer: Pubkey,
    pub edition: Pubkey,
    pub nonce: [u8; 32],
    pub caller_seed: [u8; 32],
    pub randomness: [u8; 32],
    pub price: u64,
    pub state: u8,
    pub drop_index: u8,
    pub bump: u8,
}
#[event]
pub struct PackPurchased {
    pub receipt: Pubkey,
    pub buyer: Pubkey,
    pub edition: Pubkey,
    pub caller_seed: [u8; 32],
}
#[event]
pub struct PackResolved {
    pub receipt: Pubkey,
    pub variant: u8,
    pub randomness: [u8; 32],
}
#[event]
pub struct PackClaimed {
    pub receipt: Pubkey,
    pub asset: Pubkey,
    pub buyer: Pubkey,
    pub variant: u8,
}

pub fn validate_drops(drops: &[Drop]) -> Result<()> {
    require!(
        !drops.is_empty() && drops.len() <= MAX_DROPS,
        PackError::InvalidDrops
    );
    let mut total = 0u32;
    for (i, drop) in drops.iter().enumerate() {
        // Free starter and Seeker-exclusive figure cannot enter an unrestricted pack.
        require!(
            drop.variant >= 3
                && drop.weight > 0
                && !drop.name.is_empty()
                && drop.name.len() <= 64
                && drop.uri.starts_with("https://")
                && drop.uri.len() <= 200
                && !drops[..i].iter().any(|other| other.variant == drop.variant),
            PackError::InvalidDrops
        );
        total = total
            .checked_add(drop.weight)
            .ok_or(PackError::InvalidDrops)?;
    }
    require!(total == TOTAL_WEIGHT, PackError::InvalidDrops);
    Ok(())
}
pub fn choose_drop(randomness: &[u8; 32], drops: &[Drop]) -> Result<usize> {
    validate_drops(drops)?;
    let total = TOTAL_WEIGHT as u64;
    let threshold = total.wrapping_neg() % total;
    // Deterministic rejection sampling avoids modulo bias. Never request new VRF.
    for counter in 0u32..64 {
        let hash = hashv(&[b"ripsy-pack-choice-v1", randomness, &counter.to_le_bytes()]).to_bytes();
        let value = u64::from_le_bytes(hash[..8].try_into().unwrap());
        if value < threshold {
            continue;
        }
        return drop_for_ticket(value % total, drops);
    }
    err!(PackError::InvalidRandomness)
}
pub fn drop_for_ticket(ticket: u64, drops: &[Drop]) -> Result<usize> {
    require!(ticket < TOTAL_WEIGHT as u64, PackError::InvalidRandomness);
    let mut cumulative = 0u64;
    for (index, drop) in drops.iter().enumerate() {
        cumulative += drop.weight as u64;
        if ticket < cumulative {
            return Ok(index);
        }
    }
    err!(PackError::InvalidDrops)
}
#[error_code]
pub enum PackError {
    #[msg("Invalid pack configuration")]
    InvalidConfig,
    #[msg("Invalid drop table")]
    InvalidDrops,
    #[msg("Packs are paused")]
    Paused,
    #[msg("Pack price or edition changed; review again")]
    StaleQuote,
    #[msg("Invalid purchase account")]
    InvalidBuyer,
    #[msg("Invalid or repeated VRF callback")]
    InvalidCallback,
    #[msg("Waiting for pack result or already claimed")]
    NotResolved,
    #[msg("Invalid randomness")]
    InvalidRandomness,
}

#[cfg(test)]
mod tests {
    use super::*;
    fn drops() -> Vec<Drop> {
        vec![
            Drop {
                variant: 4,
                weight: 500_000,
                name: "Jup".into(),
                uri: "https://www.ripsy.fun/figures/jup.json".into(),
            },
            Drop {
                variant: 3,
                weight: 500_000,
                name: "BONK".into(),
                uri: "https://www.ripsy.fun/figures/bonk.json".into(),
            },
        ]
    }
    #[test]
    fn exact_price_and_weights() {
        assert_eq!(INITIAL_PRICE, 1099 * 1_000_000);
        assert!(validate_drops(&drops()).is_ok());
    }
    #[test]
    fn half_open_intervals() {
        let d = drops();
        for (t, expected) in [(0, 0), (499_999, 0), (500_000, 1), (999_999, 1)] {
            assert_eq!(drop_for_ticket(t, &d).unwrap(), expected);
        }
        assert!(drop_for_ticket(1_000_000, &d).is_err());
    }
    #[test]
    fn invalid_tables() {
        let mut d = drops();
        d[1].weight = 499_999;
        assert!(validate_drops(&d).is_err());
        d = drops();
        d[1].variant = 4;
        assert!(validate_drops(&d).is_err());
        for v in [0, 1, 2] {
            d = drops();
            d[1].variant = v;
            assert!(validate_drops(&d).is_err());
        }
        d = drops();
        d[0].weight = 0;
        assert!(validate_drops(&d).is_err());
    }
    #[test]
    fn deterministic_ore_reward() {
        let mut d = drops();
        d[0].weight = 400_000;
        d[1].weight = 400_000;
        d.push(Drop {
            variant: 5,
            weight: 200_000,
            name: "ORE".into(),
            uri: "https://www.ripsy.fun/figures/ore.json".into(),
        });
        assert!(validate_drops(&d).is_ok());
        assert_eq!(drop_for_ticket(0, &d).unwrap(), 0);
        assert_eq!(drop_for_ticket(399_999, &d).unwrap(), 0);
        assert_eq!(drop_for_ticket(400_000, &d).unwrap(), 1);
        assert_eq!(drop_for_ticket(799_999, &d).unwrap(), 1);
        assert_eq!(drop_for_ticket(800_000, &d).unwrap(), 2);
        assert_eq!(drop_for_ticket(999_999, &d).unwrap(), 2);
        for i in 0u16..256 {
            let r = hashv(&[&i.to_le_bytes()]).to_bytes();
            assert_eq!(choose_drop(&r, &d).unwrap(), choose_drop(&r, &d).unwrap());
        }
    }
    #[test]
    fn bad_metadata_and_oversized_tables() {
        let mut d = drops();
        d[0].uri = "http://example.com".into();
        assert!(validate_drops(&d).is_err());
        d = drops();
        d[0].name = "x".repeat(65);
        assert!(validate_drops(&d).is_err());
        assert!(validate_drops(&[]).is_err());
        assert!(validate_drops(&vec![drops()[0].clone(); 33]).is_err());
    }
}
