import React, { useEffect, useState } from "react";
import { api, onUnauthorized } from "./api.js";
import { useApi, Badge, go, ErrorBox, useAction } from "./ui.jsx";
import { Setup, Login, ForcePassword } from "./pages/Access.jsx";
import Pacientes from "./pages/Pacientes.jsx";
import Paciente from "./pages/Paciente.jsx";
import Mensagens from "./pages/Mensagens.jsx";
import Validar from "./pages/Validar.jsx";
import { Passagem, Receber } from "./pages/Passagem.jsx";
import Relatorios from "./pages/Relatorios.jsx";
import Admin from "./pages/Admin.jsx";
import Conta from "./pages/Conta.jsx";

function useHash() {
  const [h, setH] = useState(location.hash || "#/pacientes");
  useEffect(() => { const f = () => setH(location.hash || "#/pacientes"); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  return h;
}

function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const iv = setInterval(() => setT(new Date()), 15000); return () => clearInterval(iv); }, []);
  return <span className="clock" aria-label="Hora atual">{String(t.getHours()).padStart(2, "0")}:{String(t.getMinutes()).padStart(2, "0")}</span>;
}

function Shell({ user, setUser }) {
  const hash = useHash();
  const isEnf = user.categoria === "ENF";
  const comms = useApi("/api/comunicacoes?pendentes=1", { every: 20000 });
  const val = useApi(isEnf ? "/api/registros?status=aguardando" : null, { every: 30000 });
  const pend = useApi("/api/passagens/pendente", { every: 30000 });
  const [later, setLater] = useState(false);
  const refreshCounts = () => { comms.reload(); val.reload(); pend.reload(); };
  const logout = async () => { await api.post("/api/auth/logout").catch(() => { }); setUser(null); go("#/pacientes"); };

  const [, route, arg] = hash.split("/");
  const nComms = comms.data ? comms.data.length : 0, nVal = val.data ? val.data.length : 0;
  const nav = [["pacientes", "Pacientes", 0], ["mensagens", "Mensagens", nComms], ...(isEnf ? [["validar", "Validar", nVal]] : []), ["passagem", "Passagem", pend.data ? 1 : 0], ["relatorios", "Relatórios", 0], ...(user.admin ? [["admin", "Administração", 0]] : []), ["conta", "Minha conta", 0]];

  let page;
  if (pend.data && !later && route !== "conta") page = <Receber passagem={pend.data} onDone={() => { pend.reload(); }} onLater={() => setLater(true)} />;
  else if (route === "paciente" && arg) page = <Paciente id={arg} user={user} onChange={refreshCounts} />;
  else if (route === "mensagens") page = <Mensagens user={user} onChange={refreshCounts} />;
  else if (route === "validar" && isEnf) page = <Validar onChange={refreshCounts} />;
  else if (route === "passagem") page = <Passagem user={user} pendente={pend.data} onReceive={() => setLater(false)} />;
  else if (route === "relatorios") page = <Relatorios />;
  else if (route === "admin" && user.admin) page = <Admin user={user} />;
  else if (route === "conta") page = <Conta user={user} setUser={setUser} />;
  else page = <Pacientes user={user} />;

  const cur = route === "paciente" ? "pacientes" : route;
  return <div id="device">
    <header className="top"><div className="top-in">
      <div className="brand"><h1>Voyce Care</h1><span>Anotação de enfermagem por voz</span></div>
      <div className="status"><Clock /><span className="pill">{user.nome} · {user.categoria}{user.coren ? " · " + user.coren : ""}</span>
        <button className="btn small ghost" type="button" onClick={logout}>Sair</button></div>
    </div>
      <nav className="mainnav" aria-label="Menu principal">{nav.map(([k, l, n]) =>
        <a key={k} href={"#/" + k} aria-current={cur === k ? "page" : undefined}>{l}<Badge n={n} /></a>)}</nav>
    </header>
    <main id="app">{page}</main>
  </div>;
}

export default function App() {
  const [st, setSt] = useState({ phase: "boot", user: null, err: null });
  const boot = () => {
    api.get("/api/setup").then(s => {
      if (s.precisaConfigurar) return setSt({ phase: "setup" });
      return api.get("/api/auth/me").then(r => setSt({ phase: "app", user: r.user })).catch(() => setSt({ phase: "login" }));
    }).catch(e => setSt({ phase: "error", err: e.message }));
  };
  useEffect(() => { boot(); return onUnauthorized(() => setSt(s => (s.phase === "app" ? { phase: "login", expired: true } : s))); }, []);
  const setUser = u => setSt(u ? { phase: "app", user: u } : { phase: "login" });

  if (st.phase === "boot") return <div className="boot"><p className="hint">Carregando o Voyce Care…</p></div>;
  if (st.phase === "error") return <div className="boot"><div className="card" style={{ maxWidth: 520 }}><h2 style={{ fontSize: 20, marginBottom: 8 }}>Não consegui falar com o servidor</h2><ErrorBox error={st.err} /><button className="btn" type="button" onClick={boot}>Tentar de novo</button></div></div>;
  if (st.phase === "setup") return <Setup onDone={setUser} />;
  if (st.phase === "login") return <Login onDone={setUser} expired={st.expired} />;
  if (st.user.trocar_senha) return <ForcePassword user={st.user} onDone={setUser} />;
  return <Shell user={st.user} setUser={setUser} />;
}
