/**
 * Pure settlement-token funding policy — the exact checks the protect flow applies
 * between "the chain quoted a premium" and "a create can be submitted". Kept
 * dependency-free so `frontend/tests` exercises the real logic, not a copy of it.
 *
 * bigint discipline: a balance of 0n is a REAL zero and must fail the check; undefined
 * means "not loaded yet". `!!balance` is a bug here — `!!0n === false` conflated a
 * genuine zero balance with a loading one and hid the faucet path.
 */

export type UsdgFundingState = {
  /** undefined = the balanceOf read hasn't landed; 0n = genuinely broke. */
  balance: bigint | undefined;
  /** premium in settlement-token units, from on-chain `quote()`. */
  premium: bigint;
};

/** Balance read still pending even though a quote exists. */
export function balanceUnknown(s: UsdgFundingState): boolean {
  return s.balance === undefined;
}

/** Balance covers the premium exactly or better. 0n vs 0n passes: nothing is owed. */
export function hasEnoughUsdg(s: UsdgFundingState): boolean {
  return s.balance !== undefined && s.balance >= s.premium;
}

/** Wallet funded but the vault lacks an allowance for the premium. */
export function needsApproval(s: UsdgFundingState & { allowance: bigint | undefined }): boolean {
  return s.allowance !== undefined && s.allowance < s.premium;
}

/**
 * Whether the test-USDG faucet is the thing standing between the user and a create:
 * the mock faucet surface, a real quote, a LOADED balance (0n counts, undefined does
 * not) below the premium. Shared by the protect flow and the Vault card so neither
 * re-derives the bigint rules by hand.
 */
export function isFaucetNeeded(s: UsdgFundingState & { quote: boolean; faucetSurface: boolean }): boolean {
  return s.faucetSurface && s.quote && s.balance !== undefined && s.balance < s.premium;
}

/**
 * The short CTA copy for the create button, in contract order: money before
 * permission before position.
 */
export function createButtonLabel(
  s: UsdgFundingState & { faucetNeeded: boolean; needsApproval: boolean; overPosition: boolean }
): string {
  if (s.faucetNeeded) return "Get test USDG first";
  if (s.needsApproval) return "Approve first";
  if (s.overPosition) return "More than you hold";
  return "Buy protection";
}

/**
 * Map a create revert to an actionable message. viem surfaces a decoded contract error as
 * its name or as the raw 4-byte selector depending on the wallet, so both are matched.
 * Selectors verified 2026-09-30 by eth_call against the deployed stack (cast sig):
 * ERC20InsufficientBalance 0xe450d38c (the underfunded-create path on MockUSDG — the
 * vault's TransferFailed 0x90b8ec18 never fires against an OZ token that reverts instead
 * of returning false) · ERC20InsufficientAllowance 0xfb8f41b2 · StalePrice 0x19abf40e.
 * Unknown errors pass through sliced — a failure must never render as silence or success.
 */
export function decodeCreateError(raw: string, symbol = "USDG"): string | null {
  if (!raw) return null;
  if (/InsufficientPosition/.test(raw)) return "you must hold the stock you are protecting — reduce the amount";
  if (/InsufficientCapacity/.test(raw)) return "the vault is at capacity — this protection would exceed what the pool can back";
  if (/AssetConcentration/.test(raw)) return "this stock has reached its 30% share of the vault — pick another asset or wait for a settlement";
  if (/ERC20InsufficientBalance|transfer amount exceeds balance|0xe450d38c/i.test(raw))
    return `your wallet's ${symbol} balance no longer covers the premium — claim test USDG in Vault`;
  if (/ERC20InsufficientAllowance|insufficient allowance|0xfb8f41b2/i.test(raw))
    return "the premium grew past your approved allowance (the price moved between quote and create) — approve again";
  if (/TransferFailed|0x90b8ec18/i.test(raw))
    return `the vault could not collect the ${symbol} premium — your balance or allowance no longer covers it`;
  if (/AssetInactive/.test(raw)) return "this asset is closed to new protection";
  if (/UnsupportedAsset/.test(raw)) return "this asset is not registered with the protocol";
  if (/StalePrice|0x19abf40e/i.test(raw)) return "the price feed went stale between quote and create — try again once a fresh round lands";
  return raw.slice(0, 120);
}

export function decodeFaucetError(raw: string): string {
  if (/FaucetCooldown/.test(raw))
    return "Cooldown active — the faucet pays 1,000 USDG once per 24h per address. Try again later.";
  return raw.slice(0, 120);
}

/**
 * `faucetCooldownRemaining(address)` seconds -> "3h 42m" copy for the button's subtitle.
 * undefined or 0 means no cooldown is active, so nothing is shown.
 */
export function formatFaucetCooldown(seconds: bigint | undefined): string | null {
  if (seconds === undefined || seconds <= 0n) return null;
  const total = Number(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * The ONLY environment allowed to expose the MockUSDG faucet. Both conditions are
 * required: the wrong chain can't reach it, and the canonical mainnet USDG address can
 * never receive a faucet() call even if someone sets SETTLEMENT_TOKEN to it on 46630.
 * This is why `script/Config.s.sol` separately refuses MockUSDG on mainnet.
 */
export const MOCK_USDG_TESTNET = "0x8c4aa106a0A0d9ECAeD5C87e1AE766aa8Efbf006";
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;

export function isFaucetSurface(chainId: number | undefined, settlementToken: string | undefined): boolean {
  return (
    chainId === ROBINHOOD_TESTNET_CHAIN_ID &&
    settlementToken !== undefined &&
    settlementToken.toLowerCase() === MOCK_USDG_TESTNET.toLowerCase()
  );
}

/**
 * Whether the create button may submit, given the funding state. Order matters: a quote
 * must exist, the balance must be known AND sufficient, the allowance must be known and
 * sufficient, and the position check (held stock) must pass. The stock-position rule is
 * never weakened — `overPosition` still blocks.
 */
export function canSubmitCreate(s: {
  ready: boolean;
  quote: boolean;
  balance: bigint | undefined;
  premium: bigint;
  allowance: bigint | undefined;
  overPosition: boolean;
  busy: boolean;
}): boolean {
  if (!s.ready || !s.quote || s.busy || s.overPosition) return false;
  if (s.balance === undefined || s.balance < s.premium) return false;
  if (s.allowance === undefined || s.allowance < s.premium) return false;
  return true;
}
