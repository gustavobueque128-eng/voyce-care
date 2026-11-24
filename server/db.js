/* Banco SQLite (sql.js / WebAssembly — sem compilação nativa), persistido em server/data/voyce.db. */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.VOYCE_DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "voyce.db");

let db = null;

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('TE','ENF')),
  coren TEXT NOT NULL DEFAULT '',
  admin INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  trocar_senha INTEGER NOT NULL DEFAULT 0,
  criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em INTEGER NOT NULL,
  expira_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pacientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  nascimento TEXT NOT NULL DEFAULT '',
  prontuario TEXT NOT NULL DEFAULT '',
  leito TEXT NOT NULL,
  diagnostico TEXT NOT NULL DEFAULT '',
  freq_horas INTEGER NOT NULL DEFAULT 6,
  glicemia INTEGER NOT NULL DEFAULT 0,
  prioridade_manual INTEGER,
  internado_em INTEGER NOT NULL,
  alta_em INTEGER,
  criado_por INTEGER REFERENCES usuarios(id)
);
CREATE TABLE IF NOT EXISTS registros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  aferido_em INTEGER NOT NULL,
  registrado_em INTEGER NOT NULL,
  pas TEXT, pad TEXT, fc TEXT, fr TEXT, sat TEXT, temp TEXT, glic TEXT, cons TEXT, o2 TEXT,
  obs TEXT NOT NULL DEFAULT '',
  metodo TEXT NOT NULL CHECK (metodo IN ('voz','digitacao')),
  transcricao TEXT NOT NULL DEFAULT '',
  campos_corrigidos INTEGER NOT NULL DEFAULT 0,
  duracao_seg INTEGER,
  news2 INTEGER NOT NULL,
  precisa_comunicar INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','validado')),
  validado_por INTEGER REFERENCES usuarios(id),
  validado_em INTEGER
);
CREATE INDEX IF NOT EXISTS ix_reg_pac ON registros(paciente_id, aferido_em);
CREATE TABLE IF NOT EXISTS comunicacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
  registro_id INTEGER REFERENCES registros(id),
  de_usuario INTEGER NOT NULL REFERENCES usuarios(id),
  texto TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  ciente_por INTEGER REFERENCES usuarios(id),
  ciente_em INTEGER,
  conduta TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS passagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  de_usuario INTEGER NOT NULL REFERENCES usuarios(id),
  para_usuario INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em INTEGER NOT NULL,
  itens TEXT NOT NULL,
  recebido_em INTEGER
);
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  em INTEGER NOT NULL,
  usuario_id INTEGER,
  acao TEXT NOT NULL,
  detalhe TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT ''
);
`;

export async function open() {
  const SQL = await initSqlJs();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = fs.existsSync(DB_FILE) ? new SQL.Database(fs.readFileSync(DB_FILE)) : new SQL.Database();
  db.exec(SCHEMA);
  // remove as tabelas da biometria (recurso retirado), se existirem em bancos antigos
  db.exec("DROP TABLE IF EXISTS credenciais; DROP TABLE IF EXISTS config;");
  persist();
}

/* Grava o arquivo de forma atômica (arquivo temporário + rename). */
export function persist() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, DB_FILE);
}

export function all(sql, params = []) {
  const st = db.prepare(sql);
  try { st.bind(params); const out = []; while (st.step()) out.push(st.getAsObject()); return out; }
  finally { st.free(); }
}
export const get = (sql, params = []) => all(sql, params)[0] || null;

let inTx = false;
export function run(sql, params = []) {
  db.run(sql, params);
  const id = db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
  const changes = db.getRowsModified();
  if (!inTx) persist();
  return { id, changes };
}
/* Executa várias escritas atomicamente e grava no disco uma vez só. */
export function tx(fn) {
  if (inTx) return fn();
  db.exec("BEGIN"); inTx = true;
  try { const r = fn(); db.exec("COMMIT"); inTx = false; persist(); return r; }
  catch (e) { inTx = false; try { db.exec("ROLLBACK"); } catch (x) { } throw e; }
}

export function backup() {
  const dir = path.join(DATA_DIR, "backups"); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `voyce-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
  fs.writeFileSync(f, Buffer.from(db.export()));
  const old = fs.readdirSync(dir).filter(x => x.endsWith(".db")).sort();
  old.slice(0, Math.max(0, old.length - 30)).forEach(x => fs.unlinkSync(path.join(dir, x)));
  return f;
}
