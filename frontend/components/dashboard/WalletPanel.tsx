"use client";

import Link from "next/link";
import { TokenLogo } from "@/components/TokenLogo";
import { WalletIcon } from "@/components/WalletIcon";
import { fmtQty, fmtUsd18, fmtPrice } from "@/lib/format";
import type { AssetView } from "@/lib/protocol";

/**
 * The wallet column: one connected address and the assets it holds.
 *
 * The reference mock showed two wallets with hardcoded balances. Only one wallet can ever
 * be connected here, and inventing a second would mean inventing an address and balances,
 * so this renders the real one. Rows are registry-driven, so a newly registered asset
 * appears without touching this file.
 */
export function WalletPanel({
  address,
  isConnected,
  assets,
  decimalsOf,
  nativeBalance,
  settlement,
}: {
  address: string | undefined;
  isConnected: boolean;
  assets: AssetView[];
  decimalsOf: (a: AssetView) => number;
  /** Native gas balance (ETH). Symbol is not read from the chain: this RPC answers nothing
   *  for eth_symbol, so the label is supplied rather than rendered blank. */
  nativeBalance?: { value: bigint; decimals: number };
  /** The settlement token (USDG) leads the list: every premium and payout moves in it. */
  settlement?: { value: bigint; decimals: number; symbol: string };
}) {
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;

  if (!isConnected || !address) {
    return (
      <div className="rounded-2xl border border-line/70 bg-surface px-4 py-5 text-center">
        <p className="text-sm text-fog">No wallet connected</p>
        <p className="mt-1 text-xs text-mist">
          Use <span className="text-ink">Connect wallet</span> above to see balances and protection.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Address chip — copy/explorer live in the header menu, not duplicated here. */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
        <span className="flex items-center gap-2">
          <WalletIcon seed={address} className="h-6 w-6 rounded-full" />
          <span className="tnum text-sm text-ink">{short}</span>
        </span>
        <span className="text-xs text-mist">connected</span>
      </div>

      <div className="mt-3 flex flex-col">
        {/* The settlement token leads — every premium paid and every payout received moves
            in USDG, so it is the money side of the wallet. Like ETH it is not a registered
            stock and cannot itself be protected. */}
        {settlement ? (
          <div className="flex items-center justify-between gap-3 border-b border-line/40 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <TokenLogo symbol={settlement.symbol} className="h-8 w-8" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{settlement.symbol}</span>
                <span className="block truncate text-[11px] text-mist">
                  {settlement.symbol} · settlement token
                </span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="text-right">
                <div className={`tnum text-sm ${settlement.value > 0n ? "text-ink" : "text-mist"}`}>
                  {fmtQty(settlement.value, settlement.decimals)}
                </div>
                <div className="text-[11px] text-mist">pays premiums</div>
              </div>
              <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-mist">
                Money
              </span>
            </div>
          </div>
        ) : null}

        {/* Native gas first, the way a wallet lists it. ETH is not a registered asset and
            cannot be: the registry takes ERC20 stock tokens, and both the position guard and
            settlement read balanceOf(), which a native balance does not have. So it shows the
            balance and says plainly that it is gas and not protectable — never a protect link
            that would revert. */}
        {nativeBalance ? (
          <div className="flex items-center justify-between gap-3 border-b border-line/40 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <TokenLogo symbol="ETH" className="h-8 w-8" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">Ether</span>
                <span className="block truncate text-[11px] text-mist">ETH · gas token</span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="text-right">
                <div className="tnum text-sm text-ink">
                  {fmtQty(nativeBalance.value, nativeBalance.decimals)}
                </div>
                <div className="text-[11px] text-mist">for gas</div>
              </div>
              <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-mist">
                Gas
              </span>
            </div>
          </div>
        ) : null}

        {assets.length === 0 ? (
          <p className="py-6 text-center text-xs text-mist">Nothing registered on this network.</p>
        ) : (
          assets.map((a, i) => {
            const decimals = decimalsOf(a);
            // An undefined balance is a failed or in-flight read, not a real zero —
            // rendering it as 0.00 told users their tokens were gone when the read
            // simply did not come back. A dash says so honestly.
            const balance = a.balance;
            const fiat = a.price8 !== undefined && balance !== undefined ? (balance * a.price8) / 10n ** 8n : undefined;
            return (
              <div
                key={a.token}
                className="flex items-center justify-between gap-3 border-b border-line/40 py-3 last:border-b-0"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <TokenLogo symbol={a.symbol} className="h-8 w-8" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{a.name ?? a.symbol}</span>
                    <span className="block truncate text-[11px] text-mist">
                      {a.active ? `${a.symbol} · ${fmtPrice(a.price8)}` : `${a.symbol} · coming soon`}
                    </span>
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <div className={`tnum text-sm ${balance !== undefined && balance > 0n ? "text-ink" : "text-mist"}`}>
                      {fmtQty(balance, decimals)}
                    </div>
                    <div className="tnum text-[11px] text-mist">
                      {fiat !== undefined && balance !== undefined && balance > 0n ? fmtUsd18(fiat) : "—"}
                    </div>
                  </div>
                  {/* An asset the registry lists but has closed for new notes cannot be
                      protected, so the row offers no action — and no price, which would
                      imply it can be bought at one. */}
                  {a.active ? (
                    <Link
                      href="/protect"
                      aria-label={`Protect ${a.symbol}`}
                      title={`Protect ${a.symbol}`}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs text-mist transition-colors hover:text-action"
                    >
                      ↗
                    </Link>
                  ) : (
                    <span className="rounded-full border border-pending/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-pending">
                      Soon
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
