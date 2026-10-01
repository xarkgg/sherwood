import test from "node:test";
import assert from "node:assert/strict";

import {
  balanceUnknown,
  hasEnoughUsdg,
  needsApproval,
  createButtonLabel,
  decodeCreateError,
  decodeFaucetError,
  formatFaucetCooldown,
  isFaucetSurface,
  isFaucetNeeded,
  canSubmitCreate,
  MOCK_USDG_TESTNET,
} from "../lib/funding.ts";

const PREMIUM = 4_500_000n; // $4.50 at 6 decimals — the README worked example

test("a real 0n balance is insufficient — the bigint truthiness bug this guards", () => {
  assert.equal(hasEnoughUsdg({ balance: 0n, premium: PREMIUM }), false);
  // The regression this fix exists for: !!0n === false conflated zero with loading.
  assert.equal(Boolean(0n), false, "sanity: truthiness of 0n is false, which is why !!balance was wrong");
});

test("undefined balance is 'loading', never 'insufficient' and never 'ok'", () => {
  assert.equal(balanceUnknown({ balance: undefined, premium: PREMIUM }), true);
  assert.equal(hasEnoughUsdg({ balance: undefined, premium: PREMIUM }), false);
  assert.equal(balanceUnknown({ balance: 0n, premium: PREMIUM }), false, "0n is loaded, not unknown");
});

test("balance below premium fails, equal passes, one wei more passes", () => {
  assert.equal(hasEnoughUsdg({ balance: PREMIUM - 1n, premium: PREMIUM }), false);
  assert.equal(hasEnoughUsdg({ balance: PREMIUM, premium: PREMIUM }), true, "exactly enough is enough");
  assert.equal(hasEnoughUsdg({ balance: PREMIUM + 1n, premium: PREMIUM }), true);
  assert.equal(hasEnoughUsdg({ balance: 0n, premium: 0n }), true, "zero premium needs zero balance");
});

test("approval is requested only against the premium, and only once loaded", () => {
  assert.equal(needsApproval({ balance: PREMIUM * 2n, premium: PREMIUM, allowance: 0n }), true);
  assert.equal(needsApproval({ balance: PREMIUM * 2n, premium: PREMIUM, allowance: PREMIUM }), false);
  assert.equal(needsApproval({ balance: PREMIUM * 2n, premium: PREMIUM, allowance: undefined }), false);
});

test("create button order: money before permission before position", () => {
  const broke = { balance: 0n, premium: PREMIUM, faucetNeeded: true, needsApproval: true, overPosition: true };
  assert.equal(createButtonLabel(broke), "Get test USDG first");
  assert.equal(
    createButtonLabel({ balance: PREMIUM, premium: PREMIUM, faucetNeeded: false, needsApproval: true, overPosition: true }),
    "Approve first"
  );
  assert.equal(
    createButtonLabel({ balance: PREMIUM, premium: PREMIUM, faucetNeeded: false, needsApproval: false, overPosition: true }),
    "More than you hold"
  );
  assert.equal(
    createButtonLabel({ balance: PREMIUM, premium: PREMIUM, faucetNeeded: false, needsApproval: false, overPosition: false }),
    "Buy protection"
  );
});

test("known contract reverts decode into actionable messages", () => {
  assert.match(decodeCreateError("Error: InsufficientPosition(address,uint256,uint256)", "USDG") ?? "", /hold the stock/);
  assert.match(decodeCreateError("InsufficientCapacity()", "USDG") ?? "", /vault is at capacity/);
  assert.match(decodeCreateError("AssetConcentration(address,uint256,uint256)", "USDG") ?? "", /30% share/);
  assert.match(
    decodeCreateError("ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)", "USDG") ?? "",
    /no longer covers the premium/
  );
  assert.match(decodeCreateError("AssetInactive()", "USDG") ?? "", /closed to new protection/);
  assert.match(decodeCreateError("UnsupportedAsset()", "USDG") ?? "", /not registered/);
  assert.match(decodeCreateError("StalePrice()", "USDG") ?? "", /stale/);
});

test("unknown errors pass through — a failure never renders as silence", () => {
  const raw = "User rejected the request. some longer tail that should be truncated";
  const decoded = decodeCreateError(raw, "USDG") ?? "";
  assert.ok(raw.slice(0, 120).startsWith(decoded), "unknown error surfaces sliced raw text");
  assert.equal(decodeCreateError("", "USDG"), null);
});

test("faucet cooldown decodes with the 24h explanation", () => {
  assert.match(decodeFaucetError("FaucetCooldown(uint256) nextAt=1789363365"), /once per 24h/);
  assert.match(decodeFaucetError("some other failure"), /some other failure/);
});

test("faucet cooldown formats h/m/s and stays silent at zero", () => {
  assert.equal(formatFaucetCooldown(undefined), null);
  assert.equal(formatFaucetCooldown(0n), null, "0 means ready now — no message");
  assert.equal(formatFaucetCooldown(45n), "45s");
  assert.equal(formatFaucetCooldown(120n), "2m 0s");
  assert.equal(formatFaucetCooldown(3600n + 2520n), "1h 42m");
});

test("faucet is exposed only on 46630 with MockUSDG — never against production USDG", () => {
  const MAINNET_USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
  assert.equal(isFaucetSurface(46630, MOCK_USDG_TESTNET), true);
  assert.equal(isFaucetSurface(46630, MOCK_USDG_TESTNET.toLowerCase()), true, "case-insensitive");
  assert.equal(isFaucetSurface(4663, MOCK_USDG_TESTNET), false, "wrong chain: no faucet");
  assert.equal(isFaucetSurface(4663, MAINNET_USDG), false, "mainnet USDG: no faucet");
  assert.equal(isFaucetSurface(46630, MAINNET_USDG), false, "real USDG on testnet: no faucet");
  assert.equal(isFaucetSurface(undefined, MOCK_USDG_TESTNET), false, "no chain: no faucet");
  assert.equal(isFaucetSurface(46630, undefined), false, "no token: no faucet");
});

test("canSubmitCreate walks the full quote -> balance -> approval chain", () => {
  const base = { ready: true, quote: true, premium: PREMIUM, overPosition: false, busy: false };
  assert.equal(canSubmitCreate({ ...base, balance: PREMIUM, allowance: PREMIUM }), true);
  assert.equal(canSubmitCreate({ ...base, balance: PREMIUM, allowance: PREMIUM + 1n }), true);
  assert.equal(canSubmitCreate({ ...base, balance: 0n, allowance: PREMIUM }), false, "0n balance blocks");
  assert.equal(canSubmitCreate({ ...base, balance: undefined, allowance: PREMIUM }), false, "loading balance blocks");
  assert.equal(canSubmitCreate({ ...base, balance: PREMIUM - 1n, allowance: PREMIUM }), false);
  assert.equal(canSubmitCreate({ ...base, balance: PREMIUM, allowance: PREMIUM - 1n }), false, "allowance short blocks");
  assert.equal(canSubmitCreate({ ...base, balance: PREMIUM, allowance: undefined }), false, "allowance unknown blocks");
  assert.equal(canSubmitCreate({ ...base, balance: PREMIUM, allowance: PREMIUM, overPosition: true }), false, "position guard never weakens");
  assert.equal(canSubmitCreate({ ...base, balance: PREMIUM, allowance: PREMIUM, busy: true }), false, "no double submit");
  assert.equal(canSubmitCreate({ ...base, balance: PREMIUM, allowance: PREMIUM, ready: false }), false, "wrong chain blocks");
  assert.equal(canSubmitCreate({ ...base, balance: 0n, allowance: 0n, premium: 0n }), true, "zero premium with zero balance still creates");
});

test("insufficient USDG on the mock surface always calls for the faucet — including 0n", () => {
  const faucet = { quote: true, faucetSurface: true };
  assert.equal(isFaucetNeeded({ ...faucet, balance: 0n, premium: PREMIUM }), true, "0n triggers faucet");
  assert.equal(isFaucetNeeded({ ...faucet, balance: PREMIUM - 1n, premium: PREMIUM }), true);
  assert.equal(isFaucetNeeded({ ...faucet, balance: PREMIUM, premium: PREMIUM }), false, "exactly enough: no faucet");
  assert.equal(isFaucetNeeded({ ...faucet, balance: undefined, premium: PREMIUM }), false, "loading is not insufficient");
  assert.equal(
    isFaucetNeeded({ quote: true, faucetSurface: false, balance: 0n, premium: PREMIUM }),
    false,
    "production USDG never asks for a test faucet"
  );
  assert.equal(isFaucetNeeded({ quote: false, faucetSurface: true, balance: 0n, premium: PREMIUM }), false, "no quote yet: stay quiet");
});

test("raw 4-byte selectors decode too — viem surfaces undecoded reverts as hex", () => {
  assert.match(decodeCreateError("execution reverted, data: 0xe450d38c000000000000000000000000ad07", "USDG") ?? "", /balance no longer covers/);
  assert.match(decodeCreateError("HTTP error: 0xfb8f41b2 allowance too low", "USDG") ?? "", /approve again/);
  assert.match(decodeCreateError("revert 0x90b8ec18", "USDG") ?? "", /could not collect/);
  assert.match(decodeCreateError("revert 0x19abf40e", "USDG") ?? "", /stale/);
});
