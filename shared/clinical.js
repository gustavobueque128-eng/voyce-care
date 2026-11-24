/* Regras clínicas compartilhadas pelo front-end (React) e pelo back-end (Express). */

export const pad = n => String(n).padStart(2, "0");
export const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
export const fmt1 = n => n == null ? "—" : (Math.round(n * 10) / 10).toString().replace(".", ",");
export const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const num = v => parseFloat(String(v).replace(",", "."));
export const isBlank = v => v === undefined || v === null || String(v).trim() === "";

/* ================= NEWS2 (Royal College of Physicians, 2017) ================= */
export function news(v) {
  const parts = {}, missing = []; const n = k => isBlank(v[k]) ? null : num(v[k]);
  const fr = n("fr"), sat = n("sat"), pas = n("pas"), fc = n("fc"), t = n("temp");
  if (fr == null) missing.push("FR"); else parts.fr = fr <= 8 ? 3 : fr <= 11 ? 1 : fr <= 20 ? 0 : fr <= 24 ? 2 : 3;
  if (sat == null) missing.push("SpO₂"); else parts.sat = sat <= 91 ? 3 : sat <= 93 ? 2 : sat <= 95 ? 1 : 0;
  if (!v.o2) missing.push("O₂"); else parts.o2 = v.o2 === "sim" ? 2 : 0;
  if (pas == null) missing.push("PA"); else parts.pas = pas <= 90 ? 3 : pas <= 100 ? 2 : pas <= 110 ? 1 : pas <= 219 ? 0 : 3;
  if (fc == null) missing.push("FC"); else parts.fc = fc <= 40 ? 3 : fc <= 50 ? 1 : fc <= 90 ? 0 : fc <= 110 ? 1 : fc <= 130 ? 2 : 3;
  if (!v.cons) missing.push("consciência"); else parts.cons = v.cons === "A" ? 0 : 3;
  if (t == null) missing.push("T"); else parts.temp = t <= 35 ? 3 : t <= 36 ? 1 : t <= 38 ? 0 : t <= 39 ? 1 : 2;
  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  const single3 = Object.values(parts).some(x => x === 3);
  const level = score >= 7 ? "Alto" : score >= 5 ? "Médio" : single3 ? "Baixo-médio" : "Baixo";
  return { score, single3, level, missing, parts };
}
export const NEWS_CLS = { Alto: "c-crit", Médio: "c-warn", "Baixo-médio": "c-mid", Baixo: "c-ok" };

/* ================= Campos e faixas ================= */
export const DEF = {
  pas: { lab: "PA sistólica", u: "mmHg", ok: [90, 139], imp: [50, 260] },
  pad: { lab: "PA diastólica", u: "mmHg", ok: [60, 89], imp: [30, 150] },
  fc: { lab: "Frequência cardíaca", u: "bpm", ok: [60, 100], imp: [25, 220] },
  fr: { lab: "Frequência respiratória", u: "irpm", ok: [12, 20], imp: [5, 60] },
  sat: { lab: "Saturação (SpO₂)", u: "%", ok: [95, 100], imp: [50, 100] },
  temp: { lab: "Temperatura", u: "°C", ok: [35.5, 37.7], imp: [30, 43] },
  glic: { lab: "Glicemia capilar", u: "mg/dL", ok: [70, 180], imp: [15, 700] },
  cons: { lab: "Nível de consciência" },
  o2: { lab: "Oxigênio" }
};
export const CONS = { A: "Alerta", C: "Confusão nova", V: "Responde à voz", P: "Responde à dor", U: "Não responde" };
export const O2 = { nao: "Ar ambiente", sim: "O₂ suplementar" };
export const FIELDS = ["pas", "pad", "fc", "fr", "sat", "temp", "glic", "cons", "o2"];
export const NUM_FIELDS = ["pas", "pad", "fc", "fr", "sat", "temp", "glic"];

export function classify(k, val) {
  if (isBlank(val)) return { s: "miss", m: "Não informado." };
  val = String(val).trim();
  if (k === "cons") return CONS[val] ? (val === "A" ? { s: "ok", m: "" } : { s: "warn", m: "Alteração de consciência: comunique o enfermeiro." }) : { s: "crit", m: "Valor inválido." };
  if (k === "o2") return O2[val] ? { s: "ok", m: "" } : { s: "crit", m: "Valor inválido." };
  const n = num(val), d = DEF[k];
  if (isNaN(n) || !/^\d+([.,]\d+)?$/.test(val)) return { s: "crit", m: "Valor não numérico. Confira." };
  if (n < d.imp[0] || n > d.imp[1]) return { s: "crit", m: "Valor improvável: pode ser erro de transcrição ou digitação." };
  if (n < d.ok[0] || n > d.ok[1]) return { s: "warn", m: "Fora da faixa: comunique o enfermeiro." };
  return { s: "ok", m: "" };
}
export function needsComm(v) {
  const n = news(v);
  return n.score >= 5 || n.single3 || FIELDS.some(k => !isBlank(v[k]) && classify(k, v[k]).s === "warn");
}
export function commText(paciente, v, when) {
  const n = news(v);
  const alt = FIELDS.filter(k => !isBlank(v[k]) && classify(k, v[k]).s === "warn")
    .map(k => k === "cons" ? CONS[v.cons] : k === "pas" || k === "pad" ? `PA ${v.pas}×${v.pad}` : `${DEF[k].lab} ${v[k]}${DEF[k].u ? " " + DEF[k].u : ""}`);
  return `Leito ${paciente.leito} (${paciente.nome}), ${when}: NEWS2 ${n.score} (${n.level}).${alt.length ? " " + [...new Set(alt)].join("; ") + "." : ""}`;
}

/* ================= Prioridade (tempo real) ================= */
export const TIERS = [
  { k: "alta", lab: "Alta", min: 12, cls: "c-crit" }, { k: "media", lab: "Média", min: 8, cls: "c-warn" },
  { k: "bm", lab: "Baixa-média", min: 5, cls: "c-mid" }, { k: "baixa", lab: "Baixa", min: 0, cls: "c-ok" }
];
/* last: último registro ({aferido_em, ...sinais}) ou null; tempos em ms. */
export function priority({ last, freqH, admittedAt, now, pendingAck, unsent, override }) {
  const why = []; let base = 0, n = null;
  if (last) {
    n = news(last);
    base = n.score >= 7 ? 4 : n.score >= 5 ? 3 : n.single3 ? 2 : n.score >= 1 ? 1 : 0;
    why.push({ t: `NEWS2 ${n.score} · ${n.level}`, c: NEWS_CLS[n.level] });
  } else why.push({ t: "Sem aferição registrada", c: "c-warn" });
  const due = (last ? last.aferido_em : admittedAt) + (last ? freqH * 3600e3 : 0);
  const late = Math.floor((now - due) / 60000);
  let bonus = 0;
  if (late > 0) { bonus = late > 60 ? 2 : 1; why.push({ t: late < 5 ? "Aferição atrasada" : `Aferição atrasada ${Math.floor(late / 5) * 5} min`, c: "c-warn" }); }
  const pend = pendingAck || unsent;
  if (pend) why.push({ t: unsent ? "Alteração sem comunicar" : "Aguardando ciência do enfermeiro", c: "c-crit" });
  if (override != null) { base = override; why.push({ t: "Prioridade definida pelo enfermeiro", c: "c-mid" }); }
  const score = base * 3 + bonus + (pend ? 1 : 0);
  const tier = TIERS.find(t => score >= t.min);
  return { score, tier, why, news: n, due, late };
}

/* ================= Interpretação da fala (texto → campos) ================= */
const NW = { zero: 0, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900 };
const NWC = Object.assign({ um: 1, uma: 1 }, NW);
export function toDigits(text) {
  const t = norm(text).replace(/(\d)\.(\d)/g, "$1,$2").replace(/por cento/g, "%");
  const tk = t.replace(/([,.;:!?%])(?!\d)/g, " $1 ").split(/\s+/).filter(Boolean); const out = []; let i = 0;
  const group = () => {
    let v = NWC[tk[i]]; i++;
    while (i < tk.length) {
      if (tk[i] === "e" && NWC[tk[i + 1]] !== undefined) { v += NWC[tk[i + 1]]; i += 2; }
      else if (NW[tk[i]] !== undefined && v % 100 === 0 && NW[tk[i]] < 100) { v += NW[tk[i]]; i++; }
      else break;
    }
    return v;
  };
  const dec = () => { if (/^\d+$/.test(tk[i] || "")) return tk[i++]; return String(group()); };
  const isNum = w => w !== undefined && (NWC[w] !== undefined || /^\d+$/.test(w));
  while (i < tk.length) {
    const w = tk[i];
    if (NW[w] !== undefined) { const v = group(); if (tk[i] === "virgula" && isNum(tk[i + 1])) { i++; out.push(v + "," + dec()); } else out.push(String(v)); }
    else if (/^\d+$/.test(w) && tk[i + 1] === "virgula" && isNum(tk[i + 2])) { i += 2; out.push(w + "," + dec()); }
    else { out.push(w); i++; }
  }
  return out.join(" ");
}
function lastMatch(re, t) { const g = new RegExp(re.source, "g"); let m, r = null; while ((m = g.exec(t))) r = m; return r; }
export function parse(text) {
  let t = toDigits(text);
  t = t.replace(/(\d{2,3})\s*\/\s*(\d{2,3})/g, "$1 por $2");
  t = t.replace(/(\d+(?:,\d+)?)\s*(?:[,.]\s*)*(?:correcao|corrigindo|na verdade)\s*(?:[,:]\s*)*(\d+(?:,\d+)?)/g, "$2");
  const g = re => { const m = lastMatch(re, t); return m ? m[1] : ""; };
  const pa = lastMatch(/\b(?:pressao arterial|pressao|pa)\s+(?:de\s+)?(?:e\s+)?(\d{2,3})\s*(?:por|x|\/)\s*(\d{2,3})\b/, t);
  const v = {
    pas: pa ? pa[1] : "", pad: pa ? pa[2] : "",
    fc: g(/\b(?:frequencia cardiaca|fc|pulso)\s+(?:de\s+)?(?:e\s+)?(\d{1,4})\b/),
    fr: g(/\b(?:frequencia respiratoria|fr)\s+(?:de\s+)?(?:e\s+)?(\d{1,3})\b/),
    sat: g(/\b(?:saturacao|spo2|sat)\s+(?:de\s+)?(?:e\s+)?(\d{1,3})\b/),
    temp: g(/\b(?:temperatura|temp|tax)\s+(?:de\s+)?(?:e\s+)?(\d{2}(?:,\d{1,2})?)\b/),
    glic: g(/\b(?:glicemia(?: capilar)?|hgt|dextro)\s+(?:de\s+)?(?:e\s+)?(\d{2,3})\b/),
    cons: "", o2: ""
  };
  if (/\b(nao responde|irresponsiv)/.test(t)) v.cons = "U";
  else if (/responde a dor/.test(t)) v.cons = "P";
  else if (/responde a voz/.test(t)) v.cons = "V";
  else if (/(confus|desorientad)/.test(t)) v.cons = "C";
  else if (/\b(alerta|orientad|lucid)/.test(t)) v.cons = "A";
  if (/ar ambiente/.test(t)) v.o2 = "nao"; else if (/(cateter|oxigenio|\bo2\b|mascara de|venturi)/.test(t)) v.o2 = "sim";
  const leito = g(/\bleito\s+(\d{1,4}[a-z]?)\b/);
  const ex = /(pressao|frequencia|saturacao|temperatura|glicemia|sinais vitais|\bleito\b|nivel de consciencia|ar ambiente|cateter)/;
  let obs = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s && !ex.test(norm(s))).join(" ");
  if (!obs) {
    const m = text.match(/(n[ãa]o refere|n[ãa]o apresenta|refere|nega|apresenta|aceitou|deambulou|fala desconexa)[^.]*/i);
    if (m) { obs = m[0].trim(); obs = obs.charAt(0).toUpperCase() + obs.slice(1); if (!/[.!?]$/.test(obs)) obs += "."; }
  }
  return { v, leito, obs };
}

/* Normaliza e valida sinais vindos do cliente. Retorna { v, errors }. */
export function cleanVitals(input) {
  const v = {}, errors = [];
  for (const k of FIELDS) {
    const raw = input ? input[k] : undefined;
    if (isBlank(raw)) { v[k] = ""; continue; }
    const s = String(raw).trim();
    if (k === "cons" || k === "o2") { if ((k === "cons" ? CONS : O2)[s]) v[k] = s; else errors.push(`${DEF[k].lab}: valor inválido`); continue; }
    if (!/^\d+([.,]\d+)?$/.test(s)) { errors.push(`${DEF[k].lab}: não numérico`); continue; }
    const n = num(s);
    if (n < DEF[k].imp[0] || n > DEF[k].imp[1]) { errors.push(`${DEF[k].lab}: fora do possível (${s})`); continue; }
    v[k] = k === "temp" ? String(n).replace(".", ",") : String(Math.round(n));
  }
  return { v, errors };
}
