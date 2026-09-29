# AGENTS.md

This file is the operational contract for coding agents working on **Sherwood**.

Sherwood is a programmable downside protection protocol for tokenized stocks on Robinhood Chain (an Arbitrum-based L2). Users buy Protection Notes to define a floor price, keep all upside, and settle using verified Chainlink prices.

Primary reference: `README.md` (project overview, settlement logic, payout formulas). Design context: `README.md`.

---

## 📦 Project Profile

* **Project:** Sherwood — Downside Protection for Tokenized Stocks
* **Track:** DeFi — Arbitrum Open House Singapore: Online Buildathon (HackQuest, submission closes Oct 4, 2026)
* **Stack:** Solidity (Foundry), TypeScript (viem/wagmi), Next.js frontend
* **Settlement:** Robinhood Chain (mainnet 4663 / testnet 46630); USDG collateral, Chainlink prices
* **Supported Assets:** TSLA, AMZN, NFLX, PLTR, AMD (initial; asset-agnostic design)
* **Build tooling:** Foundry for contracts, npm for frontend, Chainlink price feeds

---

## Core Identity

You are operating inside a **simple, transparent financial primitive**. Every price is verifiable. Every payout is calculable. No trust required — only math and Chainlink.

Every change must preserve:

* **Price Integrity:** All prices come from Chainlink. No estimates, no mocks, no user-supplied values.
* **Vault Safety:** Protocol never sells more protection than it can cover. Capacity checks always happen before premium collection.
* **Settlement Correctness:** Payout formula is always `max(0, (eligibleAmount × entryPrice × level) - (eligibleAmount × settlementPrice))`, where `eligibleAmount = min(note.amount, stock the owner still holds at settlement)`. A note protects a real position, so sold shares stop being covered — but the note still settles and the full reserved liability still releases, even at a zero payout. Two caps frame this: `create` refuses notes whose stack would push a holder's aggregate active exposure past their current stock balance (one position cannot back a stack of notes), and payouts are forfeited past `expiry + SETTLEMENT_WINDOW` (30 days) while the reserve still releases unconditionally. Eligibility is a settlement-instant read — holdings-at-settlement, not proof of continuous ownership; that limitation is documented, not fixed. No edge cases, no special logic.
* **Immutable Terms:** Protection Notes created with specific terms cannot be modified. Terms are guaranteed.
* **Collateral Backing:** Every active Protection Note is backed by reserved collateral in the Vault.
* **Asset Transparency:** Supported assets are registered and verified. Unsupported assets are rejected.

---

## 🛠️ Verification & Build Commands

Before declaring any task complete, run and pass this sequence:

1. **Contracts compile:** `forge build`
2. **Contract tests pass:** `forge test`
3. **Frontend builds:** `npm run build`
4. **Vault safety self-check:** after any change touching vault logic, capacity, or collateral accounting, verify: can the vault ever go insolvent? Are capacity checks always enforced? Is reserved collateral always >= active liability? Do this manually; it's a reasoning step.
5. **Settlement math self-check:** after any change to payout logic, verify the formula by hand for: price above floor (no payout), price below floor (correct payout), edge cases (zero amount, zero duration, unsupported asset).

Run this sequence yourself before calling anything done. Don't wait for human approval.

---

## 🔒 Non-Negotiable Rules

**Always**

* Read project documentation before modifying vault logic, payout formulas, or capacity calculations.
* Check capacity before every Protection Note creation. Reject if total liability exceeds maximum.
* Use Chainlink for entry and settlement prices. Reject stale prices (check freshness timestamp). Reject unsupported assets.
* Verify USDG balance before executing payout. If vault is underfunded, this is a critical bug — stop and fix immediately.
* Emit a clear event for every Note creation, settlement, and payout.
* Reserve collateral atomically with Note creation. Release collateral atomically with settlement.
* Read secrets through `process.env` / `.env` files only.
* Write complete file structures — no truncated sections.
* Never hardcode private keys, API keys, or mnemonics anywhere in the repo.

**Never**

* Accept user-supplied or estimated prices. Always use Chainlink.
* Allow a Protection Note to be created if capacity check fails.
* Modify a Protection Note's terms after creation.
* Release reserved collateral before settlement occurs.
* Execute a payout without verifying vault has sufficient USDG.
* Deploy without testing against Robinhood Chain testnet first.
* Leave `// TODO` markers or partial implementations in place of working code.
* Assume Chainlink is always available — handle stale price gracefully (reject with clear error).

**Ask first** (not really — these are yours to decide)

* Vault reserve buffer percentage (currently 20%) — make it configurable
* Premium rate components (base rate, tier risk, duration risk) — design reasonable defaults
* Supported protection levels (currently 70/80/90) — can stay fixed or become configurable
* Supported durations (currently 1/7/14/30 days) — can stay fixed or become configurable
* Payout settlement delay (currently immediate) — can add a time lock for additional safety
* Frontend UX layout and styling — your call, keep it simple

These are engineering decisions. Decide and move. Flag them in commits if they're non-obvious or touch vault safety. Don't block on human approval for normal engineering calls.

---

## Vault Safety Boundary

The six invariants in Core Identity (price integrity, vault safety, settlement correctness, immutable terms, collateral backing, asset transparency) are the project's thesis — reliable, transparent protection without trust.

You don't need sign-off to touch them, but the bar for visibility is higher:

* Make the call, implement it, and **state it plainly in the commit message** — which invariant, what you decided, and why. One sentence is enough.
* If you're changing the payout formula or capacity calculation, note the math and a manual verification example in the commit.
* The one thing still off-limits: **weakening or removing an invariant itself** (e.g., "let's accept stale prices because Chainlink is down"). Implementing *within* the invariant is your call; changing what the invariant *is* isn't.

---

## Foundry Setup

Sherwood uses Foundry for contract compilation and testing.

**Compile:** `forge build`
**Test:** `forge test`
**Deploy:** `forge script script/Deploy.s.sol --rpc-url <RPC_URL> --broadcast --verify` (Robinhood Chain — chain config selected by chain ID)

If you haven't used Foundry before:
- Install: https://book.getfoundry.sh/getting-started/installation
- Docs: https://book.getfoundry.sh/

---

## Working Style

* Question your own assumptions about prices, capacity, and settlement, but resolve them yourself against project documentation and the code rather than surfacing every question as a stop. If vault capacity is tight and a note might exceed it, go verify the check — don't leave it open.
* Research first, implement second — but implement. Don't leave a design question half-answered when you could just pick the reasonable answer.
* After implementing a change, mentally simulate: normal flow (price rises, no payout), downside trigger (price falls below floor, payout executed), edge cases (zero amount, unsupported asset, stale price, insufficient vault balance). Does the vault ever go insolvent? Are capacity checks always enforced?
* Work is complete when all invariants hold under simulation, tests pass, and (for anything touching the Vault Safety Boundary) the commit message says what you decided.

---

## Priority Order When Editing

1. Preserve vault safety (capacity, collateral backing, solvency)
2. Keep prices honest (Chainlink only, freshness checks)
3. Keep settlement math correct (payout formula, edge cases)
4. Keep the event trail complete and auditable
5. Everything else (gas optimization, frontend polish, configuration)

---

## Developer Resources

* Robinhood Chain Docs: https://docs.robinhood.com/chain/
* Arbitrum Docs: https://docs.arbitrum.io/
* Chainlink Price Feeds: https://docs.chain.link/price-feeds
* Foundry Book: https://book.getfoundry.sh/
* viem (Web3 client): https://viem.sh/
* wagmi (React Web3): https://wagmi.sh/
* Robinhood Chain Testnet: https://testnet.robinhoodchain.com/
* USDG Contract: mainnet (4663) `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` — canonical, per docs. Testnet (46630) protocol default is MockUSDG `0x8c4aa106a0A0d9ECAeD5C87e1AE766aa8Efbf006` (6 decimals, `faucet()` = 1,000 per address per 24h, verified live 2026-09-13) because the official testnet USDG at `0x7E955252E15c84f5768B83c41a71F9eba181802F` has never paid a claim to our wallets. `SETTLEMENT_TOKEN` overrides either; the mock is rejected on mainnet. See README "Verified Environment Facts".

---

## Running Sherwood on Termux (mobile setup)

For anyone picking this repo up from Android/Termux:

```bash
pkg update -y && pkg upgrade -y
pkg install nodejs git -y
npm install
```

**Deploy to Robinhood Chain testnet:**

```bash
export RPC_URL=https://testnet.robinhoodchain.com/
export PRIVATE_KEY=your-testnet-key
npm run deploy
```

**Using AgentRouter for code generation:**

Add to `~/.bashrc`:

```bash
export OPENAI_API_KEY=your-agentrouter-key
export OPENAI_BASE_URL=https://agentrouter.org/v1
export OPENAI_MODEL=gpt-5.6-sol
```

Then reload and launch your agent:

```bash
source ~/.bashrc
opencode
```

Git push over SSH works the same as any other Termux git setup — no extra config needed beyond your existing SSH key.

---

## Deployment Checklist

Before pushing to main:

- [ ] `forge build` compiles without warnings
- [ ] `forge test` passes all tests (100% pass rate required)
- [ ] Deployed to Robinhood Chain testnet (addresses recorded in `deploy/deployments.json`)
- [ ] Frontend connects and reads vault state
- [ ] Created a Protection Note with real stock token and Chainlink price
- [ ] Settled a note successfully (with and without payout)
- [ ] Verified USDG transfers happened on-chain
- [ ] Checked all events were emitted correctly
- [ ] Vault remains solvent (total collateral ≥ active liability)

---

**Sherwood is simple because it has to be. Transparency and verifiability, not complexity.**
