import type { AppKit } from "@reown/appkit";

/**
 * Handle to the AppKit modal, set by Providers when a WalletConnect project id is
 * configured. The header taps this instead of AppKit's React hooks, which throw when
 * AppKit was never initialized — the honest degradation on deployments without a
 * project id is the legacy injected-wallet flow, not a crash.
 */
export const appkit: { modal: AppKit | null } = {
  modal: null,
};
