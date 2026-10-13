import crypto from "node:crypto";
import { promisify } from "node:util";
import express, { type NextFunction, type Request, type Response } from "express";
import { db } from "./db.js";

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const COOKIE = "resumi_session";
const SESSION_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const row = db.prepare("SELECT id, email, name, password_hash FROM users WHERE email = ?").get(email) as
    | (User & { password_hash: string })
    | undefined;
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return void res.status(401).json({ error: "E-mail ou senha incorretos." });
  }
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
