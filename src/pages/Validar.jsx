import React from "react";
import { api } from "../api.js";
import { useApi, useAction, ErrorBox, Loading, NewsChip, go, dhm } from "../ui.jsx";
import { CONS, O2 } from "../../shared/clinical.js";

export default function Validar({ onChange }) {
  const { data, error, loading, reload } = useApi("/api/registros?status=aguardando", { every: 20000 });
  const a = useAction();
  const validar = ids => a.run(async () => { for (const id of ids) await api.post(`/api/registros/${id}/validar`); reload(); onChange(); });
  const list = data || [];
  return <div className="col narrow">
    <div className="row" style={{ justifyContent: "space-between" }}>
      <div><h2 style={{ fontSize: 24 }}>Validar anotações</h2><p className="hint">Anotações dos técnicos aguardando a validação do enfermeiro.</p></div>
      {list.length > 1 ? <button className="btn ghost" type="button" disabled={a.busy} onClick={() => { if (confirm(`Validar as ${list.length} anotações?`)) validar(list.map(r => r.id)); }}>Validar todas</button> : null}
    </div>
    <ErrorBox error={error || a.error} />
    {loading && !data ? <Loading /> : null}
    {data && !list.length ? <div className="card"><p className="hint" style={{ margin: 0 }}>Nenhuma anotação aguardando validação.</p></div> : null}
    {list.map(r => <div className="item card" key={r.id}>
      <div className="hd"><b>Leito {r.leito} · {r.paciente_nome} · {dhm(r.aferido_em)}</b><NewsChip score={r.news2} /></div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>PA {r.v.pas || "—"}×{r.v.pad || "—"} · FC {r.v.fc || "—"} · FR {r.v.fr || "—"} · SpO₂ {r.v.sat || "—"}% · T {r.v.temp || "—"}{r.v.glic ? " · Glic " + r.v.glic : ""}</span>
      <span className="hint">{CONS[r.v.cons] || "Consciência —"} · {O2[r.v.o2] || "O₂ —"}</span>
      {r.obs ? <span>{r.obs}</span> : null}
      <span className="hint">{r.autor.nome} · {r.autor.categoria} · {r.metodo === "voz" ? "voz" : "digitação"}{r.precisa_comunicar ? (r.comunicado ? " · comunicado" : " · alteração NÃO comunicada") : ""}</span>
      <div className="row"><button className="btn small" type="button" disabled={a.busy} onClick={() => validar([r.id])}>Validar</button><button className="btn small ghost" type="button" onClick={() => go(`#/paciente/${r.paciente_id}`)}>Abrir paciente</button></div>
    </div>)}
  </div>;
}
