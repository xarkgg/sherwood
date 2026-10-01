import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const deployments = JSON.parse(readFileSync(join(here, "../../deploy/deployments.json"), "utf8"));

const CANONICAL = {
  TSLA: "0xc9f9c86933092bbbfff3ccb4b105a4a94bf3bd4e",
  AMZN: "0x5884ad2f920c162cfbbacc88c9c51aa75ec09e02",
  PLTR: "0x1fbe1a0e43594b3455993b5de5fd0a7a266298d0",
  AMD: "0x71178bac73cbeb415514eb542a8995b82669778d",
  NFLX: "0x3b8262a63d25f0477c4dde23f83cfe22cb768c93",
};

const DEMOS = [
  "0xd63fd09c46a96ff73b9ec7b941aff784c4c9f3ef",
  "0xcb0f9186fd6f4c5f9dc3e30e649ef8203908a00b",
  "0x9aaae34cb66a4aa5241c0eb9cb196cca02e58b63",
  "0x29377502470c570aaef1c5a28cd1d42ce6669edf",
];

test("deployments.json lists the five canonical tokens as the current assets", () => {
  for (const [symbol, addr] of Object.entries(CANONICAL)) {
    const entry = deployments.assets[symbol];
    assert.ok(entry, `asset ${symbol} present`);
    assert.equal(entry.token.toLowerCase(), addr, `${symbol} token must be the real Robinhood contract`);
    assert.equal(entry.active, true, `${symbol} must be marked active`);
  }
});

test("NFLX is marked active and names the reactivation transaction", () => {
  assert.equal(deployments.assets.NFLX.active, true, "NFLX must not be documented as inactive");
  assert.match(deployments.assets.NFLX.migrated, /re-activated/i, "migration note records the reactivation");
  assert.match(deployments.assets.NFLX.token.toLowerCase(), /3b8262a63d25f0477c4dde23f83cfe22cb768c93$/);
});

test("no canonical asset entry points at a historical demo token", () => {
  for (const [symbol, entry] of Object.entries(deployments.assets)) {
    assert.ok(!DEMOS.includes(entry.token.toLowerCase()), `${symbol} must not resolve to a demo token`);
  }
});

test("demo history is confined to evidence keys, never the active token/feed fields", () => {
  const assetBlock = JSON.stringify(deployments.assets);
  for (const demo of DEMOS) {
    assert.ok(!assetBlock.includes(demo), `assets block must not carry demo token ${demo}`);
  }
  // The demo addresses live on in the narrative history sections (v6Demo/v7Demo) and the
  // wiring read-back — intentional evidence, labelled as historical.
  const narrative = JSON.stringify(deployments.v6Demo) + String(deployments.wiringReadBack);
  assert.match(narrative, /demo/i);
  assert.match(String(deployments.wiringReadBack), /HISTORICAL/i);
});

test("settlement token is MockUSDG on testnet with the faucet documented", () => {
  assert.equal(deployments.settlementToken.address.toLowerCase(), "0x8c4aa106a0a0d9ecaed5c87e1ae766aa8efbf006");
  assert.equal(deployments.settlementToken.decimals, 6);
  assert.match(deployments.settlementToken.faucet, /1000e6|1,000/);
});

test("contract addresses match the frontend defaults in lib/addresses.ts", () => {
  const src = readFileSync(join(here, "../lib/addresses.ts"), "utf8");
  for (const [name, addr] of Object.entries(deployments.contracts)) {
    assert.ok(src.includes(addr), `frontend default for ${name} must match deployments.json (${addr})`);
  }
});

test("registryMigration records the five canonical registrations as active", () => {
  const mig = deployments.registryMigration;
  assert.ok(mig, "registryMigration block must exist");
  for (const [symbol, addr] of Object.entries(CANONICAL)) {
    const entry = mig.canonicalRegistrations[symbol];
    assert.ok(entry, `${symbol} present in canonicalRegistrations`);
    assert.equal(entry.token.toLowerCase(), addr);
    assert.equal(entry.active, true, `${symbol} must be recorded active`);
    assert.match(entry.tx, /^0x[0-9a-f]{64}$/);
  }
});

test("historical demo txs are labelled so they cannot be read as active registrations", () => {
  const hashes = deployments.deployTxHashes;
  assert.match(hashes._readme, /NOT the active registrations/i);
  assert.ok(hashes.registerAssetTSLA_canonical, "TSLA canonical tx keyed explicitly");
  for (const k of ["registerAssetAMZN_demo_deactivated", "registerAssetPLTR_demo_deactivated", "registerAssetAMD_demo_deactivated", "registerAssetNFLX_demo_deactivated"]) {
    assert.ok(hashes[k], `${k} retained as evidence`);
    assert.match(k, /demo_deactivated$/, `${k} key names the demo reality`);
  }
  assert.equal(hashes.registerAssetAMZN, undefined, "ambiguous bare key removed");
});

test("NFLX reactivation is documented with both the close and the reopen tx", () => {
  const nflx = deployments.registryMigration.nflxReactivation;
  assert.match(nflx.deactivatedTx, /^0x[0-9a-f]{64}$/);
  assert.equal(nflx.reactivatedTx, "0x792a1a77d084a6103cfd73ca12c5a6f0134832be73ba1bb6a3a81d404faee6b6");
  assert.ok(nflx.reactivatedBlock > nflx.deactivatedBlock, "reactivation happened after the close");
  assert.equal(nflx.reactivatedAt, "2026-09-29");
});

test("demo deactivations are recorded for all four legacy tokens", () => {
  const deactivations = deployments.registryMigration.deactivations;
  assert.equal(Object.keys(deactivations).length, 4);
  for (const key of Object.keys(deactivations)) {
    const addr = key.split(" ")[0].toLowerCase();
    assert.ok(DEMOS.includes(addr), `${addr} is a known demo token`);
    assert.match(deactivations[key].tx, /^0x[0-9a-f]{64}$/);
  }
});

test("assets block carries a registrationTx per symbol and never a demo token address", () => {
  for (const [symbol, entry] of Object.entries(deployments.assets)) {
    assert.match(entry.registrationTx, /^0x[0-9a-f]{64}$/, `${symbol} registrationTx recorded`);
    assert.match(entry.registrationNote, /event-verified 2026-09-29/);
    if (entry.historicalDemoRegistrationTx) {
      assert.match(entry.historicalDemoRegistrationTx, /HISTORICAL ONLY/, `${symbol} demo tx labelled`);
    }
  }
});

test("demoFeeds block no longer claims only TSLA is registered", () => {
  assert.doesNotMatch(deployments.demoFeeds.note, /Only TSLA is registered/i);
  assert.match(deployments.demoFeeds.note, /HISTORICAL v6-era/i);
});
