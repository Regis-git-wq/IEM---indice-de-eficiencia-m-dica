import crypto from "node:crypto";
import { promisify } from "node:util";
import express, { type NextFunction, type Request, type Response } from "express";
import { db } from "./db.js";
import { sendPasswordResetEmail } from "./mail.js";
import { createRateLimiter } from "./rateLimit.js";

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const COOKIE = "resumi_session";
const SESSION_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL_MS = 60 * 60 * 1000;
const MIN = 60 * 1000;

const loginByEmail = createRateLimiter(10, 15 * MIN);
const loginByIp = createRateLimiter(50, 15 * MIN);
const registerByIp = createRateLimiter(10, 60 * MIN);
const forgotByEmail = createRateLimiter(3, 60 * MIN);
const forgotByIp = createRateLimiter(10, 60 * MIN);
const resetByIp = createRateLimiter(20, 60 * MIN);

/** Endereço público do app, usado no link do e-mail. Nunca vem do cabeçalho Host da requisição. */
const APP_URL = (
  process.env.APP_URL ??
  process.env.RENDER_EXTERNAL_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined) ??
  (process.env.NODE_ENV === "production" ? undefined : "http://localhost:5173")
)?.replace(/\/$/, "");

function tooMany(res: Response, waitSec: number) {
  res.setHeader("Retry-After", String(waitSec));
  res.status(429).json({ error: `Muitas tentativas. Tente de novo em ${Math.ceil(waitSec / 60)} minuto(s).` });
}

export interface User {
  id: string;
  email: string;
  name: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [, salt, hash] = stored.split("$");
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function readCookie(req: Request, name: string) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function startSession(res: Response, userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const maxAge = SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    sha256(token),
    userId,
    Date.now() + maxAge,
  );
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
    path: "/",
  });
}

/** Preenche req.user se houver uma sessão válida. */
export function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = readCookie(req, COOKIE);
  if (token) {
    const row = db
      .prepare(
        `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(sha256(token), Date.now()) as User | undefined;
    if (row) req.user = row;
  }
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Entre na sua conta para continuar." });
    return;
  }
  next();
}

export const authRouter = express.Router();

authRouter.post("/register", async (req, res) => {
  const wait = registerByIp.hit(req.ip ?? "");
  if (wait) return tooMany(res, wait);
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const name = String(req.body?.name ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!EMAIL_RE.test(email)) return void res.status(400).json({ error: "E-mail inválido." });
  if (!name) return void res.status(400).json({ error: "Informe seu nome." });
  if (password.length < 8) return void res.status(400).json({ error: "A senha precisa ter pelo menos 8 caracteres." });
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    return void res.status(409).json({ error: "Já existe uma conta com este e-mail." });
  }
  const user: User = { id: crypto.randomUUID(), email, name };
  db.prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
    user.id,
    email,
    name,
    await hashPassword(password),
    Date.now(),
  );
  startSession(res, user.id);
  res.status(201).json({ user });
});

authRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const wait = Math.max(loginByEmail.hit(email), loginByIp.hit(req.ip ?? ""));
  if (wait) return tooMany(res, wait);
  const row = db.prepare("SELECT id, email, name, password_hash FROM users WHERE email = ?").get(email) as
    | (User & { password_hash: string })
    | undefined;
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return void res.status(401).json({ error: "E-mail ou senha incorretos." });
  }
  loginByEmail.reset(email);
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").run(row.id, Date.now());
  startSession(res, row.id);
  res.json({ user: { id: row.id, email: row.email, name: row.name } });
});

authRouter.post("/logout", (req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  res.clearCookie(COOKIE, { path: "/" });
  res.status(204).end();
});

authRouter.get("/me", (req, res) => {
  res.json({ user: req.user ?? null });
});

authRouter.post("/forgot", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const wait = Math.max(forgotByIp.hit(req.ip ?? ""), forgotByEmail.hit(email));
  if (wait) return tooMany(res, wait);

  // A resposta é sempre a mesma, para não revelar quais e-mails têm conta.
  res.json({ ok: true });

  const user = db.prepare("SELECT id, email, name FROM users WHERE email = ?").get(email) as User | undefined;
  if (!user) return;
  if (!APP_URL) {
    console.error("[auth] APP_URL não configurado: não é possível montar o link de redefinição de senha.");
    return;
  }
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(user.id);
  db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    sha256(token),
    user.id,
    Date.now() + RESET_TTL_MS,
  );
  try {
    await sendPasswordResetEmail(user.email, user.name, `${APP_URL}/?reset=${token}`);
  } catch (err) {
    console.error("[mail] Falha ao enviar e-mail de redefinição:", err);
  }
});

authRouter.post("/reset", async (req, res) => {
  const wait = resetByIp.hit(req.ip ?? "");
  if (wait) return tooMany(res, wait);
  const token = String(req.body?.token ?? "");
  const password = String(req.body?.password ?? "");
  if (password.length < 8) return void res.status(400).json({ error: "A senha precisa ter pelo menos 8 caracteres." });

  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name FROM password_resets r JOIN users u ON u.id = r.user_id
       WHERE r.token_hash = ? AND r.expires_at > ?`,
    )
    .get(sha256(token), Date.now()) as User | undefined;
  if (!row) {
    return void res.status(400).json({ error: "Este link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\"." });
  }

  const hash = await hashPassword(password);
  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, row.id);
    db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(row.id);
    // Desconecta todos os aparelhos: se alguém tinha acesso com a senha antiga, perde.
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.id);
  })();
  loginByEmail.reset(row.email);
  startSession(res, row.id);
  res.json({ user: row });
});
