import React, { useState } from "react";
import { api } from "../api.js";
import { useApi, useAction, ErrorBox, Loading, Modal, go, hm, dhm, ago, idade } from "../ui.jsx";

export const FREQS = [1, 2, 4, 6, 8, 12, 24];

export function PatientForm({ initial, onSaved, onCancel }) {
  const editing = !!(initial && initial.id);
  const [f, setF] = useState(() => ({
    nome: "", leito: "", nascimento: "", prontuario: "", diagnostico: "", freq_horas: 6, glicemia: false,
    ...(initial || {})
  }));
  const a = useAction();
  const set = k => e => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const submit = e => {
    e.preventDefault();
    const body = { nome: f.nome, leito: f.leito, nascimento: f.nascimento, prontuario: f.prontuario, diagnostico: f.diagnostico, freq_horas: +f.freq_horas, glicemia: !!f.glicemia };
    a.run(async () => { const r = editing ? await api.put(`/api/pacientes/${initial.id}`, body) : await api.post("/api/pacientes", body); onSaved(r); });
  };
  return <form className="col" onSubmit={submit}>
    <div className="grid2">
      <label className="lbl">Nome completo<input className="inp" value={f.nome} onChange={set("nome")} required /></label>
      <label className="lbl">Leito<input className="inp" value={f.leito} onChange={set("leito")} required placeholder="ex.: 401" /></label>
      <label className="lbl">Data de nascimento<input className="inp" type="date" value={f.nascimento} onChange={set("nascimento")} /></label>
      <label className="lbl">Prontuário<input className="inp" value={f.prontuario} onChange={set("prontuario")} /></label>
    </div>
    <label className="lbl">Diagnóstico / motivo da internação<input className="inp" value={f.diagnostico} onChange={set("diagnostico")} /></label>
    <div className="grid2">
      <label className="lbl">Sinais vitais a cada<select className="inp" value={f.freq_horas} onChange={set("freq_horas")}>{FREQS.map(x => <option key={x} value={x}>{x} h</option>)}</select></label>
      <label className="check" style={{ alignSelf: "end", paddingBottom: 8 }}><input type="checkbox" checked={!!f.glicemia} onChange={set("glicemia")} /> Glicemia capilar prescrita</label>
    </div>
    <ErrorBox error={a.error} />
    <div className="row"><button className="btn" type="submit" disabled={a.busy}>{editing ? "Salvar alterações" : "Admitir paciente"}</button>{onCancel ? <button className="btn ghost" type="button" onClick={onCancel}>Cancelar</button> : null}</div>
  </form>;
}

function Legend() {
  return <details className="card legend"><summary><b>Como a prioridade é calculada</b></summary>
    <p>O sistema soma o <b>NEWS2</b> da última anotação registrada (FR, SpO₂, O₂, PA sistólica, FC, consciência e temperatura), <b>aferições atrasadas</b> conforme a frequência prescrita e <b>pendências</b> de comunicação.</p>
    <p><span className="chip c-crit">Alta</span> <span className="chip c-warn">Média</span> <span className="chip c-mid">Baixa-média</span> <span className="chip c-ok">Baixa</span></p>
    <p>NEWS2: 0–4 baixo; 3 em um só parâmetro baixo-médio; 5–6 médio; 7 ou mais alto (Royal College of Physicians, 2017). O enfermeiro pode ajustar a prioridade.</p>
    <p className="hint">A prioridade usa o que foi registrado. Um paciente que piora sem ser aferido não sobe na lista: respeite os horários.</p></details>;
}

export default function Pacientes({ user }) {
  const { data, error, loading, reload } = useApi("/api/pacientes", { every: 20000 });
  const [adding, setAdding] = useState(false);
  const isEnf = user.categoria === "ENF";
  const now = data ? data.agora : Date.now();
  const list = data ? data.pacientes : [];
  return <div className="col">
    <div className="row" style={{ justifyContent: "space-between" }}>
      <div><h2 style={{ fontSize: 24 }}>Pacientes internados · por prioridade</h2><p className="hint">Atualiza sozinho a cada 20 s. Toque num leito para aferir e registrar.</p></div>
      <div className="row">{isEnf ? <button className="btn" type="button" onClick={() => setAdding(true)}>Admitir paciente</button> : null}<button className="btn ghost" type="button" onClick={reload}>Atualizar</button></div>
    </div>
    <ErrorBox error={error} />
    {loading && !data ? <Loading /> : null}
    {data && !list.length ? <div className="card empty"><h3>Nenhum paciente internado</h3><p className="hint">{isEnf ? "Use “Admitir paciente” para cadastrar o primeiro." : "Peça ao enfermeiro do setor para admitir os pacientes no sistema."}</p></div> : null}
    <div className="plist">{list.map(p => {
      const pr = p.prioridade, u = p.ultimo;
      return <button type="button" key={p.id} className={`bed t-${pr.tier.k}`} onClick={() => go(`#/paciente/${p.id}`)}>
        <span className="l1"><span className="n">Leito {p.leito}</span><span className={"chip " + pr.tier.cls}>{pr.tier.lab}</span></span>
        <span className="nm">{p.nome}{idade(p.nascimento) != null ? <span className="hint"> · {idade(p.nascimento)} anos</span> : null}</span>
        {p.diagnostico ? <span className="s">{p.diagnostico}</span> : null}
        <span className="s">{u ? `Última aferição ${dhm(u.aferido_em)} (${ago(u.aferido_em, now)})` : "Sem aferição"} · próxima {hm(pr.due)}</span>
        <span className="why">{pr.why.map((w, i) => <span key={i} className={"chip " + w.c}>{w.t}</span>)}{p.aguardando ? <span className="chip c-neu">{p.aguardando} a validar</span> : null}</span>
      </button>;
    })}</div>
    <Legend />
    {adding ? <Modal title="Admitir paciente" onClose={() => setAdding(false)}><PatientForm onSaved={p => { setAdding(false); reload(); go(`#/paciente/${p.id}`); }} onCancel={() => setAdding(false)} /></Modal> : null}
  </div>;
}
