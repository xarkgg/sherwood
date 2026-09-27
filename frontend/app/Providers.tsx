"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { injected } from "wagmi/connectors";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { robinhoodTestnet } from "@/lib/chain";
import { appkit } from "@/lib/appkit";

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const metadata = {
  name: "SherwoodNotes",
  description: "Programmable downside protection for Stock Tokens",
  url: "https://sherwoodnotes.vercel.app",
  icons: [],
};

const queryClient = new QueryClient();

const transports = {
  [robinhoodTestnet.id]: http(process.env.NEXT_PUBLIC_RPC_ROBINHOOD_TESTNET),
};

let wagmiConfig: Parameters<typeof WagmiProvider>[0]["config"];

if (wcProjectId) {
  // AppKit owns the connect flow. Its modal lists the installed browser extensions
  // (EIP-6963 — MetaMask, OKX, …) and connects them directly on desktop, deep-links
  // phone wallets, and falls back to a QR for everyone else. The adapter builds the
  // wagmi config and registers its own connectors, so no hand-rolled connector list
  // here — adding one back would double-register wallets in the modal.
  const wagmiAdapter = new WagmiAdapter({
    networks: [robinhoodTestnet],
    projectId: wcProjectId,
    ssr: true,
    transports,
  });
  wagmiConfig = wagmiAdapter.wagmiConfig;
  appkit.modal = createAppKit({
    adapters: [wagmiAdapter],
    networks: [robinhoodTestnet],
    projectId: wcProjectId,
    metadata,
    themeMode: "dark",
  });
} else {
  // No WalletConnect project id (clean checkout / env-less deploy): the chooser can't
  // exist, so connect is the browser's injected wallet only — deliberate degradation,
  // never a crash. One connector, matching the single-button UX: the flow never picks
  // beyond injected(), so registering metaMask/coinbaseWallet connectors here would
  // be dead code. shimDisconnect stays off for the same reason as before: faking a
  // disconnectable session is what made connecting look automatic and never ask.
  wagmiConfig = createConfig({
    chains: [robinhoodTestnet],
    connectors: [injected()],
    transports,
    ssr: true,
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
