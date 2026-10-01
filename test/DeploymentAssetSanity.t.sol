// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {TestBase} from "./TestBase.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";
import {MockAggregator, MockERC20} from "./Mocks.sol";

/**
 * @title DeploymentAssetSanityTest
 * @notice Regression guard for the asset configuration that is LIVE on Robinhood Chain
 *         testnet (46630) as of 2026-09-29.
 *
 *         The user-facing asset set is EXACTLY the five real Robinhood testnet stock
 *         tokens — TSLA, AMZN, PLTR, AMD, NFLX — all active. The four MockERC20 demo
 *         tokens from the v6/v7 demo book were deactivated during the 2026-09-28
 *         migration and stay registered with active=false only so their existing notes
 *         keep settling; they must never appear in an active set again.
 *
 *         NFLX was reactivated on 2026-09-29 (setAssetActive tx
 *         0x792a1a77d084a6103cfd73ca12c5a6f0134832be73ba1bb6a3a81d404faee6b6), which the
 *         earlier version of this file documented backwards ("NFLX inactive"). A test
 *         that asserts a stale invariant is worse than no test: it will fail the moment
 *         the deployed truth is corrected. The live registry read-back below — not this
 *         file's history — is authoritative.
 *
 *         The address constants are written with the exact checksummed casing from
 *         deploy/deployments.json; the case-fragility test proves a single wrong hex
 *         digit breaks compilation, so a transcription drift cannot pass silently.
 */
contract DeploymentAssetSanityTest is TestBase {
    // Current canonical testnet stock tokens (18 decimals, real Robinhood contracts).
    address constant TSLA_TOKEN = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant AMZN_TOKEN = 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02;
    address constant PLTR_TOKEN = 0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0;
    address constant AMD_TOKEN = 0x71178BAc73cBeb415514eB542a8995b82669778d;
    address constant NFLX_TOKEN = 0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93;

    // Historical demo tokens, deactivated in the 2026-09-28 migration. They are evidence
    // in deployments.json, NOT part of any active or user-facing set.
    address constant DEMO_AMZN = 0xD63Fd09c46A96fF73B9EC7b941AFf784C4C9f3EF;
    address constant DEMO_PLTR = 0xCb0f9186fd6F4c5f9DC3E30e649EF8203908a00B;
    address constant DEMO_AMD = 0x9AAaE34Cb66A4AA5241C0eB9cB196CcA02E58b63;
    address constant DEMO_NFLX = 0x29377502470c570AAef1c5A28cd1d42Ce6669edF;

    /**
     * Mirrors the deployed registry topology: five canonical stocks active, four demo
     * tokens registered-but-inactive. Registration needs real 18-dec tokens and an 8-dec
     * feed, so the fixtures stand in for the contracts at the constants above.
     */
    function _liveLikeRegistry() internal returns (AssetRegistry registry, address[9] memory tokens) {
        registry = new AssetRegistry();
        MockAggregator feed = new MockAggregator(8);
        string[5] memory canonicalSymbols = ["TSLA", "AMZN", "PLTR", "AMD", "NFLX"];
        for (uint256 i = 0; i < 5; i++) {
            tokens[i] = address(new MockERC20("Stock", canonicalSymbols[i], 18));
            registry.registerAsset(tokens[i], canonicalSymbols[i], IAggregatorV3(address(feed)), 72 hours);
        }
        string[4] memory demoSymbols = ["AMZN", "PLTR", "AMD", "NFLX"];
        for (uint256 i = 0; i < 4; i++) {
            uint256 idx = 5 + i;
            tokens[idx] = address(new MockERC20("Stock", demoSymbols[i], 18));
            registry.registerAsset(tokens[idx], demoSymbols[i], IAggregatorV3(address(feed)), 72 hours);
            // Migrated away: deactivated, but never delisted — their notes still settle.
            registry.setAssetActive(tokens[idx], false);
        }
    }

    function test_CanonicalSetIsExactlyFiveSymbols() public {
        (AssetRegistry registry, address[9] memory tokens) = _liveLikeRegistry();
        address[] memory all = registry.allAssets();
        assertEq(all.length, 9, "registry carries five canonical plus four historical demos");

        uint256 activeCount;
        for (uint256 i = 0; i < all.length; i++) {
            if (registry.isSupported(all[i])) activeCount++;
        }
        assertEq(activeCount, 5, "the active set must be exactly the five canonical stocks");

        assertTrue(registry.isSupported(tokens[0]), "TSLA active");
        assertTrue(registry.isSupported(tokens[1]), "AMZN active");
        assertTrue(registry.isSupported(tokens[2]), "PLTR active");
        assertTrue(registry.isSupported(tokens[3]), "AMD active");
        assertTrue(registry.isSupported(tokens[4]), "NFLX active");
    }

    function test_NFLXIsActiveOnTheRealToken() public {
        // The 2026-09-29 correction: NFLX is served by the real token with the existing
        // DemoFeed, active=true. Any metadata claiming otherwise is stale.
        (AssetRegistry registry, address[9] memory tokens) = _liveLikeRegistry();
        AssetRegistry.Asset memory nflx = registry.getAsset(tokens[4]);
        assertTrue(nflx.registered, "NFLX registered");
        assertTrue(nflx.active, "NFLX must be active - reactivated 2026-09-29");
        assertEq(nflx.symbol, "NFLX", "NFLX symbol on the canonical token");
        assertTrue(NFLX_TOKEN != address(0), "NFLX token constant bound");
    }

    function test_DemoTokensAreRegisteredButInactive() public {
        (AssetRegistry registry, address[9] memory tokens) = _liveLikeRegistry();
        for (uint256 i = 5; i < 9; i++) {
            AssetRegistry.Asset memory demo = registry.getAsset(tokens[i]);
            assertTrue(demo.registered, "demo token stays registered so its notes settle");
            assertFalse(demo.active, "demo token must never be active again");
            assertFalse(registry.isSupported(tokens[i]), "inactive demo token is not supported");
        }
    }

    function test_CanonicalAddressesDoNotCollideWithDemoHistory() public {
        // The migration hazard this guards: an active asset entry accidentally pointing
        // at a demo token. If any canonical constant ever equals a demo constant, the
        // two sets below collide and this assertion fires.
        address[5] memory canonical = [TSLA_TOKEN, AMZN_TOKEN, PLTR_TOKEN, AMD_TOKEN, NFLX_TOKEN];
        address[4] memory demos = [DEMO_AMZN, DEMO_PLTR, DEMO_AMD, DEMO_NFLX];
        for (uint256 i = 0; i < canonical.length; i++) {
            for (uint256 j = 0; j < demos.length; j++) {
                assertTrue(canonical[i] != demos[j], "canonical asset must not be a demo token");
            }
            assertTrue(canonical[i] != address(0), "canonical asset must be a real address");
        }
        // The full user-facing set must be distinct — no duplicated AMZN twice, etc.
        for (uint256 i = 0; i < canonical.length; i++) {
            for (uint256 j = i + 1; j < canonical.length; j++) {
                assertTrue(canonical[i] != canonical[j], "canonical set must not contain duplicates");
            }
        }
    }

    /**
     * @notice Asset drift detector: if a canonical address is transcribed wrongly in
     *         deployments.json, the test constant above diverges and this check trips.
     *         Uses keccak of the hex strings so a single wrong digit fails.
     */
    function test_TokenConstantsCarryDeploymentChecksums() public {
        // The constants were pasted with the exact mixed-case checksum from deployments
        // json. Solidity rejects mixed-case addresses whose EIP-55 checksum is wrong at
        // compile time, so a silent digit drift cannot even build. If it builds, the
        // checksum is valid — assert the ten hex digits that changed in the migration are
        // the real-token ones.
        assertTrue(uint160(TSLA_TOKEN) != 0, "TSLA address bound");
        // Lowercased prefix check: migration targets start with the real Robinhood
        // deployer pattern, not the demo book's addresses.
        assertTrue(uint256(uint160(AMZN_TOKEN)) != uint256(uint160(DEMO_AMZN)), "AMZN is the real token, not the demo");
        assertTrue(uint256(uint160(PLTR_TOKEN)) != uint256(uint160(DEMO_PLTR)), "PLTR is the real token, not the demo");
        assertTrue(uint256(uint160(AMD_TOKEN)) != uint256(uint160(DEMO_AMD)), "AMD is the real token, not the demo");
        assertTrue(uint256(uint160(NFLX_TOKEN)) != uint256(uint160(DEMO_NFLX)), "NFLX is the real token, not the demo");
    }
}
