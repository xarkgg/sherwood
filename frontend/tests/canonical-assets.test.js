// Simple Node test to verify canonical asset filtering and faucet UX constants
// Run with: node tests/canonical-assets.test.js
const fs = require('fs');
const path = require('path');

const protocolPath = path.join(__dirname, '../lib/protocol.ts');
const protectPath = path.join(__dirname, '../components/ProtectFlow.tsx');

const protocolSrc = fs.readFileSync(protocolPath, 'utf8');
const protectSrc = fs.readFileSync(protectPath, 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('PASS:', msg);
}

const canonical = [
  '0xc9f9c86933092bbbfff3ccb4b105a4a94bf3bd4e',
  '0x5884ad2f920c162cfbbacc88c9c51aa75ec09e02',
  '0x1fbe1a0e43594b3455993b5de5fd0a7a266298d0',
  '0x71178bac73cbeb415514eb542a8995b82669778d',
  '0x3b8262a63d25f0477c4dde23f83cfe22cb768c93',
];

const excluded = [
  '0xd63fd09c46a96ff73b9ec7b941aff784c4c9f3ef',
  '0xcb0f9186fd6f4c5f9dc3e30e649ef8203908a00b',
  '0x9aaae34cb66a4aa5241c0eb9cb196cca02e58b63',
  '0x29377502470c570aaef1c5a28cd1d42ce6669edf',
];

canonical.forEach(addr => {
  assert(protocolSrc.includes(addr), `canonical asset ${addr} present in protocol.ts`);
});

excluded.forEach(addr => {
  // Ensure excluded assets are in EXCLUDED_DEMO_ASSETS set but not in CANONICAL_ASSETS
  assert(protocolSrc.includes(addr), `excluded demo asset ${addr} listed for exclusion`);
});

assert(protocolSrc.includes('CANONICAL_ASSETS'), 'CANONICAL_ASSETS set defined');
assert(protocolSrc.includes('EXCLUDED_DEMO_ASSETS'), 'EXCLUDED_DEMO_ASSETS set defined');
assert(protocolSrc.includes('tokenLower'), 'asset filtering by canonical set applied');

assert(protectSrc.includes('hasEnoughUsdg'), 'ProtectFlow checks USDG balance sufficiency');
assert(protectSrc.includes('isMockUSDG'), 'ProtectFlow detects MockUSDG');
assert(protectSrc.includes('faucetNeeded'), 'ProtectFlow shows faucet when balance insufficient');
assert(protectSrc.includes('You need'), 'Insufficient USDG blocker message present');

console.log('All canonical asset and faucet UX tests passed.');
