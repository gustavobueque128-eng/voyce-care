import React, { useState } from "react";
import { api } from "../api.js";
import { useApi, useAction, ErrorBox, Loading, go, dhm, hm, ago } from "../ui.jsx";

function Ciente({ c, onDone }) {
  const [conduta, setConduta] = useState(""); const a = useAction();
  return <div className="col">
    <label className="hint" htmlFor={`cd-${c.id}`}>Conduta (opcional)</label>
    <input id={`cd-${c.id}`} className="inp" value={conduta} onChange={e => setConduta(e.target.value)} placeholder="Ex.: médico plantonista avaliou, hemoculturas colhidas." />
    <ErrorBox error={a.error} />
    <div className="row">
      <button className="btn small" type="button" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/api/comunicacoes/${c.id}/ciente`, { conduta }); onDone(); })}>Ciente</button>
      <button className="btn small ghost" type="button" onClick={() => go(`#/paciente/${c.paciente_id}`)}>Abrir paciente</button>
    </div>
  </div>;
}

export default function Mensagens({ user, onChange }) {
  const [todas, setTodas] = useState(false);
  const { data, error, loading, reload } = useApi(todas ? "/api/comunicacoes" : "/api/comunicacoes?pendentes=1", { every: 15000 });
  const isEnf = user.categoria === "ENF";
  const done = () => { reload(); onChange(); };
  return <div className="col narrow">
    <div className="row" style={{ justifyContent: "space-between" }}>
      <div><h2 style={{ fontSize: 24 }}>Comunicações</h2><p className="hint">{isEnf ? "Alterações enviadas pela equipe. Marque como ciente e registre a conduta." : "Comunicações enviadas ao enfermeiro e a situação de cada uma."}</p></div>
      <div className="srcsw" style={{ minWidth: 240 }}>
        <button type="button" aria-pressed={!todas} onClick={() => setTodas(false)}>Pendentes</button>
        <button type="button" aria-pressed={todas} onClick={() => setTodas(true)}>Todas</button>
      </div>
    </div>
    <ErrorBox error={error} />
    {loading && !data ? <Loading /> : null}
    {data && !data.length ? <div className="card"><p className="hint" style={{ margin: 0 }}>{todas ? "Nenhuma comunicação ainda." : "Nenhuma comunicação pendente."}</p></div> : null}
    {(data || []).map(c => <div className="item card" key={c.id}>
      <div className="hd"><b>Leito {c.leito} · {c.paciente_nome}</b><span className={"chip " + (c.ciente_em ? "c-ok" : "c-crit")}>{c.ciente_em ? "Ciente" : "Aguardando ciência"}</span></div>
      <span>{c.texto}</span>
      <span className="hint">De {c.de_nome} · {dhm(c.criado_em)} ({ago(c.criado_em)}){c.ciente_em ? ` · ciente ${c.ciente_nome} às ${hm(c.ciente_em)}` : ""}</span>
      {c.conduta ? <span><b>Conduta:</b> {c.conduta}</span> : null}
      {isEnf && !c.ciente_em ? <Ciente c={c} onDone={done} /> : null}
    </div>)}
  </div>;
}
