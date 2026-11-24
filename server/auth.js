/* Senhas (scrypt), sessões em cookie HttpOnly e controle de acesso. */
import crypto from "crypto";
import * as db from "./db.js";

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const COOKIE = "voyce_sid";
const SESSION_MS = 12 * 3600e3; // um plantão
const MAX_FAILS = 5, LOCK_MS = 5 * 60e3;
const fails = new Map(); // login -> { n, until }

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
export function verifyPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored || "").split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const hash = Buffer.from(hashHex, "hex");
  const test = crypto.scryptSync(String(pw), Buffer.from(saltHex, "hex"), hash.length);
  return crypto.timingSafeEqual(hash, test);
}
export function validatePassword(pw) {
  if (typeof pw !== "string" || pw.length < 8) throw new HttpError(400, "A senha precisa ter pelo menos 8 caracteres.");
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, "A senha precisa ter letras e números.");
}

export function audit(req, acao, detalhe = "") {
  db.run("INSERT INTO auditoria (em, usuario_id, acao, detalhe, ip) VALUES (?,?,?,?,?)",
    [Date.now(), req.user ? req.user.id : null, acao, String(detalhe).slice(0, 1000), req.ip || ""]);
}

export const publicUser = u => u && ({ id: u.id, nome: u.nome, login: u.login, categoria: u.categoria, coren: u.coren, admin: !!u.admin, ativo: !!u.ativo, trocar_senha: !!u.trocar_senha });

function parseCookies(h) {
  const out = {}; String(h || "").split(";").forEach(p => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}

export function startSession(req, res, user) {
  const token = crypto.randomBytes(32).toString("hex"), now = Date.now();
  db.run("DELETE FROM sessoes WHERE expira_em < ?", [now]);
  db.run("INSERT INTO sessoes (token, usuario_id, criado_em, expira_em) VALUES (?,?,?,?)", [token, user.id, now, now + SESSION_MS]);
  const secure = req.secure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`);
}
export function endSession(req, res) {
  const t = parseCookies(req.headers.cookie)[COOKIE];
  if (t) db.run("DELETE FROM sessoes WHERE token = ?", [t]);
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

/* Carrega req.user a partir do cookie. */
export function sessionMiddleware(req, res, next) {
  const t = parseCookies(req.headers.cookie)[COOKIE];
  if (t) {
    const s = db.get("SELECT s.expira_em, u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ?", [t]);
    if (s && s.expira_em > Date.now() && s.ativo) req.user = s;
  }
  next();
}

/* Proteção CSRF: toda escrita na API precisa do cabeçalho enviado pelo próprio app. */
export function csrfGuard(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD") return next();
  if (req.get("X-Requested-With") !== "voyce") return next(new HttpError(403, "Requisição recusada."));
  next();
}

export const requireUser = (req, res, next) => (req.user ? next() : next(new HttpError(401, "Faça login para continuar.")));
export const requireEnf = (req, res, next) => (req.user && req.user.categoria === "ENF" ? next() : next(new HttpError(403, "Somente enfermeiros podem fazer isto.")));
export const requireAdmin = (req, res, next) => (req.user && req.user.admin ? next() : next(new HttpError(403, "Somente administradores podem fazer isto.")));

export function checkLogin(login, senha) {
  const key = String(login || "").toLowerCase();
  const f = fails.get(key);
  if (f && f.until > Date.now()) throw new HttpError(429, `Muitas tentativas. Tente de novo em ${Math.ceil((f.until - Date.now()) / 60000)} min ou procure o administrador.`);
  const u = db.get("SELECT * FROM usuarios WHERE login = ?", [key]);
  if (!u || !u.ativo || !verifyPassword(senha, u.senha_hash)) {
    const expired = f && f.until && f.until <= Date.now();
    const n = (f && !expired ? f.n : 0) + 1;
    fails.set(key, { n, until: n >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
    throw new HttpError(401, n >= MAX_FAILS ? "Muitas tentativas erradas. Acesso bloqueado por 5 minutos." : "Login ou senha incorretos.");
  }
  fails.delete(key);
  return u;
}
