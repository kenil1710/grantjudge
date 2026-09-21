/**
 * GenLayer client setup for GrantJudge.
 *
 *   - `getReadClient()`   — no signer, for `@gl.public.view` methods. Safe anywhere.
 *   - `getWalletClient()` — browser-only, signs via an injected EIP-1193 wallet.
 */
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

/**
 * Next inlines `process.env.NEXT_PUBLIC_*` at build time only for *literal*
 * member access — `process.env[name]` silently yields undefined in the browser.
 * Hence the literal reads below rather than a lookup helper.
 */
const rawContractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const rawCanonicalAddress = process.env.NEXT_PUBLIC_CANONICAL_ADDRESS;
const rawConsumerAddress = process.env.NEXT_PUBLIC_CONSUMER_ADDRESS;
const rawNetwork = process.env.NEXT_PUBLIC_GENLAYER_NETWORK;

/**
 * Always use the SDK's built-in chain definitions rather than hand-rolling a
 * chain object: they carry the consensus/staking/fee-manager addresses and
 * `isStudio`, which the SDK needs to poll transactions.
 */
const CHAINS = { "studio-dev": studioDevnet } as const;

export type NetworkName = keyof typeof CHAINS;

function resolveNetwork(value: string | undefined): NetworkName {
  if (!value) return "studio-dev";
  if (value in CHAINS) return value as NetworkName;
  throw new Error(
    `NEXT_PUBLIC_GENLAYER_NETWORK must be one of ${Object.keys(CHAINS).join(" | ")}, got: ${value}`,
  );
}

export const NETWORK = resolveNetwork(rawNetwork);
export const chain = CHAINS[NETWORK];

/** Studio networks are gasless and faucet-funded — a 0 GEN balance is normal. */
export const IS_GASLESS = Boolean(chain.isStudio);

/** `chain.id` as the hex string EIP-1193 expects. Derived, never hand-written. */
export const CHAIN_ID_HEX = `0x${chain.id.toString(16)}`;

export const NETWORK_LABEL = "Studio Dev";

const WALLET_NETWORK: Record<NetworkName, { name: string; explorer?: string }> = {
  "studio-dev": {
    name: "GenLayer Studio Devnet",
    explorer: "https://studio-dev.genlayer.com",
  },
};

function addChainParams() {
  const profile = WALLET_NETWORK[NETWORK];
  const explorer = profile.explorer ?? chain.blockExplorers?.default?.url;
  return {
    chainId: CHAIN_ID_HEX,
    chainName: profile.name,
    rpcUrls: [...chain.rpcUrls.default.http],
    nativeCurrency: {
      name: chain.nativeCurrency.name,
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
    },
    // Omitted rather than sent empty: MetaMask rejects a malformed entry.
    ...(explorer ? { blockExplorerUrls: [explorer] } : {}),
  };
}

/** Minimal EIP-1193 shape — avoids depending on wallet-specific typings. */
export type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function hasInjectedWallet(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export async function getWalletChainId(): Promise<string | null> {
  if (!hasInjectedWallet()) return null;
  try {
    const id = await window.ethereum!.request({ method: "eth_chainId" });
    return typeof id === "string" ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Asks the wallet to add this network. MetaMask treats this as add-and-switch,
 * so it is safe to call even when the chain is already known.
 */
export async function addNetworkToWallet(): Promise<void> {
  if (!hasInjectedWallet()) {
    throw new Error("No injected wallet found. Install MetaMask to continue.");
  }
  await window.ethereum!.request({
    method: "wallet_addEthereumChain",
    params: [addChainParams()],
  });
}

export async function switchToNetwork(): Promise<void> {
  if (!hasInjectedWallet()) {
    throw new Error("No injected wallet found. Install MetaMask to continue.");
  }
  try {
    await window.ethereum!.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code !== 4902) throw error;
    await addNetworkToWallet();
  }
}

function assertAddress(value: string | undefined, name: string): `0x${string}` {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy frontend/.env.example to frontend/.env.local and set it.`,
    );
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} is not a 20-byte hex address: ${value}`);
  }
  return value as `0x${string}`;
}

/** The GrantJudge instance this app reads and writes. */
export const CONTRACT_ADDRESS = assertAddress(
  rawContractAddress,
  "NEXT_PUBLIC_CONTRACT_ADDRESS",
);

/** The canonical instance (24-hour appeal window). Named in /docs only. */
export const CANONICAL_ADDRESS: string | null =
  rawCanonicalAddress && /^0x[0-9a-fA-F]{40}$/.test(rawCanonicalAddress)
    ? rawCanonicalAddress
    : null;

/** GrantConsumer, the composability demo. Optional — the docs page links it. */
export const CONSUMER_ADDRESS: string | null =
  rawConsumerAddress && /^0x[0-9a-fA-F]{40}$/.test(rawConsumerAddress)
    ? rawConsumerAddress
    : null;

/**
 * Same-origin relay for Studio, implemented at `app/api/rpc/route.ts`.
 *
 * Studio serves CORS headers on success but drops them on its 429s, so an
 * exhausted rate limit reaches the browser as "No 'Access-Control-Allow-Origin'
 * header is present" rather than as the rate-limit error it is. Going through
 * our own origin means the browser can always read the response, so failures
 * arrive with their real reason attached.
 */
const STUDIO_PROXY_PATH = "/api/rpc";

/**
 * Browser-only, deliberately: the relay path is relative, and a relative URL is
 * not a legal `fetch` target in Node. During SSR the direct URL is also simply
 * correct — server-side requests have no same-origin policy to trip over.
 */
function rpcUrl(): string {
  const direct = chain.rpcUrls.default.http[0];
  if (typeof window === "undefined") return direct;
  return STUDIO_PROXY_PATH;
}

/**
 * The chain object handed to `createClient`, with the transport pointed at
 * whatever `rpcUrl()` resolved to.
 *
 * A copy, never the SDK's exported singleton: `genlayer-js` treats
 * `createClient({ endpoint })` as license to MUTATE `chain.rpcUrls.default.http`
 * in place, and this module also hands the chain to `addChainParams()`. Writing
 * the relay path onto the singleton would feed MetaMask `"/api/rpc"` as a
 * network's RPC URL, producing a wallet entry that cannot reach anything.
 */
function clientChain() {
  const url = rpcUrl();
  if (url === chain.rpcUrls.default.http[0]) return chain;
  return {
    ...chain,
    rpcUrls: { ...chain.rpcUrls, default: { ...chain.rpcUrls.default, http: [url] } },
  };
}

let readClient: ReturnType<typeof createClient> | null = null;

/** Read-only client for view methods. No account, so it can never sign. */
export function getReadClient() {
  readClient ??= createClient({ chain: clientChain() });
  return readClient;
}

export function getWalletClient(account: `0x${string}`) {
  if (typeof window === "undefined") {
    throw new Error("getWalletClient is browser-only; guard it behind an effect.");
  }
  const provider = window.ethereum;
  if (!provider) {
    throw new Error("No injected wallet found. Install MetaMask to send transactions.");
  }
  return createClient({ chain: clientChain(), provider, account });
}

export async function requestAccount(): Promise<`0x${string}`> {
  if (!hasInjectedWallet()) {
    throw new Error("No injected wallet found. Install MetaMask to continue.");
  }
  const accounts = (await window.ethereum!.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts?.length) throw new Error("Wallet returned no accounts.");
  return accounts[0] as `0x${string}`;
}

/** Puts the wallet on the right network as part of connecting. */
export async function ensureCorrectNetwork(): Promise<void> {
  if (!hasInjectedWallet()) return;
  await switchToNetwork();
}

/**
 * Explorer link for a tx hash or address.
 *
 * Studio Devnet's chain definition declares no block explorer, and Studio
 * itself is a single-page app that answers 200 for any path — so a guessed
 * `/contracts/<addr>` deep link would look verified without being so. This
 * returns the Studio root instead. A plausible-looking dead link is worse than
 * an honest one.
 */
export function explorerUrl(kind: "tx" | "address", value: string): string {
  const base = chain.blockExplorers?.default?.url?.replace(/\/$/, "") ?? "";
  if (!base) return "https://studio-dev.genlayer.com";
  return `${base}/${kind}/${value}`;
}
