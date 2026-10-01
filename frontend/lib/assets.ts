/**
 * The canonical asset list — single source of truth for which stock tokens any
 * user-facing surface may display.
 *
 * `registry.allAssets()` on Robinhood Chain testnet returns nine entries: the five real
 * Robinhood stock tokens plus four historical MockERC20 demo tokens from the v6/v7 demo
 * book. The demo tokens stay registered with active=false so their existing notes keep
 * settling (Immutable Terms), and their real-token replacements were migrated in on
 * 2026-09-28. The registry deliberately keeps the history on-chain; the UI does not show
 * it. Every portfolio row, asset selector and balance list must go through
 * `isUserFacingAsset` rather than adding its own filter.
 */
const CANONICAL_ASSETS: ReadonlySet<string> = new Set<string>([
  "0xc9f9c86933092bbbfff3ccb4b105a4a94bf3bd4e", // TSLA
  "0x5884ad2f920c162cfbbacc88c9c51aa75ec09e02", // AMZN
  "0x1fbe1a0e43594b3455993b5de5fd0a7a266298d0", // PLTR
  "0x71178bac73cbeb415514eb542a8995b82669778d", // AMD
  "0x3b8262a63d25f0477c4dde23f83cfe22cb768c93", // NFLX
]);

/** Historical demo tokens — registered on-chain for settlement evidence, never shown. */
const EXCLUDED_DEMO_ASSETS: ReadonlySet<string> = new Set<string>([
  "0xd63fd09c46a96ff73b9ec7b941aff784c4c9f3ef", // legacy AMZN demo
  "0xcb0f9186fd6f4c5f9dc3e30e649ef8203908a00b", // legacy PLTR demo
  "0x9aaae34cb66a4aa5241c0eb9cb196cca02e58b63", // legacy AMD demo
  "0x29377502470c570aaef1c5a28cd1d42ce6669edf", // legacy NFLX demo
]);

export function isCanonicalAsset(token: string): boolean {
  return CANONICAL_ASSETS.has(token.toLowerCase());
}

export function isExcludedDemoAsset(token: string): boolean {
  return EXCLUDED_DEMO_ASSETS.has(token.toLowerCase());
}

/**
 * The gate every user-facing asset list passes through: the token must be one of the
 * five canonical contracts AND not one of the four historical demos. Canonical-first means
 * an accidental future registration outside the five never appears; the demo set is
 * defense-in-depth for a token that gets reactivated by an owner call.
 */
export function isUserFacingAsset(token: string): boolean {
  return isCanonicalAsset(token) && !isExcludedDemoAsset(token);
}

export function filterUserFacingAssets<T extends { token: string }>(assets: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const a of assets) {
    const key = a.token.toLowerCase();
    if (!isUserFacingAsset(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
