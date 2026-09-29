"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { decodeEventLog, formatUnits } from "viem";
import { SegmentedControl, Eyebrow, TxStatus, IconAlert, type TxFail } from "@/components/ui";
import { TokenLogo } from "@/components/TokenLogo";
import { useDeployed, useAssets, settlementTokenFor, parseTokenAmount, usd18ToToken } from "@/lib/protocol";
import { noteAbi, erc20Abi, mockUSDGAbi } from "@/lib/abis";
import { robinhoodTestnet } from "@/lib/chain";
import { NETWORK } from "@/lib/network";
import { fmtUsd18, fmtPrice, fmtExpiry, fmtQty, fmtToken } from "@/lib/format";

/**
 * The buy-protection flow, in one place.
 *
 * Both the dashboard panel and /protect render this, so the quote read, the position
 * guard, the approval step and the create call exist exactly once. Two copies of a
 * transaction flow is how one page silently drifts from the other's safety checks.
 *
 * `variant` only changes the arrangement, never the behaviour:
 *   "card"  — the dashboard panel: From/To blocks, fee row, one CTA (the reference layout)
 *   "page"  — the full /protect view: asset grid, ticket, sticky terms rail
 */

const DAY = 24n * 60n * 60n;

const LEVELS = [
  { label: "70%", value: 70n * 10n ** 16n, hint: "protects if price drops 30%" },
  { label: "80%", value: 80n * 10n ** 16n, hint: "protects if price drops 20%" },
  { label: "90%", value: 90n * 10n ** 16n, hint: "protects if price drops 10%" },
];

const DURATIONS = [
  { label: "1 day", value: DAY },
  { label: "7 days", value: 7n * DAY },
  { label: "14 days", value: 14n * DAY },
  { label: "30 days", value: 30n * DAY },
];

export function ProtectFlow({ variant = "page" }: { variant?: "page" | "card" }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { deployed } = useDeployed();
  const { assets } = useAssets();
  const st = settlementTokenFor(chainId);

  const [asset, setAsset] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [level, setLevel] = useState(LEVELS[1].value);
  const [duration, setDuration] = useState(DURATIONS[0].value);

  const selected = assets.find((a) => a.token === asset);
  const amountWei = selected ? parseTokenAmount(amount, selected.decimals) : 0n;

  // Position guard mirrored from the contract: create() reverts InsufficientPosition unless
  // the caller holds the protected amount. Block it in the UI; don't mint reverts.
  const held = selected?.balance;
  const holdsEnough = held === undefined || held >= amountWei;
  const overPosition = amountWei > 0n && held !== undefined && held < amountWei;

  // The quote is read from the chain — the UI never prices anything itself.
  const quoteQuery = useReadContract({
    ...{ address: deployed?.note, abi: noteAbi },
    functionName: "quote",
    args: deployed && selected && amountWei > 0n ? [selected.token, amountWei, level, duration] : undefined,
    query: { enabled: !!deployed && !!selected && amountWei > 0n, refetchInterval: 30_000 },
  });
  const quote = quoteQuery.data;

  const premiumUSD18 = quote?.[0];
  const protectedUSD18 = quote?.[1];
  const premiumToken = premiumUSD18 !== undefined ? usd18ToToken(premiumUSD18, st?.decimals ?? 6) : 0n;

  const {
    data: allowance,
    refetch: refetchAllowance,
  } = useReadContract({
    address: st?.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && deployed ? [address, deployed.vault] : undefined,
    // Poll with the balances: an approval must flip the CTA on its own, and a stale
    // allowance cache is what left the button greyed on "Approve first" forever.
    query: { enabled: !!address && !!deployed && !!st?.address, refetchInterval: 15_000 },
  });

  const { data: usdgBalance } = useReadContract({
    address: st?.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!st?.address, refetchInterval: 15_000 },
  });

  // Approve and create get separate write slots. Sharing one meant the approval receipt
  // was celebrated as "Protection created", and the create flow inherited the approval's
  // transaction state.
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: approveWaiting,
    error: approveError,
  } = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approveHash });

  const {
    writeContract: writeCreate,
    data: createHash,
    isPending: createWaiting,
    error: createError,
  } = useWriteContract();
  const createReceipt = useWaitForTransactionReceipt({ hash: createHash });

  const {
    writeContract: writeFaucet,
    data: faucetHash,
    isPending: faucetPending,
    error: faucetError,
  } = useWriteContract();
  const faucetReceipt = useWaitForTransactionReceipt({ hash: faucetHash });

  // Terms at the moment the create was submitted — the confirmation card shows what was
  // actually bought, not whatever the quote box has drifted to since.
  const submitted = useRef<{
    qty: string;
    symbol: string;
    level: string;
    duration: string;
    premiumToken: bigint;
    premiumUSD18: bigint;
    protectedUSD18: bigint;
    expiry: bigint;
  } | null>(null);

  const [successOpen, setSuccessOpen] = useState(false);
  useEffect(() => {
    if (createReceipt.isSuccess) setSuccessOpen(true);
  }, [createReceipt.isSuccess]);

  // The note id only exists on-chain: read it from the NoteCreated log of the confirmed
  // receipt — never from local arithmetic.
  const createdNoteId = useMemo(() => {
    for (const log of createReceipt.data?.logs ?? []) {
      try {
        const ev = decodeEventLog({ abi: noteAbi, data: log.data, topics: log.topics, strict: false });
        if (ev.eventName === "NoteCreated") return (ev.args as unknown as { noteId: bigint }).noteId;
      } catch {
        // A log from another contract in the same receipt; try the next one.
      }
    }
    return undefined;
  }, [createReceipt.data]);

  useEffect(() => {
    if (approveReceipt.isSuccess) refetchAllowance();
  }, [approveReceipt.isSuccess, refetchAllowance]);

  const approving = approveWaiting || approveReceipt.isLoading;
  const buying = createWaiting || createReceipt.isLoading;
  const needsApproval = !!quote && allowance !== undefined && allowance < premiumToken;
  const allowanceUnknown = !!quote && allowance === undefined;

  const isMockUSDG = chainId === 46630 && st?.address?.toLowerCase() === "0x8c4aa106a0a0d9ecaed5c87e1ae766aa8efbf006";
  const usdgBalanceUnknown = usdgBalance === undefined && !!quote;
  const hasEnoughUsdg = !usdgBalanceUnknown && usdgBalance !== undefined && usdgBalance >= premiumToken;

  const readyToAct = isConnected && !!deployed && chainId === robinhoodTestnet.id && !!selected;
  const canApprove = readyToAct && !!quote && !!needsApproval && !approving && !buying && hasEnoughUsdg;
  const canCreate =
    readyToAct && !!quote && holdsEnough && !needsApproval && !allowanceUnknown && !approving && !buying && hasEnoughUsdg;

  function approve() {
    if (!deployed || !st || !premiumToken) return;
    writeApprove({ address: st.address, abi: erc20Abi, functionName: "approve", args: [deployed.vault, premiumToken] });
  }

  function create() {
    if (!deployed || !selected || !quote || !st) return;
    const [premiumUSD, protectedUSD, expiry] = quote;
    submitted.current = {
      qty: fmtQty(amountWei, selected.decimals),
      symbol: selected.symbol,
      level: LEVELS.find((l) => l.value === level)?.label ?? "",
      duration: DURATIONS.find((d) => d.value === duration)?.label ?? "",
      premiumToken: usd18ToToken(premiumUSD, st.decimals),
      premiumUSD18: premiumUSD,
      protectedUSD18: protectedUSD,
      expiry,
    };
    writeCreate({
      address: deployed.note,
      abi: noteAbi,
      functionName: "create",
      args: [selected.token, amountWei, level, duration],
    });
  }

  function resetFlow() {
    setSuccessOpen(false);
    setAmount("");
    submitted.current = null;
  }

  const createFail = createError
    ? /InsufficientPosition/.test(`${createError.message} ${(createError as { shortMessage?: string }).shortMessage ?? ""}`)
      ? "you must hold the stock you are protecting — reduce the amount"
      : createError.message.slice(0, 120)
    : null;

  const quoteFail = quoteQuery.error
    ? /0x19abf40e|StalePrice/.test(`${quoteQuery.error.message} ${(quoteQuery.error as { shortMessage?: string }).shortMessage ?? ""}`)
    : false;

  // One honest line for whatever stands between the user and the CTA, rendered above it —
  // a greyed button with no stated reason reads as a broken page.
  const blocker = !isConnected
    ? "Connect your wallet to buy protection."
    : chainId !== robinhoodTestnet.id
      ? "Switch to Robinhood Chain testnet — that is where the protocol lives."
      : !selected
        ? "Select a stock token."
        : amountWei === 0n
          ? "Enter the amount you want to protect."
          : overPosition
            ? `You hold ${fmtQty(held, selected.decimals, selected.symbol)} — you can't protect more than you own.`
            : quoteQuery.isError
              ? quoteFail
                ? "The price feed for this stock is stale — a fresh price has to be written before it can be quoted."
                : "The chain didn't return a quote — adjust the amount or try again."
              : !quote
                ? "Getting your quote from the chain…"
                : usdgBalanceUnknown
                  ? "Checking your USDG balance…"
                  : !hasEnoughUsdg
                    ? isMockUSDG
                      ? `You need ${fmtToken(premiumToken, st?.decimals ?? 6, st?.symbol)} to cover the premium — claim test USDG first.`
                      : `Insufficient ${st?.symbol ?? "USDG"} balance to pay the premium.`
                    : allowanceUnknown
                      ? "Checking your USDG allowance…"
                      : needsApproval
                        ? `The vault needs a ${st?.symbol ?? "USDG"} allowance before it can collect the premium.`
                        : null;

  const txState: TxFail | null = successOpen
    ? null
    : createWaiting
      ? { kind: "pending", text: "Confirm in wallet…" }
      : createReceipt.isLoading
        ? { kind: "busy", text: "Waiting for confirmation…" }
        : createFail
          ? { kind: "error", text: `Failed: ${createFail}` }
          : null;

  const positionValue = (amountWei * (selected?.price8 ?? 0n)) / 10n ** 8n;

  const blockerLine = blocker ? (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-mist">
      <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pending" />
      {blocker}
    </p>
  ) : null;

  const faucetNeeded = isMockUSDG && !!quote && !!usdgBalance && usdgBalance < premiumToken;

  const actions = successOpen ? null : (
    <div className="space-y-3">
      {blockerLine}
      {faucetNeeded && !needsApproval ? (
        <div className="space-y-1">
          <button
            onClick={() => writeFaucet({ address: st!.address, abi: mockUSDGAbi, functionName: "faucet" })}
            disabled={faucetPending}
            className="btn-ghost w-full rounded-2xl px-4 py-3 text-sm"
          >
            {faucetPending || faucetReceipt.isLoading ? "Claiming…" : `Get test ${st?.symbol ?? "USDG"}`}
          </button>
          {faucetError ? (
            <p className="text-xs text-loss">
              {faucetError.message.includes("FaucetCooldown") ? "Cooldown active — try again later" : faucetError.message.slice(0, 120)}
            </p>
          ) : null}
          {faucetReceipt.isSuccess ? (
            <p className="text-xs text-success">Faucet claimed — balances refreshing…</p>
          ) : null}
        </div>
      ) : null}
      {needsApproval ? (
        <div className="space-y-1">
          <button onClick={approve} disabled={!canApprove} className="btn-ghost w-full rounded-2xl px-4 py-3 text-sm">
            {approving ? "Approving…" : `Approve ${st?.symbol ?? "USDG"}`}
          </button>
          {approveError ? (
            <p className="text-xs text-loss">
              {(approveError as { shortMessage?: string }).shortMessage ?? approveError.message}
            </p>
          ) : null}
        </div>
      ) : null}
      <button onClick={create} disabled={!canCreate} className="btn-action w-full rounded-2xl px-4 py-3.5 text-sm">
        {needsApproval ? "Approve first" : overPosition ? "More than you hold" : "Buy protection"}
      </button>
      <TxStatus state={txState} />
    </div>
  );

  // Confirmation card. Gated on the create receipt being confirmed on-chain — never on
  // the wallet having merely submitted the transaction.
  const bought = submitted.current;
  const success =
    successOpen && createReceipt.isSuccess && bought ? (
      <div className="inset-card rise rounded-3xl border border-action/40 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow>Protection active</Eyebrow>
            <div className="mt-1 font-display text-2xl font-bold tracking-tight">
              Note #{createdNoteId !== undefined ? createdNoteId.toString() : "…"}
            </div>
          </div>
          <Image src="/scroll.png" alt="" width={1024} height={381} priority className="h-16 w-auto shrink-0 object-contain" />
        </div>
        <dl className="mt-5 space-y-2.5 text-sm">
          <Row label="Position" value={`${bought.qty} ${bought.symbol}`} />
          <Row label="Floor" value={fmtUsd18(bought.protectedUSD18)} />
          <Row
            label="Duration"
            value={`${bought.duration} · expires ${fmtExpiry(bought.expiry)}`}
          />
          <Row
            label="Premium paid"
            value={`${fmtToken(bought.premiumToken, st?.decimals ?? 6, st?.symbol)} (${fmtUsd18(bought.premiumUSD18)})`}
          />
        </dl>
        {createHash ? (
          <a
            href={`${NETWORK.explorer}/tx/${createHash}`}
            target="_blank"
            rel="noreferrer"
            className="tnum mt-4 inline-flex items-center gap-1.5 text-xs text-action hover:underline"
          >
            {`${createHash.slice(0, 12)}…${createHash.slice(-8)}`} — view on the explorer ↗
          </a>
        ) : null}
        <div className="mt-5">
          <button type="button" onClick={resetFlow} className="text-xs text-mist hover:text-ink hover:underline">
            Protect another position
          </button>
        </div>
      </div>
    ) : null;

  /* ------------------------------------------------------------------ card variant —
   * The dashboard panel: From (your position) → To (your floor) → fee → CTA. */
  if (variant === "card") {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Protect a position</Eyebrow>
          {selected && held !== undefined && held > 0n ? (
            <button
              type="button"
              onClick={() => setAmount(formatUnits(held, selected.decimals))}
              className="text-xs text-action hover:underline"
            >
              Max
            </button>
          ) : null}
        </div>

        {/* From */}
        <div className="mt-3 rounded-2xl bg-surface-3 p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-mist">Stock you hold</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="tnum w-full min-w-0 bg-transparent font-display text-3xl font-bold tracking-tight outline-none placeholder:text-mist/50"
            />
            <div className="flex shrink-0 items-center gap-2 rounded-full bg-surface-2 px-3 py-2">
              {selected ? <TokenLogo symbol={selected.symbol} className="h-5 w-5" /> : null}
              <AssetSelect
                assets={assets.filter((a) => a.active)}
                value={asset}
                onChange={setAsset}
              />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-mist">
            <span className="tnum">{selected && amountWei > 0n ? fmtUsd18(positionValue) : "—"}</span>
            <span className="tnum">
              {held === undefined
                ? "connect to see balance"
                : `Balance: ${fmtQty(held, selected?.decimals ?? 18)}`}
            </span>
          </div>
        </div>

        <div className="relative -my-2 text-center">
          <span className="relative z-10 inline-block rounded-full border-4 border-surface bg-surface-2 px-2 py-1 text-xs text-mist">
            ↓
          </span>
        </div>

        {/* To */}
        <div className="rounded-2xl bg-surface-3 p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-mist">Your floor price</div>
          <div className="tnum mt-2 font-display text-3xl font-bold tracking-tight">
            {protectedUSD18 !== undefined ? fmtUsd18(protectedUSD18) : "—"}
          </div>
          <div className="mt-3">
            <SegmentedControl options={LEVELS} value={level} onChange={setLevel} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-mist">
            <span>{quote ? `expires ${fmtExpiry(quote[2])}` : "pick an amount to quote"}</span>
            <span className="tnum">{selected ? fmtPrice(selected.price8) : "—"} now</span>
          </div>
        </div>

        <div className="mt-4">
          <Eyebrow>Duration</Eyebrow>
          <div className="mt-2">
            <SegmentedControl options={DURATIONS} value={duration} onChange={setDuration} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-mist">
          <span>
            ⓘ Paid up front, non-refundable — the cost is paid regardless of whether price drops.
          </span>
          <span className="tnum shrink-0 rounded-xl bg-surface-3 px-3 py-1.5 text-ink">
            {premiumUSD18 !== undefined ? `${fmtUsd18(premiumUSD18)} cost` : "cost —"}
          </span>
        </div>

        {overPosition && selected ? (
          <p className="mt-3 text-xs text-loss">
            You hold {fmtQty(held, selected.decimals, selected.symbol)} — you can&apos;t protect more than you own.
          </p>
        ) : null}

        <div className="mt-auto pt-5">{success ?? actions}</div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ page variant */
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* Ticket */}
      <div className="inset-card rise rounded-3xl p-6 lg:col-span-3" style={{ animationDelay: "60ms" }}>
        <Eyebrow>Asset</Eyebrow>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {assets.map((a, i) => {
            const active = asset === a.token;
            const disabled = !a.active;
            return (
              <button
                key={a.token}
                type="button"
                disabled={disabled}
                onClick={() => setAsset(a.token)}
                className={`rounded-2xl border px-3 py-3 text-left transition-colors duration-150 disabled:opacity-40 ${
                  active ? "border-action/60 bg-surface-3" : "border-line bg-surface hover:border-mist/40 hover:bg-white/[0.03]"
                }`}
                style={{ transitionDelay: `${i * 10}ms` }}
              >
                <span className="flex items-center gap-2">
                  <TokenLogo symbol={a.symbol} className="h-6 w-6" />
                  <span className="block font-display text-sm font-bold">{a.symbol}</span>
                </span>
                <span className="tnum mt-0.5 block text-xs text-mist">
                  {disabled ? "coming soon" : fmtPrice(a.price8)}
                </span>
                {a.balance !== undefined && a.balance > 0n && !disabled ? (
                  <span className="tnum mt-0.5 block text-[10px] text-fog">
                    you hold {fmtQty(a.balance, a.decimals)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <Eyebrow>Amount ({selected?.symbol ?? "tokens"})</Eyebrow>
            {selected && held !== undefined && held > 0n ? (
              <button
                type="button"
                onClick={() => setAmount(formatUnits(held, selected.decimals))}
                className="text-xs text-action hover:underline"
              >
                Protect max
              </button>
            ) : null}
          </div>
          <input
            className="tnum mt-2 w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none focus:border-action/60"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
          {selected ? (
            <p className={`mt-2 text-xs ${overPosition ? "text-fog" : "text-mist"}`}>
              {held === undefined
                ? "Connect a wallet to see what you hold."
                : overPosition
                  ? `You hold ${fmtQty(held, selected.decimals, selected.symbol)} — you can't protect more than you own.`
                  : `You hold ${fmtQty(held, selected.decimals, selected.symbol)}. The stock stays in your wallet.`}
            </p>
          ) : null}
        </div>

        <div className="mt-6">
          <Eyebrow>Protection level</Eyebrow>
          <div className="mt-2">
            <SegmentedControl options={LEVELS} value={level} onChange={setLevel} />
          </div>
        </div>

        <div className="mt-6">
          <Eyebrow>Duration</Eyebrow>
          <div className="mt-2">
            <SegmentedControl options={DURATIONS} value={duration} onChange={setDuration} />
          </div>
        </div>
      </div>

      {/* Terms rail */}
      <div className="lg:col-span-2">
        <div className="inset-card rise sticky rounded-3xl p-6 lg:top-24" style={{ animationDelay: "120ms" }}>
          <Eyebrow>Terms</Eyebrow>
          {quote ? (
            <>
              <div className="mt-4">
                <div className="text-xs text-mist">Cost up front</div>
                <div className="tnum mt-1 font-display text-4xl font-bold leading-none tracking-tight text-ink">
                  {fmtUsd18(premiumUSD18)}
                </div>
                <div className="tnum mt-1 text-xs text-mist">
                  {premiumToken.toLocaleString("en-US", { maximumFractionDigits: 2 })} {st?.symbol}
                </div>
              </div>
              <dl className="mt-6 space-y-3 text-sm">
                <Row label="Value you're protecting" value={fmtUsd18(positionValue)} />
                <Row label="Current price" value={fmtPrice(selected?.price8)} />
                <Row label="Floor price" value={fmtUsd18(protectedUSD18)} />
                <Row label="Maximum payout" value={fmtUsd18(protectedUSD18)} />
                <Row label="Expires" value={fmtExpiry(quote[2])} />
              </dl>
            </>
          ) : (
            <p className="mt-4 text-sm text-mist">
              Pick a stock and an amount — the cost, your floor and the expiry all come back from the chain.
            </p>
          )}

          <div className="mt-6">{success ?? actions}</div>
        </div>
      </div>
    </div>
  );
}

function AssetSelect({
  assets,
  value,
  onChange,
}: {
  assets: { token: string; symbol: string; name?: string; price8: bigint | undefined; decimals: number; balance?: bigint }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = assets.find((a) => a.token === value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 min-w-[120px] justify-between"
      >
        <span className="truncate text-sm text-ink">{selected ? selected.name ?? selected.symbol : "Select"}</span>
        <span className="text-[10px] text-mist">▼</span>
      </button>
      {open && (
        <div className="absolute right-0 left-auto w-[320px] top-full z-20 mt-2 max-h-80 overflow-auto rounded-2xl border border-line bg-surface-2 shadow-xl p-1">
          {assets.length === 0 ? (
            <div className="px-3 py-3 text-xs text-mist">No active assets</div>
          ) : (
            assets.map((a) => (
              <button
                key={a.token}
                type="button"
                onClick={() => {
                  onChange(a.token);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left rounded-xl transition-colors hover:bg-white/[0.04] ${
                  a.token === value ? "bg-white/[0.04]" : ""
                }`}
              >
                <TokenLogo symbol={a.symbol} className="h-7 w-7 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{a.name ?? a.symbol}</div>
                  <div className="truncate text-[11px] text-mist">{a.symbol} · {fmtPrice(a.price8)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="tnum text-xs text-ink">{a.balance !== undefined ? fmtQty(a.balance, a.decimals) : "—"}</div>
                  <div className="tnum text-[10px] text-mist">balance</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-mist">{label}</dt>
      <dd className="tnum font-display font-bold">{value}</dd>
    </div>
  );
}
