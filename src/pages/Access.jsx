import React, { useState } from "react";
import { api } from "../api.js";
import { ErrorBox, useAction } from "../ui.jsx";

const Brand = () => <div className="brand" style={{ marginBottom: 6 }}><h1 style={{ fontSize: 24 }}>Voyce Care</h1><span>Anotação de enfermagem por voz</span></div>;

export function Setup({ onDone }) {
  const [f, setF] = useState({ nome: "", login: "", coren: "", senha: "", senha2: "" });
  const a = useAction();
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = e => {
    e.preventDefault();
    if (f.senha !== f.senha2) return a.setError("As senhas não conferem.");
    a.run(async () => { const r = await api.post("/api/setup", f); onDone(r.user); });
  };
  return <main id="app"><form className="login card" onSubmit={submit}>
    <Brand />
    <h2>Configuração inicial</h2>
    <p className="hint">Crie a conta do enfermeiro administrador. Ele cadastra os demais profissionais e os pacientes.</p>
    <label className="lbl">Nome completo<input className="inp" value={f.nome} onChange={set("nome")} required autoComplete="name" /></label>
    <label className="lbl">Login<input className="inp" value={f.login} onChange={set("login")} required autoComplete="username" placeholder="ex.: carla.mendes" /></label>
    <label className="lbl">Coren<input className="inp" value={f.coren} onChange={set("coren")} placeholder="ex.: COREN-ES 445566-ENF" /></label>
    <label className="lbl">Senha (mínimo 8, com letras e números)<input className="inp" type="password" value={f.senha} onChange={set("senha")} required autoComplete="new-password" /></label>
    <label className="lbl">Repita a senha<input className="inp" type="password" value={f.senha2} onChange={set("senha2")} required autoComplete="new-password" /></label>
    <ErrorBox error={a.error} />
    <button className="btn big" type="submit" disabled={a.busy}>Criar administrador e entrar</button>
  </form></main>;
}

export function Login({ onDone, expired }) {
  const [f, setF] = useState({ login: "", senha: "" });
  const a = useAction();
  const submit = e => { e.preventDefault(); a.run(async () => { const r = await api.post("/api/auth/login", f); onDone(r.user); }); };
  return <main id="app"><form className="login card" onSubmit={submit}>
    <Brand />
    <h2>Entrar</h2>
    <p className="hint">Login individual e intransferível (Resolução Cofen 754/2024). Cada anotação sai assinada com o seu nome, categoria e Coren.</p>
    {expired ? <div className="alert warn">Sua sessão terminou. Entre de novo.</div> : null}
    <label className="lbl">Login<input className="inp" value={f.login} onChange={e => setF({ ...f, login: e.target.value })} required autoComplete="username" autoFocus /></label>
    <label className="lbl">Senha<input className="inp" type="password" value={f.senha} onChange={e => setF({ ...f, senha: e.target.value })} required autoComplete="current-password" /></label>
    <ErrorBox error={a.error} />
    <button className="btn big" type="submit" disabled={a.busy}>Entrar</button>
    <p className="hint">Esqueceu a senha? Peça ao administrador do sistema para redefini-la.</p>
  </form></main>;
}

export function ChangePassword({ onDone, title = "Trocar senha" }) {
  const [f, setF] = useState({ atual: "", nova: "", nova2: "" });
  const [ok, setOk] = useState(false);
  const a = useAction();
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = e => {
    e.preventDefault(); setOk(false);
    if (f.nova !== f.nova2) return a.setError("As senhas novas não conferem.");
    a.run(async () => { await api.post("/api/auth/senha", { atual: f.atual, nova: f.nova }); setF({ atual: "", nova: "", nova2: "" }); setOk(true); onDone && onDone(); });
  };
  return <form className="card col" onSubmit={submit}>
    <h3>{title}</h3>
    <label className="lbl">Senha atual<input className="inp" type="password" value={f.atual} onChange={set("atual")} required autoComplete="current-password" /></label>
    <label className="lbl">Nova senha (mínimo 8, com letras e números)<input className="inp" type="password" value={f.nova} onChange={set("nova")} required autoComplete="new-password" /></label>
    <label className="lbl">Repita a nova senha<input className="inp" type="password" value={f.nova2} onChange={set("nova2")} required autoComplete="new-password" /></label>
    <ErrorBox error={a.error} />
    {ok ? <div className="alert ok">Senha alterada.</div> : null}
    <button className="btn" type="submit" disabled={a.busy}>Salvar nova senha</button>
  </form>;
}

export function ForcePassword({ user, onDone }) {
  return <main id="app"><div className="login">
    <Brand />
    <div className="alert info">Olá, {user.nome}. Sua senha foi criada pelo administrador: escolha uma senha pessoal antes de continuar.</div>
    <ChangePassword title="Definir senha pessoal" onDone={() => onDone({ ...user, trocar_senha: false })} />
  </div></main>;
}
