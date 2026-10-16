/* One-time retirement payload. The original Rust pack program is retained.
 * Only BJom (the existing admin) may close Config/Edition/EditionPrice state.
 * Receipt/token/Core accounts are never accepted. No CPI or token movement.
 * Fixed two-account SBF ABI: [admin recipient, program-owned state].
 * Layout follows the installed Solana SDK sol/deserialize.h.
 */
typedef unsigned char u8;
typedef unsigned long u64;
#define CONFIG_TAG 0x82ccfa1ee0aa0c9bUL
#define PRICE_TAG 0x81332a023c53fcc0UL
#define EDITION_TAG 0xa7eb63074af975eaUL

static int equal32(const u8 *a, const u8 *b) {
    const u64 *x = (const u64 *)a, *y = (const u64 *)b;
    return x[0] == y[0] && x[1] == y[1] && x[2] == y[2] && x[3] == y[3];
}

u64 entrypoint(u8 *input) {
    if (*(u64 *)input != 2) return 1;
    u8 *admin = input + 8;
    const u64 expected[4] = {0x6bf32e28799e2499UL, 0xb6b0e42ee0de847fUL,
                            0xf152fcc47c1d3fb8UL, 0x947c869b7ffb0e87UL};
    const u64 system[4] = {0, 0, 0, 0};
    if (admin[0] != 255 || !admin[1] || !admin[2] || admin[3] ||
        *(u64 *)(admin + 80) || !equal32(admin + 8, (const u8 *)expected) ||
        !equal32(admin + 40, (const u8 *)system)) return 2;
    /* Admin has zero data, followed by the runtime's 10 KiB growth reserve
     * and rent epoch. Reject duplicate-account encoding before parsing state.
     */
    u8 *state = admin + 88 + 10240 + 8;
    if (state[0] != 255 || !state[2] || state[3]) return 3;
    u64 size = *(u64 *)(state + 80);
    if (size != 142 && size != 25 && size != 8985) return 4;
    u8 *tail = (u8 *)(((u64)(state + 88 + size + 10240) + 7) & ~7UL) + 8;
    if (*(u64 *)tail || !equal32(state + 40, tail + 8)) return 5;
    /* Exactly the three administrative Anchor account discriminators. */
    u64 tag = *(u64 *)(state + 88);
    if (!((size == 142 && tag == CONFIG_TAG && state[88 + 140] == 1) ||
          (size == 25 && tag == PRICE_TAG) ||
          (size == 8985 && tag == EDITION_TAG))) return 6;
    u64 value = *(u64 *)(state + 72), balance = *(u64 *)(admin + 72);
    if (balance > ~0UL - value) return 7;
    /* Clear before draining; runtime purges the zero-lamport state account. */
    for (u64 i = 0; i < size; i++) state[88 + i] = 0;
    *(u64 *)(state + 80) = 0;
    *(u64 *)(state + 72) = 0;
    *(u64 *)(admin + 72) = balance + value;
    return 0;
}
