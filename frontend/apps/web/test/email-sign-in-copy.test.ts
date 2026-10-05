import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('shop and Army identify email sign-in without provider-branded controls', () => {
  for (const file of ['../app/shop/shop-content.tsx', '../app/army/army-content.tsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /Sign in with email/);
    assert.doesNotMatch(source, /Sign in with Privy|Privy embedded wallet|Use Privy wallet|Privy coming soon|sign in with Privy/);
  }
});

test('email sign-in presents only the email method in both SDK configurations', () => {
  for (const file of ['../app/shop/privy-shop.tsx', '../app/army/privy-army.tsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /loginMethods: \['email'\]/);
  }
});
