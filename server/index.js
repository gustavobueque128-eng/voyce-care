/* Voyce Care — servidor (API REST + front-end React compilado). */
import express from "express";
import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import os from "os";
import { fileURLToPath } from "url";
import * as db from "./db.js";
import * as A from "./auth.js";
import { HttpError } from "./auth.js";
import { ensureCertificates, sslipName } from "./certs.js";
import { seedDemoIfEmpty } from "./demo.js";
import { news, needsComm, cleanVitals, priority, commText, FIELDS, NUM_FIELDS, CONS, median, isBlank } from "../shared/clinical.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "dist");
const PORT = +process.env.PORT || 3001;
const USE_HTTPS = process.argv.includes("--https") || process.env.HTTPS === "1";
const HTTP_HELPER_PORT = +process.env.CERT_PORT || PORT - 1; // página do certificado em http (só no modo https)

await db.open();
if (seedDemoIfEmpty()) console.log("Dados fictícios de demonstração criados (VOYCE_DEMO=1).");
const TLS = USE_HTTPS ? ensureCertificates(path.join(db.DATA_DIR, "certs")) : null;
const phoneUrl = () => (TLS && TLS.ips[0] ? `https://${sslipName(TLS.ips[0])}:${PORT}` : null);
const certPageUrl = () => (TLS && TLS.ips[0] ? `http://${TLS.ips[0]}:${HTTP_HELPER_PORT}/certificado` : null);
const app = express();
// No Render (e outras hospedagens) o HTTPS termina no proxy: confiar no primeiro proxy para req.secure / req.ip.
const ON_RENDER = !!process.env.RENDER;
app.set("trust proxy", ON_RENDER ? 1 : false);
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "microphone=(self)");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});
function certPage(req, res) {
  const url = phoneUrl() || "(rode com npm run start:https)";
  res.type("html").send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voyce Care · certificado</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:16px;line-height:1.5;color:#14282d;background:#eef3f2}.c{background:#fff;border:1px solid #d3dfdd;border-radius:14px;padding:16px;margin:12px 0}
a.b{display:inline-block;background:#0b6b6b;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700}code{background:#dcefed;padding:2px 6px;border-radius:6px;word-break:break-all}h1{font-size:22px}h2{font-size:17px;margin:0 0 6px}ol{padding-left:20px}</style></head><body>
<h1>Voyce Care no celular</h1>
<div class="c"><h2>1. Baixe o certificado do servidor</h2><p>Instale uma única vez em cada celular ou tablet. Ele faz o aparelho confiar neste servidor da rede local — sem isso o navegador mostra aviso de segurança e bloqueia o microfone.</p>
<p><a class="b" href="/voyce-ca.crt">Baixar certificado</a></p></div>
<div class="c"><h2>2a. Android</h2><ol><li>Toque em <b>Baixar certificado</b>.</li><li>Abra <b>Configurações → Segurança e privacidade → Mais configurações de segurança → Criptografia e credenciais → Instalar um certificado → Certificado CA</b> (o caminho muda um pouco por marca; procure por “certificado CA” nas configurações).</li><li>Toque em <b>Instalar mesmo assim</b>, escolha o arquivo <code>voyce-ca.crt</code> em Downloads e confirme com o desbloqueio.</li></ol></div>
<div class="c"><h2>2b. iPhone / iPad (Safari)</h2><ol><li>Toque em <b>Baixar certificado</b> e em <b>Permitir</b>.</li><li>Abra <b>Ajustes → Perfil Transferido → Instalar</b>.</li><li>Depois, <b>Ajustes → Geral → Sobre → Ajustes de Confiança de Certificados</b> e ative <b>Voyce Care CA</b>.</li></ol></div>
<div class="c"><h2>3. Abra o sistema</h2><p>No <b>Chrome</b> (Android) ou <b>Safari</b> (iPhone), abra:</p><p><code>${url}</code></p><p>Não deve aparecer nenhum aviso de segurança. Entre com o seu login e senha.</p></div>
<p style="font-size:13px;color:#55696d">O celular precisa estar no mesmo Wi-Fi do computador e com internet (o nome .sslip.io é resolvido pela internet; o reconhecimento de voz também usa internet).</p>
</body></html>`);
}
function caFile(req, res) {
  if (!TLS) return res.status(404).type("text").send("Rode o servidor com npm run start:https.");
  res.setHeader("Content-Type", "application/x-x509-ca-cert");
  res.setHeader("Content-Disposition", 'attachment; filename="voyce-ca.crt"');
  res.send(TLS.caDer);
}
app.get("/certificado", certPage);
app.get("/voyce-ca.crt", caFile);
app.use("/api", A.sessionMiddleware, A.csrfGuard);
app.use("/api", (req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

/* ---------- utilitários ---------- */
const wrap = fn => (req, res, next) => { try { const r = fn(req, res); if (r && r.then) r.catch(next); } catch (e) { next(e); } };
const str = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const need = (v, msg) => { if (isBlank(v)) throw new HttpError(400, msg); return v; };
const intId = v => { const n = parseInt(v, 10); if (!Number.isFinite(n)) throw new HttpError(400, "Identificador inválido."); return n; };
const pad = n => String(n).padStart(2, "0");
const hm = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dhm = ts => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${hm(ts)}`; };
const vitalsOf = r => { const v = {}; FIELDS.forEach(k => { v[k] = r[k] ?? ""; }); return v; };
const FREQS = [1, 2, 4, 6, 8, 12, 24];

/* ---------- pacientes + prioridade ---------- */
function patientState(p, now) {
  const last = db.get("SELECT * FROM registros WHERE paciente_id = ? ORDER BY aferido_em DESC, id DESC LIMIT 1", [p.id]);
  const unsent = !!db.get(`SELECT 1 FROM registros r WHERE r.paciente_id = ? AND r.precisa_comunicar = 1
    AND NOT EXISTS (SELECT 1 FROM comunicacoes c WHERE c.registro_id = r.id) LIMIT 1`, [p.id]);
  const pendingAck = !!db.get("SELECT 1 FROM comunicacoes WHERE paciente_id = ? AND ciente_em IS NULL LIMIT 1", [p.id]);
  const aguardando = db.get("SELECT COUNT(*) AS n FROM registros WHERE paciente_id = ? AND status = 'aguardando'", [p.id]).n;
  const pr = priority({ last: last ? { ...vitalsOf(last), aferido_em: last.aferido_em } : null, freqH: p.freq_horas, admittedAt: p.internado_em, now, pendingAck, unsent, override: p.prioridade_manual });
  return { ...p, glicemia: !!p.glicemia, ultimo: last ? decorateRecord(last) : null, unsent, pendingAck, aguardando, prioridade: pr };
}
function listPatients(now = Date.now()) {
  return db.all("SELECT * FROM pacientes WHERE alta_em IS NULL").map(p => patientState(p, now))
    .sort((a, b) => (b.prioridade.score - a.prioridade.score) || (a.prioridade.due - b.prioridade.due));
}
function getPatient(id) {
  const p = db.get("SELECT * FROM pacientes WHERE id = ?", [id]);
  if (!p) throw new HttpError(404, "Paciente não encontrado.");
  return p;
}
function decorateRecord(r) {
  const u = db.get("SELECT nome, categoria, coren FROM usuarios WHERE id = ?", [r.usuario_id]) || {};
  const val = r.validado_por ? db.get("SELECT nome FROM usuarios WHERE id = ?", [r.validado_por]) : null;
  const comm = db.get("SELECT id, ciente_em FROM comunicacoes WHERE registro_id = ? LIMIT 1", [r.id]);
  return { ...r, v: vitalsOf(r), autor: u, validado_por_nome: val ? val.nome : null, comunicado: !!comm, comunicacao: comm };
}
function summaryLines(p, now) {
  const s = patientState(p, now), L = [];
  if (s.ultimo) {
    const v = s.ultimo.v, n = news(v);
    L.push(`Última aferição ${dhm(s.ultimo.aferido_em)} (${s.ultimo.autor.nome}): PA ${v.pas || "—"}×${v.pad || "—"}, FC ${v.fc || "—"}, FR ${v.fr || "—"}, SpO₂ ${v.sat || "—"}% ${v.o2 === "sim" ? "em O₂" : "em ar ambiente"}, T ${v.temp || "—"} °C${v.glic ? ", glicemia " + v.glic : ""}, ${CONS[v.cons] || "consciência não registrada"}. NEWS2 ${n.score} (${n.level}).`);
    if (s.ultimo.obs) L.push("Observação: " + s.ultimo.obs);
  } else L.push("Nenhuma aferição registrada desde a internação.");
  L.push(s.prioridade.late > 0 ? `PENDENTE: aferição atrasada desde ${dhm(s.prioridade.due)}.` : `Próxima aferição: ${dhm(s.prioridade.due)} (a cada ${p.freq_horas} h).`);
  db.all(`SELECT r.aferido_em FROM registros r WHERE r.paciente_id = ? AND r.precisa_comunicar = 1 AND NOT EXISTS (SELECT 1 FROM comunicacoes c WHERE c.registro_id = r.id)`, [p.id])
    .forEach(r => L.push(`PENDENTE: alteração de ${dhm(r.aferido_em)} ainda não comunicada ao enfermeiro.`));
  db.all("SELECT criado_em FROM comunicacoes WHERE paciente_id = ? AND ciente_em IS NULL", [p.id])
    .forEach(c => L.push(`PENDENTE: comunicação de ${dhm(c.criado_em)} sem ciência do enfermeiro.`));
  if (s.aguardando) L.push(`${s.aguardando} anotação(ões) aguardando validação do enfermeiro.`);
  return { lines: L, tier: s.prioridade.tier };
}
function patientInput(b, partial) {
  const o = {};
  if (!partial || b.nome !== undefined) o.nome = need(str(b.nome, 120), "Informe o nome do paciente.");
  if (!partial || b.leito !== undefined) o.leito = need(str(b.leito, 20), "Informe o leito.");
  if (b.nascimento !== undefined) { o.nascimento = str(b.nascimento, 10); if (o.nascimento && !/^\d{4}-\d{2}-\d{2}$/.test(o.nascimento)) throw new HttpError(400, "Data de nascimento inválida."); }
  if (b.prontuario !== undefined) o.prontuario = str(b.prontuario, 40);
  if (b.diagnostico !== undefined) o.diagnostico = str(b.diagnostico, 300);
  if (b.freq_horas !== undefined) { o.freq_horas = +b.freq_horas; if (!FREQS.includes(o.freq_horas)) throw new HttpError(400, "Frequência de sinais vitais inválida."); }
  if (b.glicemia !== undefined) o.glicemia = b.glicemia ? 1 : 0;
  if (b.prioridade_manual !== undefined) { o.prioridade_manual = b.prioridade_manual === null || b.prioridade_manual === "" ? null : +b.prioridade_manual; if (o.prioridade_manual !== null && ![1, 2, 3, 4].includes(o.prioridade_manual)) throw new HttpError(400, "Prioridade inválida."); }
  return o;
}
function assertBedFree(leito, exceptId) {
  const other = db.get("SELECT id, nome FROM pacientes WHERE alta_em IS NULL AND leito = ? AND id != ?", [leito, exceptId || 0]);
  if (other) throw new HttpError(409, `O leito ${leito} já está ocupado por ${other.nome}.`);
}

/* ================= Configuração inicial ================= */
app.get("/api/setup", (req, res) => res.json({ precisaConfigurar: db.get("SELECT COUNT(*) AS n FROM usuarios").n === 0 }));
app.post("/api/setup", wrap((req, res) => {
  if (db.get("SELECT COUNT(*) AS n FROM usuarios").n > 0) throw new HttpError(409, "O sistema já foi configurado.");
  const b = req.body || {};
  const nome = need(str(b.nome, 120), "Informe seu nome."), login = need(str(b.login, 40).toLowerCase(), "Informe um login.");
  if (!/^[a-z0-9._-]{3,40}$/.test(login)) throw new HttpError(400, "Login: 3 a 40 letras, números, ponto, hífen ou sublinhado.");
  A.validatePassword(b.senha);
  const { id } = db.run("INSERT INTO usuarios (nome, login, senha_hash, categoria, coren, admin, criado_em) VALUES (?,?,?,?,?,1,?)",
    [nome, login, A.hashPassword(b.senha), "ENF", str(b.coren, 40), Date.now()]);
  const u = db.get("SELECT * FROM usuarios WHERE id = ?", [id]);
  req.user = u; A.audit(req, "configuracao_inicial", `Administrador ${login} criado`);
  A.startSession(req, res, u);
  res.status(201).json({ user: A.publicUser(u) });
}));

/* ================= Autenticação ================= */
app.post("/api/auth/login", wrap((req, res) => {
  const b = req.body || {};
  try {
    const u = A.checkLogin(b.login, b.senha);
    req.user = u; A.audit(req, "login");
    A.startSession(req, res, u);
    res.json({ user: A.publicUser(u) });
  } catch (e) { A.audit(req, "login_falhou", str(b.login, 40)); throw e; }
}));
app.post("/api/auth/logout", (req, res) => { if (req.user) A.audit(req, "logout"); A.endSession(req, res); res.status(204).end(); });
app.get("/api/auth/me", A.requireUser, (req, res) => res.json({ user: A.publicUser(req.user) }));
app.post("/api/auth/senha", A.requireUser, wrap((req, res) => {
  const b = req.body || {};
  if (!A.verifyPassword(b.atual, req.user.senha_hash)) throw new HttpError(400, "Senha atual incorreta.");
  A.validatePassword(b.nova);
  db.run("UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?", [A.hashPassword(b.nova), req.user.id]);
  A.audit(req, "troca_senha"); res.status(204).end();
}));

app.get("/api/rede", A.requireUser, (req, res) => {
  if (process.env.RENDER_EXTERNAL_URL) return res.json({ https: true, celular: process.env.RENDER_EXTERNAL_URL, certificado: null, hospedado: true });
  res.json({ https: !!TLS, celular: phoneUrl(), certificado: certPageUrl() });
});

/* ================= Usuários ================= */
app.get("/api/usuarios", A.requireUser, (req, res) => {
  const rows = db.all("SELECT * FROM usuarios ORDER BY ativo DESC, nome");
  res.json(req.user.admin ? rows.map(A.publicUser) : rows.filter(u => u.ativo).map(u => ({ id: u.id, nome: u.nome, categoria: u.categoria, coren: u.coren })));
});
app.post("/api/usuarios", A.requireAdmin, wrap((req, res) => {
  const b = req.body || {};
  const nome = need(str(b.nome, 120), "Informe o nome."), login = need(str(b.login, 40).toLowerCase(), "Informe o login.");
  if (!/^[a-z0-9._-]{3,40}$/.test(login)) throw new HttpError(400, "Login: 3 a 40 letras, números, ponto, hífen ou sublinhado.");
  if (!["TE", "ENF"].includes(b.categoria)) throw new HttpError(400, "Categoria inválida.");
  if (db.get("SELECT 1 FROM usuarios WHERE login = ?", [login])) throw new HttpError(409, "Este login já existe.");
  A.validatePassword(b.senha);
  const { id } = db.run("INSERT INTO usuarios (nome, login, senha_hash, categoria, coren, admin, trocar_senha, criado_em) VALUES (?,?,?,?,?,?,1,?)",
    [nome, login, A.hashPassword(b.senha), b.categoria, str(b.coren, 40), b.admin ? 1 : 0, Date.now()]);
  A.audit(req, "usuario_criado", `${login} (${b.categoria})`);
  res.status(201).json(A.publicUser(db.get("SELECT * FROM usuarios WHERE id = ?", [id])));
}));
app.put("/api/usuarios/:id", A.requireAdmin, wrap((req, res) => {
  const id = intId(req.params.id), b = req.body || {};
  const u = db.get("SELECT * FROM usuarios WHERE id = ?", [id]); if (!u) throw new HttpError(404, "Usuário não encontrado.");
  if (id === req.user.id && (b.ativo === false || b.admin === false)) throw new HttpError(400, "Você não pode desativar nem tirar o seu próprio acesso de administrador.");
  const set = [], val = [];
  if (b.nome !== undefined) { set.push("nome = ?"); val.push(need(str(b.nome, 120), "Informe o nome.")); }
  if (b.coren !== undefined) { set.push("coren = ?"); val.push(str(b.coren, 40)); }
  if (b.categoria !== undefined) { if (!["TE", "ENF"].includes(b.categoria)) throw new HttpError(400, "Categoria inválida."); set.push("categoria = ?"); val.push(b.categoria); }
  if (b.admin !== undefined) { set.push("admin = ?"); val.push(b.admin ? 1 : 0); }
  if (b.ativo !== undefined) { set.push("ativo = ?"); val.push(b.ativo ? 1 : 0); }
  if (b.senha) { A.validatePassword(b.senha); set.push("senha_hash = ?", "trocar_senha = 1"); val.push(A.hashPassword(b.senha)); }
  if (!set.length) throw new HttpError(400, "Nada para alterar.");
  db.tx(() => {
    db.run(`UPDATE usuarios SET ${set.join(", ")} WHERE id = ?`, [...val, id]);
    if (b.ativo === false || b.senha) db.run("DELETE FROM sessoes WHERE usuario_id = ?", [id]);
  });
  A.audit(req, "usuario_alterado", `${u.login}: ${Object.keys(b).filter(k => k !== "senha").concat(b.senha ? ["senha redefinida"] : []).join(", ")}`);
  res.json(A.publicUser(db.get("SELECT * FROM usuarios WHERE id = ?", [id])));
}));

/* ================= Pacientes ================= */
app.get("/api/pacientes", A.requireUser, (req, res) => {
  if (req.query.altas) return res.json(db.all("SELECT * FROM pacientes WHERE alta_em IS NOT NULL ORDER BY alta_em DESC LIMIT 100"));
  res.json({ agora: Date.now(), pacientes: listPatients() });
});
app.get("/api/pacientes/:id", A.requireUser, wrap((req, res) => {
  const p = getPatient(intId(req.params.id));
  const registros = db.all("SELECT * FROM registros WHERE paciente_id = ? ORDER BY aferido_em DESC, id DESC LIMIT 100", [p.id]).map(decorateRecord);
  const comunicacoes = db.all(`SELECT c.*, u.nome AS de_nome, e.nome AS ciente_nome FROM comunicacoes c JOIN usuarios u ON u.id = c.de_usuario
    LEFT JOIN usuarios e ON e.id = c.ciente_por WHERE c.paciente_id = ? ORDER BY c.criado_em DESC LIMIT 50`, [p.id]);
  res.json({ paciente: p.alta_em ? { ...p, glicemia: !!p.glicemia } : patientState(p, Date.now()), registros, comunicacoes });
}));
app.post("/api/pacientes", A.requireEnf, wrap((req, res) => {
  const o = patientInput(req.body || {}, false);
  assertBedFree(o.leito);
  const { id } = db.run(`INSERT INTO pacientes (nome, nascimento, prontuario, leito, diagnostico, freq_horas, glicemia, internado_em, criado_por) VALUES (?,?,?,?,?,?,?,?,?)`,
    [o.nome, o.nascimento || "", o.prontuario || "", o.leito, o.diagnostico || "", o.freq_horas || 6, o.glicemia || 0, Date.now(), req.user.id]);
  A.audit(req, "paciente_admitido", `${o.nome} · leito ${o.leito}`);
  res.status(201).json(patientState(getPatient(id), Date.now()));
}));
app.put("/api/pacientes/:id", A.requireEnf, wrap((req, res) => {
  const p = getPatient(intId(req.params.id));
  if (p.alta_em) throw new HttpError(400, "Paciente já recebeu alta.");
  const o = patientInput(req.body || {}, true);
  if (o.leito && o.leito !== p.leito) assertBedFree(o.leito, p.id);
  const keys = Object.keys(o); if (!keys.length) throw new HttpError(400, "Nada para alterar.");
  db.run(`UPDATE pacientes SET ${keys.map(k => k + " = ?").join(", ")} WHERE id = ?`, [...keys.map(k => o[k]), p.id]);
  A.audit(req, "paciente_alterado", `${p.nome}: ${keys.join(", ")}`);
  res.json(patientState(getPatient(p.id), Date.now()));
}));
app.post("/api/pacientes/:id/alta", A.requireEnf, wrap((req, res) => {
  const p = getPatient(intId(req.params.id));
  if (p.alta_em) throw new HttpError(400, "Paciente já recebeu alta.");
  db.run("UPDATE pacientes SET alta_em = ? WHERE id = ?", [Date.now(), p.id]);
  A.audit(req, "paciente_alta", `${p.nome} · leito ${p.leito}`);
  res.status(204).end();
}));

/* ================= Registros (anotações de sinais vitais) ================= */
app.post("/api/registros", A.requireUser, wrap((req, res) => {
  const b = req.body || {}, now = Date.now();
  const p = getPatient(intId(b.paciente_id));
  if (p.alta_em) throw new HttpError(400, "Paciente já recebeu alta.");
  const { v, errors } = cleanVitals(b.v || {});
  if (errors.length) throw new HttpError(400, "Confira os valores: " + errors.join("; ") + ".");
  if (!NUM_FIELDS.some(k => v[k] !== "")) throw new HttpError(400, "Registre pelo menos um sinal vital.");
  if (!p.glicemia && v.glic === "") delete v.glic;
  const aferido = b.aferido_em ? +b.aferido_em : now;
  if (!Number.isFinite(aferido) || aferido > now + 5 * 60e3 || aferido < now - 24 * 3600e3) throw new HttpError(400, "Horário da aferição inválido (precisa ser nas últimas 24 h).");
  const metodo = b.metodo === "voz" ? "voz" : "digitacao";
  const n = news(v), precisa = needsComm(v) ? 1 : 0, isEnf = req.user.categoria === "ENF";
  const out = db.tx(() => {
    const { id } = db.run(`INSERT INTO registros (paciente_id, usuario_id, aferido_em, registrado_em, pas, pad, fc, fr, sat, temp, glic, cons, o2, obs, metodo, transcricao, campos_corrigidos, duracao_seg, news2, precisa_comunicar, status, validado_por, validado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [p.id, req.user.id, aferido, now, v.pas, v.pad, v.fc, v.fr, v.sat, v.temp, v.glic ?? null, v.cons, v.o2, str(b.obs, 2000), metodo, str(b.transcricao, 4000),
        Math.max(0, Math.min(99, +b.campos_corrigidos || 0)), b.duracao_seg != null ? Math.max(0, Math.min(36000, Math.round(+b.duracao_seg) || 0)) : null,
        n.score, precisa, isEnf ? "validado" : "aguardando", isEnf ? req.user.id : null, isEnf ? now : null]);
    if (b.comunicar && precisa) {
      db.run("INSERT INTO comunicacoes (paciente_id, registro_id, de_usuario, texto, criado_em) VALUES (?,?,?,?,?)",
        [p.id, id, req.user.id, commText(p, v, hm(aferido)), now]);
    }
    return id;
  });
  A.audit(req, "registro_assinado", `${p.nome} · leito ${p.leito} · NEWS2 ${n.score} · ${metodo}`);
  res.status(201).json(decorateRecord(db.get("SELECT * FROM registros WHERE id = ?", [out])));
}));
app.get("/api/registros", A.requireUser, (req, res) => {
  const st = req.query.status === "aguardando" ? "aguardando" : null;
  const rows = db.all(`SELECT r.*, p.nome AS paciente_nome, p.leito FROM registros r JOIN pacientes p ON p.id = r.paciente_id
    ${st ? "WHERE r.status = 'aguardando'" : ""} ORDER BY r.aferido_em DESC LIMIT 200`);
  res.json(rows.map(r => ({ ...decorateRecord(r), paciente_nome: r.paciente_nome, leito: r.leito })));
});
app.post("/api/registros/:id/validar", A.requireEnf, wrap((req, res) => {
  const r = db.get("SELECT * FROM registros WHERE id = ?", [intId(req.params.id)]); if (!r) throw new HttpError(404, "Registro não encontrado.");
  if (r.status === "validado") throw new HttpError(409, "Registro já validado.");
  db.run("UPDATE registros SET status = 'validado', validado_por = ?, validado_em = ? WHERE id = ?", [req.user.id, Date.now(), r.id]);
  A.audit(req, "registro_validado", `registro ${r.id}`);
  res.json(decorateRecord(db.get("SELECT * FROM registros WHERE id = ?", [r.id])));
}));
app.post("/api/registros/:id/comunicar", A.requireUser, wrap((req, res) => {
  const r = db.get("SELECT * FROM registros WHERE id = ?", [intId(req.params.id)]); if (!r) throw new HttpError(404, "Registro não encontrado.");
  if (db.get("SELECT 1 FROM comunicacoes WHERE registro_id = ?", [r.id])) throw new HttpError(409, "Este registro já foi comunicado.");
  const p = getPatient(r.paciente_id);
  const { id } = db.run("INSERT INTO comunicacoes (paciente_id, registro_id, de_usuario, texto, criado_em) VALUES (?,?,?,?,?)",
    [p.id, r.id, req.user.id, commText(p, vitalsOf(r), hm(r.aferido_em)), Date.now()]);
  A.audit(req, "comunicacao_enviada", `${p.nome} · registro ${r.id}`);
  res.status(201).json({ id });
}));

/* ================= Comunicações ================= */
app.get("/api/comunicacoes", A.requireUser, (req, res) => {
  const pend = req.query.pendentes ? "WHERE c.ciente_em IS NULL" : "";
  res.json(db.all(`SELECT c.*, p.nome AS paciente_nome, p.leito, u.nome AS de_nome, e.nome AS ciente_nome FROM comunicacoes c
    JOIN pacientes p ON p.id = c.paciente_id JOIN usuarios u ON u.id = c.de_usuario LEFT JOIN usuarios e ON e.id = c.ciente_por
    ${pend} ORDER BY c.ciente_em IS NOT NULL, c.criado_em DESC LIMIT 200`));
});
app.post("/api/comunicacoes", A.requireUser, wrap((req, res) => {
  const b = req.body || {}; const p = getPatient(intId(b.paciente_id));
  const texto = need(str(b.texto, 1000), "Escreva a mensagem.");
  const { id } = db.run("INSERT INTO comunicacoes (paciente_id, de_usuario, texto, criado_em) VALUES (?,?,?,?)", [p.id, req.user.id, `Leito ${p.leito} (${p.nome}): ${texto}`, Date.now()]);
  A.audit(req, "comunicacao_enviada", `${p.nome} · mensagem livre`);
  res.status(201).json({ id });
}));
app.post("/api/comunicacoes/:id/ciente", A.requireEnf, wrap((req, res) => {
  const c = db.get("SELECT * FROM comunicacoes WHERE id = ?", [intId(req.params.id)]); if (!c) throw new HttpError(404, "Comunicação não encontrada.");
  if (c.ciente_em) throw new HttpError(409, "Já marcada como ciente.");
  db.run("UPDATE comunicacoes SET ciente_por = ?, ciente_em = ?, conduta = ? WHERE id = ?", [req.user.id, Date.now(), str((req.body || {}).conduta, 1000), c.id]);
  A.audit(req, "comunicacao_ciente", `comunicação ${c.id}`);
  res.status(204).end();
}));

/* ================= Passagem de plantão ================= */
app.get("/api/passagens/rascunho", A.requireUser, (req, res) => {
  const now = Date.now();
  res.json(listPatients(now).map(p => ({ paciente_id: p.id, leito: p.leito, nome: p.nome, diagnostico: p.diagnostico, ...summaryLines(p, now) })));
});
app.post("/api/passagens", A.requireUser, wrap((req, res) => {
  const b = req.body || {}, now = Date.now();
  if (!A.verifyPassword(b.senha, req.user.senha_hash)) throw new HttpError(400, "Senha incorreta. A passagem precisa ser assinada com a sua senha.");
  const para = db.get("SELECT * FROM usuarios WHERE id = ? AND ativo = 1", [intId(b.para_usuario)]);
  if (!para || para.id === req.user.id) throw new HttpError(400, "Escolha quem vai receber o plantão.");
  const recados = b.recados || {};
  const itens = listPatients(now).map(p => { const s = summaryLines(p, now); return { paciente_id: p.id, leito: p.leito, nome: p.nome, diagnostico: p.diagnostico, prioridade: s.tier.lab, tier: s.tier.k, lines: s.lines, recado: str(recados[p.id], 1000) }; });
  const falta = itens.filter(i => ["alta", "media"].includes(i.tier) && !i.recado);
  if (falta.length) throw new HttpError(400, "Escreva o recado dos pacientes de prioridade alta ou média: " + falta.map(i => "leito " + i.leito).join(", ") + ".");
  const { id } = db.run("INSERT INTO passagens (de_usuario, para_usuario, criado_em, itens) VALUES (?,?,?,?)", [req.user.id, para.id, now, JSON.stringify(itens)]);
  A.audit(req, "passagem_assinada", `para ${para.login}`);
  res.status(201).json({ id });
}));
const passagemOut = p => p && ({ ...p, itens: JSON.parse(p.itens) });
app.get("/api/passagens", A.requireUser, (req, res) => {
  res.json(db.all(`SELECT ps.*, a.nome AS de_nome, b.nome AS para_nome FROM passagens ps JOIN usuarios a ON a.id = ps.de_usuario JOIN usuarios b ON b.id = ps.para_usuario
    ORDER BY ps.criado_em DESC LIMIT 50`).map(passagemOut));
});
app.get("/api/passagens/pendente", A.requireUser, (req, res) => {
  res.json(passagemOut(db.get(`SELECT ps.*, a.nome AS de_nome FROM passagens ps JOIN usuarios a ON a.id = ps.de_usuario
    WHERE ps.para_usuario = ? AND ps.recebido_em IS NULL ORDER BY ps.criado_em DESC LIMIT 1`, [req.user.id])));
});
app.post("/api/passagens/:id/receber", A.requireUser, wrap((req, res) => {
  const ps = db.get("SELECT * FROM passagens WHERE id = ?", [intId(req.params.id)]);
  if (!ps || ps.para_usuario !== req.user.id) throw new HttpError(404, "Passagem não encontrada.");
  if (ps.recebido_em) throw new HttpError(409, "Passagem já recebida.");
  db.run("UPDATE passagens SET recebido_em = ? WHERE id = ?", [Date.now(), ps.id]);
  A.audit(req, "passagem_recebida", `passagem ${ps.id}`);
  res.status(204).end();
}));

/* ================= Relatórios ================= */
function periodo(q) {
  const day = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; };
  const ate = (day(q.ate) ?? day(new Date().toISOString().slice(0, 10))) + 86400e3;
  const de = day(q.de) ?? ate - 7 * 86400e3;
  return [de, ate];
}
function reportRows(de, ate) {
  return db.all(`SELECT r.*, p.nome AS paciente_nome, p.leito, u.nome AS autor_nome, u.categoria,
      (SELECT c.criado_em FROM comunicacoes c WHERE c.registro_id = r.id) AS comunicado_em,
      (SELECT c.ciente_em FROM comunicacoes c WHERE c.registro_id = r.id) AS ciente_em
    FROM registros r JOIN pacientes p ON p.id = r.paciente_id JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.aferido_em >= ? AND r.aferido_em < ? ORDER BY r.aferido_em`, [de, ate]);
}
app.get("/api/relatorios", A.requireUser, (req, res) => {
  const [de, ate] = periodo(req.query), rows = reportRows(de, ate);
  const by = m => {
    const rs = rows.filter(r => r.metodo === m), t = rs.filter(r => r.duracao_seg != null).map(r => r.duracao_seg), nc = rs.filter(r => r.precisa_comunicar);
    return { n: rs.length, mediana_seg: median(t), correcoes: rs.reduce((a, r) => a + r.campos_corrigidos, 0), precisaram: nc.length, comunicados: nc.filter(r => r.comunicado_em).length };
  };
  const ciencia = rows.filter(r => r.comunicado_em && r.ciente_em).map(r => (r.ciente_em - r.comunicado_em) / 60000);
  const graves = rows.filter(r => r.news2 >= 5);
  res.json({
    de, ate, total: rows.length, voz: by("voz"), digitacao: by("digitacao"),
    mediana_ciencia_min: median(ciencia), graves: graves.length, graves_comunicados: graves.filter(r => r.comunicado_em).length,
    aguardando_validacao: rows.filter(r => r.status === "aguardando").length,
    registros: rows.slice(-300).reverse().map(r => ({ id: r.id, aferido_em: r.aferido_em, leito: r.leito, paciente: r.paciente_nome, autor: r.autor_nome, metodo: r.metodo, duracao_seg: r.duracao_seg, campos_corrigidos: r.campos_corrigidos, news2: r.news2, precisa_comunicar: !!r.precisa_comunicar, comunicado: !!r.comunicado_em, status: r.status }))
  });
});
app.get("/api/relatorios/registros.csv", A.requireUser, (req, res) => {
  const [de, ate] = periodo(req.query), rows = reportRows(de, ate);
  const head = ["Aferido em", "Registrado em", "Leito", "Paciente", "Profissional", "Categoria", "Método", "Duração (s)", "Campos corrigidos", "PA sist.", "PA diast.", "FC", "FR", "SpO2", "Temp.", "Glicemia", "Consciência", "O2", "NEWS2", "Precisava comunicar", "Comunicado em", "Ciente em", "Status", "Observação"];
  const q = c => { const s = String(c ?? ""); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const f = ts => ts ? dhm(ts) : "";
  const lines = [head, ...rows.map(r => [f(r.aferido_em), f(r.registrado_em), r.leito, r.paciente_nome, r.autor_nome, r.categoria, r.metodo === "voz" ? "Voz" : "Digitação", r.duracao_seg ?? "", r.campos_corrigidos, r.pas, r.pad, r.fc, r.fr, r.sat, r.temp, r.glic, CONS[r.cons] || "", r.o2 === "sim" ? "O2 suplementar" : r.o2 === "nao" ? "Ar ambiente" : "", r.news2, r.precisa_comunicar ? "Sim" : "Não", f(r.comunicado_em), f(r.ciente_em), r.status, r.obs])];
  A.audit(req, "exportou_csv", `${rows.length} registros`);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="voyce-registros.csv"`);
  res.send("﻿" + lines.map(l => l.map(q).join(";")).join("\r\n"));
});

/* ================= Administração ================= */
app.get("/api/auditoria", A.requireAdmin, (req, res) => {
  res.json(db.all("SELECT a.*, u.nome AS usuario_nome FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id ORDER BY a.id DESC LIMIT 300"));
});
app.post("/api/admin/backup", A.requireAdmin, wrap((req, res) => { const f = db.backup(); A.audit(req, "backup", path.basename(f)); res.json({ arquivo: path.basename(f) }); }));

app.use("/api", (req, res) => res.status(404).json({ error: "Rota não encontrada." }));
app.use((err, req, res, next) => {
  const status = err.status || (err.type === "entity.parse.failed" ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Erro interno do servidor." : err.message });
});

/* ================= Front-end ================= */
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: "1h" }));
  app.get("*", (req, res) => res.sendFile(path.join(DIST, "index.html")));
} else {
  app.get("/", (req, res) => res.type("text").send("Front-end não compilado. Rode `npm run build` (ou use `npm run dev` e abra http://localhost:5173)."));
}

/* ================= Inicialização ================= */
try { db.backup(); } catch (e) { console.error("[backup]", e.message); }
setInterval(() => { try { db.backup(); } catch (e) { console.error("[backup]", e.message); } }, 6 * 3600e3);

const server = USE_HTTPS ? https.createServer({ key: TLS.key, cert: TLS.cert }, app) : http.createServer(app);
server.on("error", e => {
  if (e.code === "EADDRINUSE") {
    console.error(`\nA porta ${PORT} já está em uso (provavelmente outro servidor do Voyce Care aberto).`);
    console.error("Feche a outra janela/terminal do servidor, ou rode em outra porta:  set PORT=3002 && npm start\n");
    process.exit(1);
  }
  throw e;
});
server.listen(PORT, "0.0.0.0", () => {
  const proto = USE_HTTPS ? "https" : "http";
  console.log(`\nVoyce Care rodando em ${proto}://localhost:${PORT}`);
  console.log(`  Banco de dados: ${path.join(db.DATA_DIR, "voyce.db")} (backups em ${path.join(db.DATA_DIR, "backups")})`);
  if (USE_HTTPS && TLS.ips.length) {
    console.log(`  Neste computador: http://localhost:${HTTP_HELPER_PORT}`);
    console.log("\n  ===== No celular / tablet (mesmo Wi-Fi) =====");
    console.log(`  1. Instale o certificado (uma vez por aparelho):  ${certPageUrl()}`);
    console.log(`  2. Depois abra no Chrome/Safari:                  ${phoneUrl()}`);
    console.log("");
  } else if (USE_HTTPS) console.log("  Nenhuma rede Wi-Fi/cabo encontrada para os aparelhos.");
  else console.log("  Para tablets/celulares da rede usarem o microfone, rode: npm run start:https");
});
if (USE_HTTPS) {
  const helper = express();
  // neste computador (localhost) o app inteiro funciona em http: o navegador já trata localhost como seguro
  helper.use((req, res, next) => (["localhost", "127.0.0.1"].includes(req.hostname) ? app(req, res, next) : next()));
  helper.get("/certificado", certPage);
  helper.get("/voyce-ca.crt", caFile);
  helper.use((req, res) => res.redirect(phoneUrl() || `https://localhost:${PORT}`));
  http.createServer(helper).on("error", e => console.error(`  (página do certificado indisponível na porta ${HTTP_HELPER_PORT}: ${e.code})`)).listen(HTTP_HELPER_PORT, "0.0.0.0");
}
const bye = () => { try { db.persist(); } catch (e) { } process.exit(0); };
process.on("SIGINT", bye); process.on("SIGTERM", bye);
