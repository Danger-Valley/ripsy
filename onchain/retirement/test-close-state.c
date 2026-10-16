#include <assert.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "close-state.c"

static u8 input[40000] __attribute__((aligned(8)));
static u8 *admin, *state, *tail;
static void fixture(u64 size, u64 tag) {
    memset(input, 0, sizeof(input));
    *(u64 *)input = 2;
    admin = input + 8;
    admin[0] = 255; admin[1] = 1; admin[2] = 1;
    const u64 key[4] = {0x6bf32e28799e2499UL, 0xb6b0e42ee0de847fUL,
                       0xf152fcc47c1d3fb8UL, 0x947c869b7ffb0e87UL};
    memcpy(admin + 8, key, 32);
    *(u64 *)(admin + 72) = 100000000;
    state = admin + 88 + 10240 + 8;
    state[0] = 255; state[2] = 1;
    memset(state + 8, 42, 32);
    memset(state + 40, 43, 32);
    *(u64 *)(state + 72) = 46294040;
    *(u64 *)(state + 80) = size;
    memset(state + 88, 7, size);
    *(u64 *)(state + 88) = tag;
    if (size == 142) state[88 + 140] = 1;
    tail = (u8 *)(((u64)(state + 88 + size + 10240) + 7) & ~7UL) + 8;
    memcpy(tail + 8, state + 40, 32);
}
static void rejected(void) {
    u8 before[40000]; memcpy(before, input, sizeof(input));
    assert(entrypoint(input) != 0);
    assert(memcmp(before, input, sizeof(input)) == 0);
}
int main(void) {
    const u64 sizes[] = {142, 25, 8985};
    const u64 tags[] = {CONFIG_TAG, PRICE_TAG, EDITION_TAG};
    for (int i = 0; i < 3; i++) {
        fixture(sizes[i], tags[i]);
        assert(entrypoint(input) == 0);
        assert(*(u64 *)(admin + 72) == 146294040);
        assert(*(u64 *)(state + 72) == 0);
        assert(*(u64 *)(state + 80) == 0);
        for (u64 j = 0; j < sizes[i]; j++) assert(state[88 + j] == 0);
        rejected(); // Cannot close a drained account again.
    }
    fixture(142, CONFIG_TAG); admin[1] = 0; rejected();
    fixture(142, CONFIG_TAG); admin[2] = 0; rejected();
    fixture(142, CONFIG_TAG); admin[8] ^= 1; rejected();
    fixture(142, CONFIG_TAG); admin[40] = 1; rejected();
    fixture(142, CONFIG_TAG); *(u64 *)(admin + 80) = 1; rejected();
    fixture(142, CONFIG_TAG); state[0] = 0; rejected();
    fixture(142, CONFIG_TAG); state[2] = 0; rejected();
    fixture(142, CONFIG_TAG); state[3] = 1; rejected();
    fixture(142, CONFIG_TAG); state[40] ^= 1; rejected();
    fixture(142, CONFIG_TAG); state[88 + 140] = 0; rejected();
    fixture(142, CONFIG_TAG); *(u64 *)input = 3; rejected();
    fixture(142, CONFIG_TAG); *(u64 *)tail = 1; rejected();
    fixture(142, CONFIG_TAG); *(u64 *)(admin + 72) = ~0UL; rejected();
    fixture(179, 0); rejected(); // Receipt account, including paid entitlements.
    fixture(165, 0); rejected(); // SPL token account.
    fixture(142, PRICE_TAG); rejected(); // Type/size substitution.
    fixture(25, EDITION_TAG); rejected();
    puts("Retirement ABI tests passed: all administrative types, unauthorized/readonly/duplicate/wrong-owner/receipt/token/unpaused/overflow/replay rejection.");
    return 0;
}
