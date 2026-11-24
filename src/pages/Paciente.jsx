import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useApi, useAction, ErrorBox, Loading, Modal, VitalField, LevelMeter, MicIcon, NewsChip, go, hm, dhm, ago, idade, fmtNasc, pad } from "../ui.jsx";
import { useDictation, speak } from "../mic.js";
import { FIELDS, DEF, CONS, O2, news, NEWS_CLS, classify, needsComm, parse, isBlank } from "../../shared/clinical.js";
import { PatientForm, FREQS } from "./Pacientes.jsx";

const EMPTY = { pas: "", pad: "", fc: "", fr: "", sat: "", temp: "", glic: "", cons: "", o2: "" };
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function hmToTs(s) {
  const [h, m] = s.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0);
  let t = d.getTime(); if (t > Date.now() + 5 * 60e3) t -= 86400e3; return t;
}
const vitalsLine = v => `PA ${v.pas || "—"}×${v.pad || "—"} · FC ${v.fc || "—"} · FR ${v.fr || "—"} · SpO₂ ${v.sat || "—"}% · T ${v.temp || "—"}${v.glic ? " · Glic " + v.glic : ""}`;

/* ================= Registro ================= */
function Registro({ p, user, onSigned }) {
  const [metodo, setMetodo] = useState(() => { try { return localStorage.getItem("voyce.metodo") || "voz"; } catch (e) { return "voz"; } });
  const [stage, setStage] = useState("idle"); // idle | ditar | campos
  const [v, setV] = useState(EMPTY);
  const [obs, setObs] = useState("");
  const [parsed, setParsed] = useState(null);
  const [ackLeito, setAckLeito] = useState(false);
  const [comunicar, setComunicar] = useState(true);
  const [aferido, setAferido] = useState(nowHM());
  const [t0, setT0] = useState(null);
  const [tick, setTick] = useState(0);
  const [done, setDone] = useState(null);
  const [rb, setRb] = useState("");
  const shrunk = useRef(new Set());
  const dict = useDictation();
  const a = useAction();
  useEffect(() => { if (!t0) return; const iv = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(iv); }, [t0]);
  useEffect(() => { try { localStorage.setItem("voyce.metodo", metodo); } catch (e) { } }, [metodo]);

  const fields = FIELDS.filter(k => k !== "glic" || p.glicemia || !isBlank(v.glic));
  const start = m => {
    setMetodo(m); setV(EMPTY); setObs(""); setParsed(null); setAckLeito(false); setComunicar(true); setDone(null); setRb("");
    shrunk.current = new Set(); setAferido(nowHM()); setT0(Date.now()); a.setError(""); dict.reset();
    setStage(m === "voz" ? "ditar" : "campos");
  };
  const cancel = () => { dict.reset(); setStage("idle"); setT0(null); };
  const organizar = () => {
    dict.stop();
    const r = parse(dict.transcript);
    const nv = { ...EMPTY }; FIELDS.forEach(k => { nv[k] = r.v[k] || ""; });
    setV(nv); setObs(r.obs || ""); setParsed({ ...r, raw: { ...nv, obs: r.obs || "" } }); setAckLeito(false); setStage("campos");
  };
  const setField = k => val => {
    if (String(val).length < String(v[k] || "").length) shrunk.current.add(k);
    setV(x => ({ ...x, [k]: val }));
  };
  const n = news(v), precisa = needsComm(v);
  const crit = fields.filter(k => !isBlank(v[k]) && classify(k, v[k]).s === "crit");
  const mism = parsed && parsed.leito && parsed.leito.toLowerCase() !== String(p.leito).toLowerCase();
  const anyVital = ["pas", "pad", "fc", "fr", "sat", "temp", "glic"].some(k => !isBlank(v[k]));
  const blocked = !anyVital || crit.length > 0 || (mism && !ackLeito);
  const secs = t0 ? Math.round((Date.now() - t0) / 1000) : 0;

  const corrections = () => metodo === "voz" && parsed
    ? FIELDS.filter(k => String(v[k] || "").trim() !== String(parsed.raw[k] || "").trim()).length + (obs.trim() !== (parsed.raw.obs || "").trim() ? 1 : 0)
    : shrunk.current.size;

  const sign = () => a.run(async () => {
    const r = await api.post("/api/registros", {
      paciente_id: p.id, v, obs, metodo, transcricao: metodo === "voz" ? dict.transcript : "",
      campos_corrigidos: corrections(), duracao_seg: secs, aferido_em: hmToTs(aferido), comunicar: precisa && comunicar
    });
    setDone({ ...r, secs }); setStage("idle"); setT0(null); dict.reset(); onSigned();
  });
  const readback = () => {
    const parts = [`Leito ${p.leito}.`, v.pas || v.pad ? `Pressão ${v.pas || "não informada"} por ${v.pad || "não informada"}.` : "Pressão não informada."];
    ["fc", "fr", "sat", "temp"].forEach(k => parts.push(v[k] ? `${DEF[k].lab} ${v[k]}${k === "sat" ? " por cento" : ""}.` : `${DEF[k].lab} não informada.`));
    if (v.glic) parts.push(`Glicemia ${v.glic}.`);
    parts.push(v.cons ? CONS[v.cons] + "." : "Consciência não informada.", v.o2 ? O2[v.o2] + "." : "Oxigênio não informado.");
    if (obs) parts.push(obs); parts.push("Confere?");
    const t = parts.join(" "); setRb(speak(t) ? "Lendo em voz alta…" : t);
  };

  if (stage === "idle") {
    return <div className="card col">
      <h3>Registrar sinais vitais</h3>
      {done ? <div className={"alert " + (done.precisa_comunicar && !done.comunicado ? "warn" : "ok")}>
        <b>Anotação assinada em {done.secs} s</b> · <NewsChip score={done.news2} /> · {done.status === "validado" ? "validada" : "aguardando validação do enfermeiro"}
        {done.comunicado ? <><br />Enfermeiro comunicado.</> : done.precisa_comunicar ? <><br />Há alterações não comunicadas: use “Comunicar” no histórico.</> : null}
      </div> : null}
      <p className="hint">Confira nome completo e data de nascimento na pulseira antes de registrar: <b>{p.nome}</b>, nasc. {fmtNasc(p.nascimento)}.</p>
      <div className="row">
        <button className="btn big" type="button" onClick={() => start("voz")}>🎙 Ditar por voz</button>
        <button className="btn big ghost" type="button" onClick={() => start("digitacao")}>⌨ Digitar</button>
      </div>
    </div>;
  }

  const timer = <span className="timer">⏱ {secs} s</span>;
  if (stage === "ditar") {
    const on = dict.listening || dict.starting;
    return <div className="card col">
      <div className="row" style={{ justifyContent: "space-between" }}><h3>Ditado · Leito {p.leito}</h3>{timer}</div>
      <p className="hint">Toque no microfone e dite sinais vitais, consciência, oxigênio e observação. Toque de novo para parar.</p>
      <button className={"mic real " + (on ? "on" : "")} type="button" aria-label={on ? "Parar de ouvir" : "Começar a ditar"} onClick={() => (on ? dict.stop() : dict.start(!!dict.transcript))}><MicIcon /></button>
      <p className="hint" style={{ textAlign: "center" }}>{dict.starting ? "Abrindo o microfone…" : dict.listening ? "Ouvindo… toque para parar." : dict.transcript ? "Toque para continuar ditando." : "Toque para começar."}</p>
      {on ? <LevelMeter /> : null}
      <p className="hint">Exemplo: “Leito {p.leito}, pressão 120 por 80, frequência cardíaca 76, frequência respiratória 18, saturação 96 por cento, temperatura 36 vírgula 5{p.glicemia ? ", glicemia capilar 110" : ""}, alerta, em ar ambiente. Não refere dor.” Para corrigir um número, diga “correção” e o valor certo.</p>
      {on || !dict.transcript
        ? <div className="transcript" aria-live="polite">{dict.transcript} <span className="interim">{dict.interim}</span>{!dict.transcript && !dict.interim ? <span className="hint">A transcrição aparece aqui.</span> : null}</div>
        : <><label htmlFor="trx" className="hint"><b>Transcrição</b> (pode corrigir antes de organizar)</label>
          <textarea id="trx" className="obsin" style={{ minHeight: 110 }} value={dict.transcript} onChange={e => dict.setTranscript(e.target.value)} /></>}
      {dict.error ? <div className="alert warn">{dict.error}</div> : null}
      <div className="row">
        <button className="btn" type="button" disabled={!dict.transcript || on} onClick={organizar}>Organizar campos</button>
        <button className="btn ghost" type="button" onClick={() => { dict.reset(); setStage("campos"); setMetodo("digitacao"); }}>Digitar em vez disso</button>
        <button className="btn ghost" type="button" onClick={cancel}>Cancelar</button>
      </div>
    </div>;
  }

  return <div className="card col">
    <div className="row" style={{ justifyContent: "space-between" }}><h3>{metodo === "voz" ? "Revisar" : "Anotação"} · Leito {p.leito}</h3>{timer}</div>
    <p className="hint">{metodo === "voz" ? "Compare cada campo com o monitor: a transcrição pode ter errado. Corrija o que for preciso." : "Digite os valores aferidos."}</p>
    <label className="lbl" style={{ maxWidth: 200 }}>Horário da aferição<input className="inp" type="time" value={aferido} onChange={e => setAferido(e.target.value)} required /></label>
    {mism ? <div className="alert crit"><b>Leito falado ({parsed.leito}) ≠ paciente aberto ({p.leito}).</b>
      <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={ackLeito} onChange={e => setAckLeito(e.target.checked)} /> Conferi a pulseira: o paciente aberto está correto.</label></div> : null}
    <div className="fields">{fields.map(k => <VitalField key={k} k={k} value={v[k]} onChange={setField(k)} flagged={metodo === "voz" && parsed && !isBlank(parsed.raw[k])} />)}</div>
    <label htmlFor="obs" className="hint"><b>Observação</b></label>
    <textarea id="obs" className="obsin" placeholder="Ex.: Não refere dor." value={obs} onChange={e => setObs(e.target.value)} />
    <div className={"newsbox " + NEWS_CLS[n.level]}><span>NEWS2{n.missing.length ? " parcial" : ""}</span><b>{n.score}</b><span className={"chip " + NEWS_CLS[n.level]}>{n.level}</span>
      {n.missing.length ? <span className="hint" style={{ flexBasis: "100%" }}>Falta: {n.missing.join(", ")}</span> : null}</div>
    {precisa ? <div className="alert warn">{n.score >= 7 ? "NEWS2 alto: comunique o enfermeiro imediatamente." : n.score >= 5 ? "NEWS2 médio: comunique o enfermeiro agora." : n.single3 ? "Um parâmetro com pontuação 3: comunique o enfermeiro." : "Há valores fora da faixa: comunique o enfermeiro."}
      <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={comunicar} onChange={e => setComunicar(e.target.checked)} /> Enviar comunicação ao enfermeiro ao assinar</label></div> : null}
    {metodo === "voz" ? <div className="row"><button className="btn ghost small" type="button" onClick={readback}>Ouvir leitura</button><button className="btn ghost small" type="button" onClick={() => setStage("ditar")}>Voltar ao ditado</button></div> : null}
    {rb ? <p className="hint">{rb}</p> : null}
    <ErrorBox error={a.error} />
    <div className="row">
      <button className="btn" type="button" disabled={blocked || a.busy} onClick={sign}>Assinar anotação</button>
      <button className="btn ghost" type="button" onClick={cancel}>Cancelar</button>
    </div>
    {blocked ? <p className="hint">{!anyVital ? "Registre pelo menos um sinal vital." : crit.length ? `Corrija: ${crit.map(k => DEF[k].lab).join(", ")}.` : "Confirme o leito."}</p> : null}
    <p className="hint">Assinado como {user.nome} · {user.categoria}{user.coren ? " · " + user.coren : ""}.</p>
  </div>;
}

/* ================= Página do paciente ================= */
function Mensagem({ p, onSent }) {
  const [t, setT] = useState(""); const a = useAction();
  return <form className="col" onSubmit={e => { e.preventDefault(); a.run(async () => { await api.post("/api/comunicacoes", { paciente_id: p.id, texto: t }); setT(""); onSent(); }); }}>
    <label className="hint" htmlFor="msg"><b>Mensagem ao enfermeiro sobre este paciente</b></label>
    <textarea id="msg" className="obsin" value={t} onChange={e => setT(e.target.value)} placeholder="Ex.: Paciente refere dor torácica desde as 10h." />
    <ErrorBox error={a.error} />
    <div><button className="btn small" type="submit" disabled={!t.trim() || a.busy}>Enviar</button></div>
  </form>;
}

function EnfControls({ p, onChange }) {
  const a = useAction(); const [edit, setEdit] = useState(false);
  const put = body => a.run(async () => { await api.put(`/api/pacientes/${p.id}`, body); onChange(); });
  const alta = () => { if (confirm(`Dar alta a ${p.nome} (leito ${p.leito})? O paciente sai da lista do setor.`)) a.run(async () => { await api.post(`/api/pacientes/${p.id}/alta`); go("#/pacientes"); }); };
  return <div className="enfbox"><b>Enfermeiro:</b>
    <label htmlFor="ovr" className="hint">Prioridade</label>
    <select className="sel" id="ovr" value={p.prioridade_manual ?? ""} onChange={e => put({ prioridade_manual: e.target.value === "" ? null : +e.target.value })}>
      <option value="">Automática</option>{[4, 3, 2, 1].map(x => <option key={x} value={x}>{["", "Baixa", "Baixa-média", "Média", "Alta"][x]}</option>)}</select>
    <label htmlFor="frq" className="hint">SSVV a cada</label>
    <select className="sel" id="frq" value={p.freq_horas} onChange={e => put({ freq_horas: +e.target.value })}>{FREQS.map(x => <option key={x} value={x}>{x} h</option>)}</select>
    <button className="btn small ghost" type="button" onClick={() => setEdit(true)}>Editar dados</button>
    <button className="btn small warn" type="button" onClick={alta}>Dar alta</button>
    <ErrorBox error={a.error} />
    {edit ? <Modal title="Editar paciente" onClose={() => setEdit(false)}><PatientForm initial={p} onSaved={() => { setEdit(false); onChange(); }} onCancel={() => setEdit(false)} /></Modal> : null}
  </div>;
}

export default function Paciente({ id, user, onChange }) {
  const { data, error, loading, reload } = useApi(`/api/pacientes/${id}`, { every: 30000 });
  const a = useAction();
  const isEnf = user.categoria === "ENF";
  const refresh = () => { reload(); onChange && onChange(); };
  if (loading && !data) return <Loading />;
  if (error && !data) return <div className="col"><ErrorBox error={error} /><a href="#/pacientes">‹ Voltar para a lista</a></div>;
  const { paciente: p, registros, comunicacoes } = data;
  const last = registros[0];
  const pr = p.prioridade;
  return <div className="col">
    <a href="#/pacientes" className="hint">‹ Lista de pacientes</a>
    <div className="pt-head">
      <h2>Leito {p.leito} · {p.nome}</h2>
      <span className="hint">{idade(p.nascimento) != null ? `${idade(p.nascimento)} anos · ` : ""}nasc. {fmtNasc(p.nascimento)}{p.prontuario ? ` · pront. ${p.prontuario}` : ""} · {p.diagnostico || "sem diagnóstico informado"}</span>
    </div>
    {p.alta_em ? <div className="alert info">Paciente com alta em {dhm(p.alta_em)}. Somente consulta.</div> : <div className="row">
      {pr ? <><span className={"chip " + pr.tier.cls}>Prioridade {pr.tier.lab}</span>{pr.why.map((w, i) => <span key={i} className={"chip " + w.c}>{w.t}</span>)}</> : null}
      <span className="hint">SSVV a cada {p.freq_horas} h{pr ? ` · próxima ${dhm(pr.due)}` : ""}{p.glicemia ? " · glicemia prescrita" : ""}</span>
    </div>}
    {isEnf && !p.alta_em ? <EnfControls p={p} onChange={refresh} /> : null}
    <div className="ptgrid">
      <div className="col">
        {!p.alta_em ? <Registro p={p} user={user} onSigned={refresh} /> : null}
        {last ? <div className="card col"><h3>Última aferição · {dhm(last.aferido_em)} <span className="hint">({ago(last.aferido_em)})</span></h3>
          <div className="devices">
            {["pas", "fc", "fr", "sat", "temp", ...(p.glicemia ? ["glic"] : [])].map(k => <div className="dev" key={k}><small>{k === "pas" ? "Pressão arterial" : DEF[k].lab}</small>
              <b>{k === "pas" ? `${last.v.pas || "—"}/${last.v.pad || "—"}` : last.v[k] || "—"}</b> <span className="hint">{k === "pas" ? "mmHg" : DEF[k].u}</span></div>)}
            <div className="dev"><small>Consciência · O₂</small><span>{CONS[last.v.cons] || "—"} · {O2[last.v.o2] || "—"}</span></div>
          </div>
        </div> : null}
      </div>
      <div className="col">
        <div className="card col"><h3>Histórico de anotações</h3>
          <ErrorBox error={a.error} />
          {!registros.length ? <p className="hint">Nenhuma anotação ainda.</p> : null}
          {registros.map(r => <div className="item" key={r.id}>
            <div className="hd"><b>{dhm(r.aferido_em)}</b><span className="row" style={{ gap: 4 }}><NewsChip score={r.news2} /><span className={"chip " + (r.status === "validado" ? "c-ok" : "c-neu")}>{r.status === "validado" ? "Validado" : "Aguardando validação"}</span></span></div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{vitalsLine(r.v)}</span>
            <span className="hint">{CONS[r.v.cons] || "Consciência —"} · {O2[r.v.o2] || "O₂ —"}</span>
            {r.obs ? <span>{r.obs}</span> : null}
            <span className="hint">{r.autor.nome} · {r.autor.categoria}{r.autor.coren ? " · " + r.autor.coren : ""} · assinado {dhm(r.registrado_em)} · {r.metodo === "voz" ? "voz" : "digitação"}{r.duracao_seg != null ? ` (${r.duracao_seg} s)` : ""}{r.validado_por_nome ? " · validado por " + r.validado_por_nome : ""}</span>
            <div className="row">
              {r.precisa_comunicar && !r.comunicado ? <button className="btn small warn" type="button" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/api/registros/${r.id}/comunicar`); refresh(); })}>Comunicar o enfermeiro</button> : null}
              {r.comunicado ? <span className={"chip " + (r.comunicacao && r.comunicacao.ciente_em ? "c-ok" : "c-crit")}>{r.comunicacao && r.comunicacao.ciente_em ? "Enfermeiro ciente" : "Comunicado · aguardando ciência"}</span> : null}
              {isEnf && r.status === "aguardando" ? <button className="btn small" type="button" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/api/registros/${r.id}/validar`); refresh(); })}>Validar</button> : null}
            </div>
          </div>)}
        </div>
        <div className="card col"><h3>Comunicações</h3>
          {!p.alta_em ? <Mensagem p={p} onSent={refresh} /> : null}
          {comunicacoes.map(c => <div className="item" key={c.id}>
            <div className="hd"><b>{dhm(c.criado_em)}</b><span className={"chip " + (c.ciente_em ? "c-ok" : "c-crit")}>{c.ciente_em ? "Ciente" : "Aguardando ciência"}</span></div>
            <span>{c.texto}</span>
            <span className="hint">De {c.de_nome}{c.ciente_em ? ` · ciente ${c.ciente_nome} às ${hm(c.ciente_em)}` : ""}</span>
            {c.conduta ? <span><b>Conduta:</b> {c.conduta}</span> : null}
          </div>)}
        </div>
      </div>
    </div>
  </div>;
}
