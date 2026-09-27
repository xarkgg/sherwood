"use client";

/**
 * EIP-1193 provider type for the one place Sherwood talks to an injected wallet
 * directly (the add-network call in NetworkPanel). AppKit claims `window.ethereum`
 * globally as `Record<string, unknown>`, erasing `request()`, so the use site casts
 * back to this surface. Wallet selection is never Sherwood's job: WalletConnect's
 * chooser owns that, so no per-wallet globals or flags are typed here.
 */

/** The EIP-1193 surface every injected provider speaks, whether injected or in-app. */
export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};
