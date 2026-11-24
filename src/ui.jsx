import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { subscribeLevel } from "./mic.js";
import { DEF, CONS, O2, classify, news, NEWS_CLS } from "../shared/clinical.js";

export const pad = n => String(n).padStart(2, "0");
export const hm = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const dm = ts => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
export const dhm = ts => ts ? `${dm(ts)} ${hm(ts)}` : "—";
export const ago = (ts, now = Date.now()) => {
  const m = Math.round((now - ts) / 60000);
  if (m < 1) return "agora"; if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `há ${h} h${m % 60 ? " " + (m % 60) + " min" : ""}`;
  return `há ${Math.floor(h / 24)} dia(s)`;
};
export const idade = nasc => { if (!nasc) return null; const [y, m, d] = nasc.split("-").map(Number); const t = new Date(); let a = t.getFullYear() - y; if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) a--; return a; };
export const fmtNasc = nasc => nasc ? nasc.split("-").reverse().join("/") : "—";

export const go = h => { if (location.hash !== h) location.hash = h; };

/* Carrega dados da API com recarga manual e periódica opcional. */
export function useApi(url, { every = 0, deps = [] } = {}) {
  const [s, setS] = useState({ data: null, error: null, loading: true });
  const alive = useRef(true);
  const load = useCallback(() => {
    if (!url) return Promise.resolve();
    return api.get(url).then(data => { if (alive.current) setS({ data, error: null, loading: false }); })
      .catch(error => { if (alive.current) setS(x => ({ ...x, error, loading: false })); });
  }, [url]);
  useEffect(() => {
    alive.current = true; load();
    const iv = every ? setInterval(load, every) : null;
    return () => { alive.current = false; if (iv) clearInterval(iv); };
  }, [load, every, ...deps]);
  return { ...s, reload: load };
}

export function useAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const run = useCallback(async fn => {
    setBusy(true); setError("");
    try { return await fn(); } catch (e) { setError(e.message || String(e)); return undefined; } finally { setBusy(false); }
  }, []);
  return { busy, error, setError, run };
}

export const ErrorBox = ({ error }) => error ? <div className="alert crit" role="alert">{typeof error === "string" ? error : error.message}</div> : null;
export const Loading = () => <p className="hint">Carregando…</p>;
export const Badge = ({ n }) => (n ? <span className="cnt">{n}</span> : null);
export const Pend = ({ l }) => (/^PENDENTE/.test(l) ? <b>{l}</b> : l);

export function NewsChip({ v, score }) {
  const n = v ? news(v) : null;
  const sc = n ? n.score : score, lvl = n ? n.level : score >= 7 ? "Alto" : score >= 5 ? "Médio" : "Baixo";
  return <span className={"chip " + NEWS_CLS[lvl]}>NEWS2 {sc}</span>;
}

export function LevelMeter() {
  const ref = useRef(null);
  useEffect(() => subscribeLevel(l => { if (ref.current) ref.current.style.width = Math.round(l * 100) + "%"; }), []);
  return <div className="meter" role="meter" aria-label="Nível do microfone" aria-valuemin={0} aria-valuemax={100}><i ref={ref} /></div>;
}

export const MicIcon = () => <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;

export function Modal({ title, onClose, children }) {
  useEffect(() => { const k = e => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  return <div className="bio-ov" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="card modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="row" style={{ justifyContent: "space-between" }}><h3>{title}</h3><button type="button" className="btn small ghost" onClick={onClose}>Fechar</button></div>
      {children}
    </div>
  </div>;
}

/* Campo de sinal vital com classificação ao vivo. */
export function VitalField({ k, value, onChange, flagged }) {
  const d = DEF[k], raw = String(value ?? ""), c = classify(k, raw);
  const s = raw.trim() === "" ? "miss" : c.s;
  let ctl;
  if (k === "cons") ctl = <select id={`f-${k}`} value={raw} onChange={e => onChange(e.target.value)}><option value="">—</option>{Object.keys(CONS).map(x => <option key={x} value={x}>{CONS[x]}</option>)}</select>;
  else if (k === "o2") ctl = <select id={`f-${k}`} value={raw} onChange={e => onChange(e.target.value)}><option value="">—</option>{Object.keys(O2).map(x => <option key={x} value={x}>{O2[x]}</option>)}</select>;
  else ctl = <><input type="text" inputMode="decimal" id={`f-${k}`} value={raw} placeholder="—" autoComplete="off" onChange={e => onChange(e.target.value)} /> {d.u}</>;
  return <div className={"fld s-" + s}>
    <label htmlFor={`f-${k}`}>{d.lab}{flagged ? <span className="chip c-mid" style={{ marginLeft: 6 }}>ditado</span> : null}</label>
    <div className="val">{ctl}</div>
    {s !== "miss" && c.m ? <div className={"msg " + s}>{c.m}</div> : null}
  </div>;
}
