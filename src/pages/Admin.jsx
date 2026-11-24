import React, { useState } from "react";
import { api } from "../api.js";
import { useApi, useAction, ErrorBox, Loading, Modal, dhm } from "../ui.jsx";

function UserForm({ initial, onSaved, onCancel }) {
  const editing = !!initial;
  const [f, setF] = useState(() => ({ nome: "", login: "", coren: "", categoria: "TE", admin: false, senha: "", ...(initial || {}), ...(initial ? { senha: "" } : {}) }));
  const a = useAction();
  const set = k => e => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const submit = e => {
    e.preventDefault();
    a.run(async () => {
      if (editing) { const body = { nome: f.nome, coren: f.coren, categoria: f.categoria, admin: f.admin }; if (f.senha) body.senha = f.senha; await api.put(`/api/usuarios/${initial.id}`, body); }
      else await api.post("/api/usuarios", f);
      onSaved();
    });
  };
  return <form className="col" onSubmit={submit}>
    <div className="grid2">
      <label className="lbl">Nome completo<input className="inp" value={f.nome} onChange={set("nome")} required /></label>
      <label className="lbl">Login{editing ? <input className="inp" value={f.login} disabled /> : <input className="inp" value={f.login} onChange={set("login")} required placeholder="ex.: ana.souza" />}</label>
      <label className="lbl">Categoria<select className="inp" value={f.categoria} onChange={set("categoria")}><option value="TE">Técnico(a) de enfermagem</option><option value="ENF">Enfermeiro(a)</option></select></label>
      <label className="lbl">Coren<input className="inp" value={f.coren} onChange={set("coren")} placeholder="ex.: COREN-ES 123456-TE" /></label>
      <label className="lbl">{editing ? "Nova senha provisória (deixe vazio para manter)" : "Senha provisória"}<input className="inp" type="password" value={f.senha} onChange={set("senha")} required={!editing} autoComplete="new-password" /></label>
      <label className="check" style={{ alignSelf: "end", paddingBottom: 8 }}><input type="checkbox" checked={!!f.admin} onChange={set("admin")} /> Administrador do sistema</label>
    </div>
    <p className="hint">A pessoa precisa trocar a senha provisória no primeiro acesso. Senha: mínimo 8 caracteres, com letras e números.</p>
    <ErrorBox error={a.error} />
    <div className="row"><button className="btn" type="submit" disabled={a.busy}>{editing ? "Salvar" : "Cadastrar"}</button><button className="btn ghost" type="button" onClick={onCancel}>Cancelar</button></div>
  </form>;
}

function Usuarios({ me }) {
  const { data, error, loading, reload } = useApi("/api/usuarios");
  const [edit, setEdit] = useState(null);
  const a = useAction();
  return <div className="card col">
    <div className="row" style={{ justifyContent: "space-between" }}><h3>Profissionais</h3><button className="btn" type="button" onClick={() => setEdit({})}>Cadastrar profissional</button></div>
    <ErrorBox error={error || a.error} />
    {loading && !data ? <Loading /> : null}
    <div className="tblwrap"><table><thead><tr><th>Nome</th><th>Login</th><th>Categoria</th><th>Coren</th><th>Situação</th><th></th></tr></thead>
      <tbody>{(data || []).map(u => <tr key={u.id}>
        <td>{u.nome}{u.admin ? <span className="chip c-mid" style={{ marginLeft: 6 }}>admin</span> : null}</td><td>{u.login}</td><td>{u.categoria}</td><td>{u.coren || "—"}</td>
        <td>{u.ativo ? (u.trocar_senha ? "Ativo · senha provisória" : "Ativo") : <b>Desativado</b>}</td>
        <td className="row" style={{ gap: 4 }}>
          <button className="btn small ghost" type="button" onClick={() => setEdit(u)}>Editar</button>
          {u.id !== me.id ? <button className="btn small ghost" type="button" disabled={a.busy} onClick={() => a.run(async () => { await api.put(`/api/usuarios/${u.id}`, { ativo: !u.ativo }); reload(); })}>{u.ativo ? "Desativar" : "Reativar"}</button> : null}
        </td></tr>)}</tbody></table></div>
    {edit ? <Modal title={edit.id ? "Editar profissional" : "Cadastrar profissional"} onClose={() => setEdit(null)}>
      <UserForm initial={edit.id ? edit : null} onSaved={() => { setEdit(null); reload(); }} onCancel={() => setEdit(null)} /></Modal> : null}
  </div>;
}

const ACOES = { login: "Entrou", login_falhou: "Login recusado", logout: "Saiu", troca_senha: "Trocou a senha", configuracao_inicial: "Configuração inicial", usuario_criado: "Cadastrou profissional", usuario_alterado: "Alterou profissional", paciente_admitido: "Admitiu paciente", paciente_alterado: "Alterou paciente", paciente_alta: "Deu alta", registro_assinado: "Assinou anotação", registro_validado: "Validou anotação", comunicacao_enviada: "Enviou comunicação", comunicacao_ciente: "Ciente de comunicação", passagem_assinada: "Assinou passagem", passagem_recebida: "Recebeu passagem", exportou_csv: "Exportou planilha", backup: "Fez backup" };

function Auditoria() {
  const { data, error, reload } = useApi("/api/auditoria");
  return <div className="card col">
    <div className="row" style={{ justifyContent: "space-between" }}><h3>Auditoria (últimos 300 eventos)</h3><button className="btn small ghost" type="button" onClick={reload}>Atualizar</button></div>
    <ErrorBox error={error} />
    <div className="tblwrap" style={{ maxHeight: 420, overflowY: "auto" }}><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead>
      <tbody>{(data || []).map(e => <tr key={e.id}><td>{dhm(e.em)}</td><td>{e.usuario_nome || "—"}</td><td>{ACOES[e.acao] || e.acao}</td><td>{e.detalhe}</td></tr>)}</tbody></table></div>
  </div>;
}

function Backup() {
  const a = useAction(); const [f, setF] = useState("");
  return <div className="card col"><h3>Backup do banco de dados</h3>
    <p className="hint">O servidor faz uma cópia automática ao iniciar e a cada 6 horas (mantém as 30 mais recentes) na pasta <code>server/data/backups</code>. Copie essa pasta para um pendrive ou nuvem com frequência.</p>
    <ErrorBox error={a.error} />{f ? <div className="alert ok">Backup criado: {f}</div> : null}
    <div><button className="btn ghost" type="button" disabled={a.busy} onClick={() => a.run(async () => { const r = await api.post("/api/admin/backup"); setF(r.arquivo); })}>Fazer backup agora</button></div>
  </div>;
}

export default function Admin({ user }) {
  return <div className="col"><h2 style={{ fontSize: 24 }}>Administração</h2><Usuarios me={user} /><Backup /><Auditoria /></div>;
}
