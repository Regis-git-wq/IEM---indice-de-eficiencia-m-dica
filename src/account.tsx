import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { clearAll, listDirty, onDataChange } from "./db";
import { AuthExpiredError, refreshPending, syncNow } from "./sync";

export interface User {
  id: string;
  email: string;
  name: string;
}

interface AccountContextValue {
  user: User | null;
  /** false enquanto ainda verifica se há uma sessão aberta. */
  ready: boolean;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount fora do AccountProvider");
  return ctx;
}

async function postAuth(path: string, body: unknown): Promise<User> {
  const res = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { user?: User; error?: string };
  if (!res.ok || !data.user) throw new Error(data.error ?? "Não foi possível conectar ao servidor.");
  return data.user;
}

const SYNC_INTERVAL_MS = 30_000;
const SYNC_DEBOUNCE_MS = 1_500;

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user: User | null }) => setUser(d.user))
      .catch(() => {}) // sem rede: segue no modo local
      .finally(() => setReady(true));
  }, []);

  // Enquanto logado: sincroniza ao abrir, periodicamente, ao voltar para o app/rede e após cada alteração local.
  useEffect(() => {
    if (!user) return;
    const run = () =>
      syncNow().catch((err) => {
        if (err instanceof AuthExpiredError) setUser(null);
      });
    let debounce: number | undefined;
    const onVisible = () => document.visibilityState === "visible" && run();

    run();
    const interval = window.setInterval(run, SYNC_INTERVAL_MS);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribe = onDataChange(({ remote }) => {
      if (remote) return;
      void refreshPending();
      clearTimeout(debounce);
      debounce = window.setTimeout(run, SYNC_DEBOUNCE_MS);
    });
    return () => {
      clearInterval(interval);
      clearTimeout(debounce);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [user?.id]);

  const value: AccountContextValue = {
    user,
    ready,
    login: async (email, password) => setUser(await postAuth("login", { email, password })),
    register: async (name, email, password) => setUser(await postAuth("register", { name, email, password })),
    logout: async () => {
      await syncNow().catch(() => {});
      const pending = (await listDirty()).length;
      if (
        pending > 0 &&
        !confirm(`${pending} alteração(ões) ainda não foram sincronizadas e serão perdidas neste aparelho. Sair mesmo assim?`)
      ) {
        return;
      }
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      // Os dados continuam na conta; o aparelho fica limpo para outra pessoa usar.
      await clearAll();
      setUser(null);
    },
  };

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
