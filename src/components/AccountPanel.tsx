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

/** Token do link "redefinir senha" recebido por e-mail (…/?reset=TOKEN). */
function takeResetTokenFromUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("reset");
  if (token) {
    // Tira o token da barra de endereço para não ficar no histórico.
    url.searchParams.delete("reset");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  return token;
}
const initialResetToken = takeResetTokenFromUrl();

export function AccountPanel() {
  const { user, ready, logout } = useAccount();
  const resetToken = initialResetToken;
  const [dialog, setDialog] = useState<Mode | null>(resetToken ? "reset" : null);

  if (!ready) return null;

  if (user) {
    return (
      <div className="account">
        <div className="account-name">{user.name}</div>
        <div className="muted small">{user.email}</div>
        <SyncLine />
        {dialog === "reset" && (
          <p className="error small">Saia da conta neste aparelho para usar o link de redefinição de senha.</p>
        )}
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
      <button className="primary full" onClick={() => setDialog("login")}>
        Entrar / Criar conta
      </button>
      {dialog && <AuthDialog initialMode={dialog} resetToken={resetToken} onClose={() => setDialog(null)} />}
    </div>
  );
}

type Mode = "login" | "register" | "forgot" | "reset";

const TITLES: Record<Mode, string> = {
  login: "Entrar",
  register: "Criar conta",
  forgot: "Esqueci minha senha",
  reset: "Criar nova senha",
};

function AuthDialog({
  initialMode,
  resetToken,
  onClose,
}: {
  initialMode: Mode;
  resetToken: string | null;
  onClose: () => void;
}) {
  const { login, register, requestPasswordReset, resetPassword } = useAccount();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
    setPassword("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else if (mode === "register") await register(name, email, password);
      else if (mode === "reset") await resetPassword(resetToken ?? "", password);
      else {
        await requestPasswordReset(email);
        setInfo("Se existir uma conta com este e-mail, enviamos um link para criar uma nova senha. Confira também o spam.");
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const needsPassword = mode !== "forgot";
  const newPassword = mode === "register" || mode === "reset";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{TITLES[mode]}</h3>
        <p className="muted small">
          {mode === "forgot"
            ? "Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha."
            : mode === "reset"
              ? "Escolha uma nova senha. Por segurança, os outros aparelhos serão desconectados."
              : "O que você já salvou neste aparelho será enviado para a sua conta."}
        </p>
        {mode === "register" && (
          <input placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        )}
        {mode !== "reset" && (
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        )}
        {needsPassword && (
          <input
            type="password"
            placeholder={newPassword ? "Nova senha (mín. 8 caracteres)" : "Senha"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={newPassword ? "new-password" : "current-password"}
            minLength={newPassword ? 8 : undefined}
            required
          />
        )}
        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}
        {!info && (
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Aguarde…" : mode === "forgot" ? "Enviar link" : mode === "reset" ? "Salvar nova senha" : TITLES[mode]}
          </button>
        )}
        {mode === "login" && (
          <>
            <button type="button" className="link" onClick={() => switchTo("forgot")}>
              Esqueci minha senha
            </button>
            <button type="button" className="link" onClick={() => switchTo("register")}>
              Não tem conta? Criar uma
            </button>
          </>
        )}
        {mode !== "login" && (
          <button type="button" className="link" onClick={() => switchTo("login")}>
            {mode === "register" ? "Já tenho conta" : "Voltar para o login"}
          </button>
        )}
      </form>
    </div>
  );
}
