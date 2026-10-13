import { useState, useSyncExternalStore } from "react";
import { useAccount } from "../account";
import { getSyncStatus, subscribeSyncStatus, syncNow } from "../sync";

function SyncLine() {
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
  const time = status.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;
  let text: string;
  if (status.state === "syncing") text = "Sincronizando…";
  else if (status.state === "offline") text = `Sem conexão${status.pending ? ` · ${status.pending} pendente(s)` : ""}`;
  else if (status.state === "error") text = `Erro ao sincronizar${status.message ? `: ${status.message}` : ""}`;
  else if (status.pending > 0) text = `${status.pending} alteração(ões) a enviar`;
  else text = time ? `Sincronizado às ${time}` : "Sincronizado";

  return (
    <div className={`sync-line ${status.state}`}>
      <span className="sync-dot" />
      <span className="grow">{text}</span>
      <button className="link" onClick={() => void syncNow().catch(() => {})} disabled={status.state === "syncing"}>
        ↻
      </button>
    </div>
  );
}

export function AccountPanel() {
  const { user, ready, logout } = useAccount();
  const [open, setOpen] = useState(false);

  if (!ready) return null;

  if (user) {
    return (
      <div className="account">
        <div className="account-name">{user.name}</div>
        <div className="muted small">{user.email}</div>
        <SyncLine />
        <button className="link danger" onClick={() => void logout()}>
          Sair
        </button>
      </div>
    );
  }

  return (
    <div className="account">
      <p className="muted small">
        Seus dados estão só neste aparelho. Entre para acessá-los também no celular ou no computador.
      </p>
      <button className="primary full" onClick={() => setOpen(true)}>
        Entrar / Criar conta
      </button>
      {open && <AuthDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

function AuthDialog({ onClose }: { onClose: () => void }) {
  const { login, register } = useAccount();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{mode === "login" ? "Entrar" : "Criar conta"}</h3>
        <p className="muted small">
          O que você já salvou neste aparelho será enviado para a sua conta.
        </p>
        {mode === "register" && (
          <input placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        )}
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <input
          type="password"
          placeholder={mode === "register" ? "Senha (mín. 8 caracteres)" : "Senha"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "register" ? 8 : undefined}
          required
        />
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "Não tem conta? Criar uma" : "Já tenho conta"}
        </button>
      </form>
    </div>
  );
}
