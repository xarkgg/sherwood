import Link from "next/link";
import { Header } from "@/components/Header";
import { WalletIcon } from "@/components/WalletIcon";
import { LandingFloors } from "@/components/landing/LandingFloors";
import { LandingFooter } from "@/components/landing/LandingFooter";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "/dashboard";

/**
 * The landing page — the visitor's first look at Sherwood, on the reference's shape:
 * a polka-dot hero with floating marks and one copy block, then a dark market board,
 * then the footer. The reference's scattered avatars and card art are generated marks
 * (WalletIcon) in this app's palette; its hardcoded prices are live chain reads
 * (LandingFloors). The whole page is static until the board mounts — the sell happens
 * in the hero, the proof happens on-chain.
 */

const BADGES = [
  { seed: "floor-guard", cls: "left-[20%] top-[72px] h-14 w-14 rounded-2xl", surface: "bg-surface-3 border border-line", palette: "brand" as const },
  { seed: "oracle", cls: "left-[6%] top-[150px] h-24 w-24 rounded-[28px]", surface: "bg-surface border border-line", palette: "brand" as const },
  { seed: "usdg", cls: "left-[17%] top-[268px] h-28 w-28 rounded-[32px] shadow-[0_16px_36px_rgba(0,0,0,0.35)]", surface: "bg-white", palette: "ink" as const },
  { seed: "vault", cls: "right-[18%] top-[92px] h-20 w-20 rounded-3xl", surface: "bg-surface-2 border border-line", palette: "brand" as const },
  { seed: "sherwood", cls: "right-[11%] top-[232px] h-36 w-36 rounded-[38px] shadow-[0_16px_36px_rgba(0,0,0,0.35)]", surface: "bg-action", palette: "ink" as const },
];

export default function Landing() {
  return (
    <>
      <Header variant="landing" />
      <main>
        <section className="dot-grid relative overflow-hidden">
          {/* Floating marks — desktop only, like the reference. */}
          {BADGES.map((b) => (
            <div
              key={b.seed}
              aria-hidden
              className={`absolute hidden items-center justify-center lg:flex ${b.cls} ${b.surface}`}
            >
              <WalletIcon seed={b.seed} background={null} palette={b.palette} className="h-1/2 w-1/2" />
            </div>
          ))}

          <div className="relative z-[5] mx-auto max-w-2xl px-5 pb-16 pt-20 text-center sm:pb-24 sm:pt-24">
            <h1 className="font-display text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl">
              Keep the upside.
              <br />
              Cap your losses.
            </h1>
            <p className="mx-auto mt-5 max-w-md text-sm font-medium leading-relaxed text-fog">
              Sherwood puts a floor under the Stock Tokens you hold on Robinhood Chain.
              Pick a floor, pay a fixed cost up front — if the price falls through it, you’re reimbursed the difference. Settled against prices read from the chain.
            </p>
            <Link
              href={APP_URL}
              className="btn-action mt-8 inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm"
            >
              Launch app
            </Link>
          </div>
        </section>

        {/* The primitive in three steps — the whole mechanism before the market board. */}
        <section className="mx-auto max-w-5xl px-5 pb-14 pt-12 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <span className="font-display text-2xl font-bold text-action">1</span>
              <span className="mt-1 block text-sm font-bold text-ink">Pick your floor</span>
              <span className="mt-1 block text-xs leading-relaxed text-mist">
                Choose a stock you hold and set the floor at 70, 80 or 90% of today's price.
              </span>
            </div>
            <div>
              <span className="font-display text-2xl font-bold text-action">2</span>
              <span className="mt-1 block text-sm font-bold text-ink">Pay one fixed cost</span>
              <span className="mt-1 block text-xs leading-relaxed text-mist">
                A small premium up front — the vault reserves your payout in collateral the moment you buy.
              </span>
            </div>
            <div>
              <span className="font-display text-2xl font-bold text-action">3</span>
              <span className="mt-1 block text-sm font-bold text-ink">We pay the gap</span>
              <span className="mt-1 block text-xs leading-relaxed text-mist">
                If the price settles below your floor, you're reimbursed the difference. Above it, every gain stays yours.
              </span>
            </div>
          </div>
        </section>

        <section className="dot-grid bg-surface">
          <div className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-6">
            <LandingFloors />
          </div>
          <LandingFooter />
        </section>
      </main>
    </>
  );
}
