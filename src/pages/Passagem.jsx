import React, { useState } from "react";
import { api } from "../api.js";
import { useApi, useAction, ErrorBox, Loading, Pend, dhm } from "../ui.jsx";

export function Receber({ passagem, onDone, onLater }) {
  const [acks, setAcks] = useState({});
  const a = useAction();
  const all = passagem.itens.every(it => acks[it.paciente_id]);
  return <div className="ho">
    <div className="row" style={{ justifyContent: "space-between" }}>
      <div><h2 style={{ fontSize: 26 }}>Receber plantão</h2><p className="hint">Passado por {passagem.de_nome} em {dhm(passagem.criado_em)}. Leia cada paciente e marque como recebido.</p></div>
      <div className="row">
        <button className="btn ghost" type="button" onClick={onLater}>Ver depois</button>
        <button className="btn ghost" type="button" onClick={() => setAcks(all ? {} : Object.fromEntries(passagem.itens.map(it => [it.paciente_id, true])))}>{all ? "Desmarcar todos" : "Marcar todos"}</button>
        <button className="btn big" type="button" disabled={!all || a.busy} onClick={() => a.run(async () => { await api.post(`/api/passagens/${passagem.id}/receber`); onDone(); })}>Assumir plantão</button>
      </div>
    </div>
    <ErrorBox error={a.error} />
    {!passagem.itens.length ? <div className="card"><p className="hint" style={{ margin: 0 }}>Nenhum paciente internado no momento da passagem.</p></div> : null}
    {passagem.itens.map(it => <div className="card ho-item" key={it.paciente_id}>
      <div className="who"><b>Leito {it.leito}</b> <span className={"chip " + ({ alta: "c-crit", media: "c-warn", bm: "c-mid" }[it.tier] || "c-ok")}>{it.prioridade}</span><br />{it.nome}<br /><span className="hint">{it.diagnostico}</span></div>
      <div>
        <ul>{it.lines.map((l, i) => <li key={i}><Pend l={l} /></li>)}</ul>
        {it.recado ? <div className="alert info" style={{ marginTop: 8 }}><b>Recado:</b> {it.recado}</div> : null}
        <label className="recv"><input type="checkbox" checked={!!acks[it.paciente_id]} onChange={e => setAcks({ ...acks, [it.paciente_id]: e.target.checked })} /> Recebido e entendido</label>
      </div>
    </div>)}
  </div>;
}

function Historico() {
  const { data } = useApi("/api/passagens");
  if (!data || !data.length) return null;
  return <div className="card"><h3 style={{ fontSize: 16, marginBottom: 8 }}>Passagens anteriores</h3><div className="tblwrap"><table>
    <thead><tr><th>Quando</th><th>De</th><th>Para</th><th>Pacientes</th><th>Recados</th><th>Situação</th></tr></thead>
    <tbody>{data.map(h => <tr key={h.id}><td>{dhm(h.criado_em)}</td><td>{h.de_nome}</td><td>{h.para_nome}</td><td>{h.itens.length}</td><td>{h.itens.filter(i => i.recado).length}/{h.itens.length}</td><td>{h.recebido_em ? "Recebido " + dhm(h.recebido_em) : <b>Ainda não recebido</b>}</td></tr>)}</tbody>
  </table></div></div>;
}

export function Passagem({ user, pendente, onReceive }) {
  const draft = useApi("/api/passagens/rascunho");
  const users = useApi("/api/usuarios");
  const [para, setPara] = useState("");
  const [recados, setRecados] = useState({});
  const [senha, setSenha] = useState("");
  const [ok, setOk] = useState(null);
  const a = useAction();
  const dests = (users.data || []).filter(u => u.id !== user.id && (u.ativo === undefined || u.ativo));
  const sign = e => {
    e.preventDefault();
    a.run(async () => { await api.post("/api/passagens", { para_usuario: +para, recados, senha }); setOk(dests.find(u => u.id === +para)); setSenha(""); setRecados({}); });
  };
  if (ok) return <div className="col narrow"><div className="alert ok"><b>Passagem assinada.</b> {ok.nome} verá o resumo ao entrar no sistema e precisa confirmar o recebimento.</div>
    <div className="row"><button className="btn" type="button" onClick={() => { setOk(null); draft.reload(); }}>Nova passagem</button><a className="btn ghost" href="#/pacientes" style={{ textDecoration: "none" }}>Voltar aos pacientes</a></div><Historico /></div>;
  return <form className="ho" onSubmit={sign}>
    {pendente ? <div className="alert warn">Você tem um plantão para receber de {pendente.de_nome}. <button className="btn small" type="button" onClick={onReceive}>Receber agora</button></div> : null}
    <div><h2 style={{ fontSize: 26 }}>Passar plantão</h2><p className="hint">Resumo gerado das anotações assinadas, do mais para o menos prioritário. Revise e escreva os recados. Para prioridade alta ou média, o recado é obrigatório.</p></div>
    <ErrorBox error={draft.error} />
    {draft.loading && !draft.data ? <Loading /> : null}
    {(draft.data || []).map(it => {
      const req = ["alta", "media"].includes(it.tier.k);
      return <div className="card ho-item" key={it.paciente_id}>
        <div className="who"><b>Leito {it.leito}</b> <span className={"chip " + it.tier.cls}>{it.tier.lab}</span><br />{it.nome}<br /><span className="hint">{it.diagnostico}</span></div>
        <div>
          <ul>{it.lines.map((l, i) => <li key={i}><Pend l={l} /></li>)}</ul>
          <label htmlFor={`rec-${it.paciente_id}`} className="hint"><b>Recado para quem recebe</b>{req ? " (obrigatório)" : ""}</label>
          <textarea id={`rec-${it.paciente_id}`} required={req} value={recados[it.paciente_id] || ""} onChange={e => setRecados({ ...recados, [it.paciente_id]: e.target.value })} placeholder="Ex.: comunicado ao enfermeiro, aguardando conduta." />
        </div>
      </div>;
    })}
    <div className="card col">
      <h3>Assinar passagem</h3>
      <div className="grid2">
        <label className="lbl">Para<select className="inp" value={para} onChange={e => setPara(e.target.value)} required>
          <option value="">Escolha o profissional…</option>{dests.map(u => <option key={u.id} value={u.id}>{u.nome} · {u.categoria}</option>)}</select></label>
        <label className="lbl">Sua senha (assinatura)<input className="inp" type="password" value={senha} onChange={e => setSenha(e.target.value)} required autoComplete="current-password" /></label>
      </div>
      <ErrorBox error={a.error} />
      <div><button className="btn big" type="submit" disabled={a.busy || !draft.data}>Assinar passagem</button></div>
    </div>
    <Historico />
  </form>;
}
