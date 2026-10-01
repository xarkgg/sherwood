import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  isCanonicalAsset,
  isExcludedDemoAsset,
  isUserFacingAsset,
  filterUserFacingAssets,
} from "../lib/assets.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const CANONICAL = {
  TSLA: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
  AMZN: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02",
  PLTR: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0",
  AMD: "0x71178BAc73cBeb415514eB542a8995b82669778d",
  NFLX: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93",
};

const DEMOS = [
  "0xD63Fd09c46A96fF73B9EC7b941AFf784C4C9f3EF",
  "0xCb0f9186fd6F4c5f9DC3E30e649EF8203908a00B",
  "0x9AAaE34Cb66A4AA5241C0eB9cB196CcA02E58b63",
  "0x29377502470c570AAef1c5A28cd1d42Ce6669edF",
];

test("exactly the five canonical assets pass the user-facing gate", () => {
  for (const [symbol, addr] of Object.entries(CANONICAL)) {
    assert.ok(isCanonicalAsset(addr), `${symbol} must be canonical`);
    assert.ok(isUserFacingAsset(addr), `${symbol} must be user-facing`);
  }
});

test("checksummed and lowercase forms resolve identically", () => {
  for (const addr of Object.values(CANONICAL)) {
    assert.equal(isUserFacingAsset(addr), isUserFacingAsset(addr.toLowerCase()));
  }
});

test("NFLX is in the canonical set (the asset the selector was missing)", () => {
  assert.ok(isUserFacingAsset(CANONICAL.NFLX));
});

test("all four historical demo addresses are excluded from every UI surface", () => {
  for (const demo of DEMOS) {
    assert.ok(isExcludedDemoAsset(demo), `${demo} must be in the demo exclusion set`);
    assert.ok(!isCanonicalAsset(demo), `${demo} must never be canonical`);
    assert.ok(!isUserFacingAsset(demo), `${demo} must never be user-facing`);
  }
});

test("an unregistered future address is not user-facing", () => {
  assert.ok(!isUserFacingAsset("0x1111111111111111111111111111111111111111"));
});

test("filtering a mixed registry list yields exactly 5 unique canonical entries", () => {
  // Mirrors registry.allAssets() on testnet 46630: 5 canonical + 4 demos, duplicated
  // as if the same batch were merged twice.
  const registryNine = [...Object.values(CANONICAL), ...DEMOS];
  const withDupes = [...registryNine, ...registryNine];
  const visible = filterUserFacingAssets(withDupes.map((token) => ({ token })));
  assert.equal(visible.length, 5, "exactly five assets survive the gate");
  const unique = new Set(visible.map((v) => v.token.toLowerCase()));
  assert.equal(unique.size, 5, "no duplicate entries");
  for (const demo of DEMOS) assert.ok(!unique.has(demo.toLowerCase()));
});

test("protocol.ts uses the shared canonical gate instead of its own filter", () => {
  const src = readFileSync(join(root, "lib/protocol.ts"), "utf8");
  assert.match(src, /from "\.\/assets"/, "protocol.ts imports the shared asset module");
  assert.match(src, /isUserFacingAsset\(token\)/, "useAssets routes through the shared gate");
  assert.doesNotMatch(src, /new Set<string>/, "protocol.ts no longer carries its own address sets");
});

test("no second stale asset source: frontend code never references demo addresses", () => {
  const files = ["lib/protocol.ts", "lib/addresses.ts", "components/ProtectFlow.tsx", "app/vault/page.tsx", "app/dashboard/page.tsx"];
  for (const f of files) {
    const src = readFileSync(join(root, f), "utf8").toLowerCase();
    for (const demo of DEMOS) {
      assert.ok(!src.includes(demo.toLowerCase()), `${f} must not hardcode demo address ${demo}`);
    }
  }
});
