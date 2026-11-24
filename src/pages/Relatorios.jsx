import React, { useState } from "react";
import { useApi, ErrorBox, Loading, NewsChip, dhm } from "../ui.jsx";
import { fmt1 } from "../../shared/clinical.js";

const iso = d => d.toISOString().slice(0, 10);

function Kpi({ s, lab }) {
  return <div className="card kpi"><h3>{lab} · {s.n} registro(s)</h3>{s.n ? <div className="kgrid">
    <div><small>Tempo mediano</small><b>{fmt1(s.mediana_seg)} s</b></div>
    <div><small>Campos corrigidos</small><b>{s.correcoes}</b></div>
    <div><small>Comunicou quando devia</small><b>{s.comunicados}/{s.precisaram}</b></div>
  </div> : <p className="hint">Nenhum registro com este método no período.</p>}</div>;
}

export default function Relatorios() {
  const t = new Date();
  const [de, setDe] = useState(iso(new Date(t.getTime() - 6 * 86400e3)));
  const [ate, setAte] = useState(iso(t));
  const q = `de=${de}&ate=${ate}`;
  const { data, error, loading } = useApi(`/api/relatorios?${q}`);
  return <div className="res">
    <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
      <div><h2>Relatórios</h2><p className="hint">Comparação voz × digitação, comunicação de alterações e pendências no período.</p></div>
      <div className="row">
        <label className="lbl">De<input className="inp" type="date" value={de} onChange={e => setDe(e.target.value)} /></label>
        <label className="lbl">Até<input className="inp" type="date" value={ate} onChange={e => setAte(e.target.value)} /></label>
        <a className="btn ghost" href={`/api/relatorios/registros.csv?${q}`} style={{ textDecoration: "none", alignSelf: "end" }}>Baixar planilha (CSV)</a>
      </div>
    </div>
    <ErrorBox error={error} />
    {loading && !data ? <Loading /> : null}
    {data ? <>
      <div className="kpis"><Kpi s={data.digitacao} lab="Digitação" /><Kpi s={data.voz} lab="Voz + revisão" /></div>
      <div className="hyp">
        <div className="card"><h3>Voz é mais rápida?</h3><p>{data.voz.n && data.digitacao.n && data.voz.mediana_seg != null && data.digitacao.mediana_seg != null
          ? <><b>{data.voz.mediana_seg < data.digitacao.mediana_seg ? "Sim" : "Não"}</b> neste período: voz {fmt1(data.voz.mediana_seg)} s × digitação {fmt1(data.digitacao.mediana_seg)} s (medianas).</>
          : "São necessários registros pelos dois métodos para comparar."}</p></div>
        <div className="card"><h3>Alterações graves (NEWS2 ≥ 5)</h3><p>{data.graves} registro(s); {data.graves_comunicados} comunicado(s) ao enfermeiro.{data.mediana_ciencia_min != null ? ` Tempo mediano até a ciência: ${fmt1(data.mediana_ciencia_min)} min.` : ""}</p></div>
        <div className="card"><h3>Validação</h3><p>{data.aguardando_validacao} anotação(ões) do período ainda aguardando validação.</p></div>
      </div>
      <div className="card"><h3 style={{ fontSize: 16, marginBottom: 8 }}>Registros ({data.total})</h3><div className="tblwrap"><table>
        <thead><tr><th>Aferição</th><th>Leito</th><th>Paciente</th><th>Profissional</th><th>Método</th><th className="n">Tempo (s)</th><th className="n">Correções</th><th>NEWS2</th><th>Comunicação</th><th>Status</th></tr></thead>
        <tbody>{data.registros.length ? data.registros.map(r => <tr key={r.id}>
          <td>{dhm(r.aferido_em)}</td><td>{r.leito}</td><td>{r.paciente}</td><td>{r.autor}</td><td>{r.metodo === "voz" ? "Voz" : "Digitação"}</td>
          <td className="n">{r.duracao_seg ?? "—"}</td><td className="n">{r.campos_corrigidos}</td><td><NewsChip score={r.news2} /></td>
          <td>{r.precisa_comunicar ? (r.comunicado ? "Comunicado" : <b>Não comunicado</b>) : "—"}</td><td>{r.status === "validado" ? "Validado" : "Aguardando"}</td>
        </tr>) : <tr><td colSpan={10} className="hint">Nenhum registro no período.</td></tr>}</tbody></table></div></div>
    </> : null}
  </div>;
}
