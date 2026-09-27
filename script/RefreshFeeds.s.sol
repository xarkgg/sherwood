// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ScriptBase} from "./ScriptBase.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {DemoFeed} from "../src/testnet/DemoFeed.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";

/// @title RefreshFeeds
/// @notice TESTNET ONLY. Rewrites every registered asset's current price back into its
///         DemoFeed so `updatedAt` moves to now — the demo's substitute for Chainlink's
///         own push cadence (the protocol itself still enforces freshness and sanity on
///         everything it reads; this only keeps the demo data inside those bounds).
///
///         Skips: inactive assets, feeds fresher than half their staleness bound (so a
///         daily cron only pays gas when a refresh is actually needed), and feeds with
///         no set() at all — an EMPTY revert means the selector does not exist (a real
///         aggregator), which is safe to leave alone. A NON-empty revert is re-thrown:
///         that is a wrong signer key or a broken feed, and the run must fail loudly
///         rather than report success while refreshing nothing.
///
///         Required env: REGISTRY (AssetRegistry address; PRIVATE_KEY supplied to forge)
///         Run: forge script script/RefreshFeeds.s.sol --rpc-url <RPC_URL> --broadcast
contract RefreshFeeds is ScriptBase {
    function run() external {
        AssetRegistry registry = AssetRegistry(vmEnvAddress("REGISTRY"));
        address[] memory tokens = registry.allAssets();

        vmStartBroadcast();
        for (uint256 i = 0; i < tokens.length; i++) {
            AssetRegistry.Asset memory entry = registry.getAsset(tokens[i]);
            if (!entry.active || !entry.registered) {
                vmLog(string.concat(entry.symbol, ": inactive, skipped"));
                continue;
            }
            (, int256 answer, , uint256 updatedAt, ) = IAggregatorV3(address(entry.feed)).latestRoundData();
            if (block.timestamp - updatedAt < entry.maxStaleness / 2) {
                vmLog(string.concat(entry.symbol, ": fresh enough, skipped"));
                continue;
            }
            try DemoFeed(address(entry.feed)).set(answer) {
                vmLog(string.concat(entry.symbol, ": refreshed at ", vmToString(answer)));
            } catch (bytes memory reason) {
                require(
                    reason.length == 0,
                    string.concat(entry.symbol, ": set() reverted - wrong signer key or broken feed")
                );
                vmLog(string.concat(entry.symbol, ": feed has no set(), skipped"));
            }
        }
        vmStopBroadcast();
    }
}
