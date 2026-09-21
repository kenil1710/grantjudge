"use client";

/**
 * Wallet state, in one place.
 *
 * DELIBERATELY NOT AUTO-CONNECTING. The landing page has no wallet button at
 * all and must not provoke a wallet prompt; a visitor who has not asked to
 * connect is a visitor who should be able to read the page. `eth_accounts` is
 * consulted on mount only to RESTORE a session the user already granted — it
 * never prompts — and `eth_requestAccounts` is called from a click and nowhere
 * else.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CHAIN_ID_HEX,
  ensureCorrectNetwork,
  getWalletChainId,
  hasInjectedWallet,
  requestAccount,
} from "@/lib/genlayer";

type WalletState = {
  account: `0x${string}` | null;
  chainId: string | null;
  onRightNetwork: boolean;
  hasWallet: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHasWallet(hasInjectedWallet());
    if (!hasInjectedWallet()) return;

    let live = true;
    // `eth_accounts` NEVER prompts — it reports what the user already allowed.
    void window
      .ethereum!.request({ method: "eth_accounts" })
      .then((value) => {
        const list = value as string[];
        if (live && list?.length) setAccount(list[0] as `0x${string}`);
      })
      .catch(() => undefined);
    void getWalletChainId().then((id) => {
      if (live) setChainId(id);
    });

    const onAccounts = (...args: unknown[]) => {
      const list = args[0] as string[];
      setAccount(list?.length ? (list[0] as `0x${string}`) : null);
    };
    const onChain = (...args: unknown[]) => {
      setChainId(String(args[0]).toLowerCase());
    };
    window.ethereum!.on?.("accountsChanged", onAccounts);
    window.ethereum!.on?.("chainChanged", onChain);
    return () => {
      live = false;
      window.ethereum!.removeListener?.("accountsChanged", onAccounts);
      window.ethereum!.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const next = await requestAccount();
      await ensureCorrectNetwork();
      setAccount(next);
      setChainId(await getWalletChainId());
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(
        /user rejected|denied/i.test(message)
          ? "Connection cancelled in the wallet."
          : message,
      );
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    setError(null);
    try {
      await ensureCorrectNetwork();
      setChainId(await getWalletChainId());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  /** Clears this app's view of the session. A dapp cannot revoke access in the
   *  wallet itself, and pretending otherwise would be a lie in a button. */
  const disconnect = useCallback(() => setAccount(null), []);

  const value = useMemo<WalletState>(
    () => ({
      account,
      chainId,
      onRightNetwork: chainId === CHAIN_ID_HEX.toLowerCase(),
      hasWallet,
      connecting,
      error,
      connect,
      disconnect,
      switchNetwork,
    }),
    [account, chainId, hasWallet, connecting, error, connect, disconnect, switchNetwork],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside a WalletProvider");
  return ctx;
}
