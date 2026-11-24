import React from "react";
import { LevelMeter, useApi } from "../ui.jsx";
import { micSupport, useMicPermission, useMicTest } from "../mic.js";
import { ChangePassword } from "./Access.jsx";

const PERM = { granted: ["Permitido", "c-ok"], denied: ["Bloqueado", "c-crit"], prompt: ["Vai perguntar", "c-warn"], unknown: ["Não verificado", "c-neu"] };

export function MicCheck() {
  const sup = micSupport();
  const [perm] = useMicPermission();
  const t = useMicTest();
  const [lab, cls] = PERM[t.ok === true ? "granted" : perm] || PERM.unknown;
  return <div className="card micbox">
    <div className="row"><h3>Microfone</h3><span className={"chip " + cls}>{lab}</span></div>
    <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
      <li>Conexão segura (https ou localhost): <b>{sup.secure ? "sim" : "não"}</b></li>
      <li>Acesso ao microfone: <b>{sup.media ? "disponível" : "indisponível"}</b></li>
      <li>Transcrição de voz pt-BR: <b>{sup.sr ? "disponível" : "indisponível (use Chrome ou Edge)"}</b></li>
    </ul>
    {t.on ? <LevelMeter /> : null}
    {t.msg ? <div className={"alert " + (t.ok ? "ok" : "warn")}>{t.msg}</div> : null}
    <div><button className={"btn small " + (t.on ? "warn" : "")} type="button" disabled={!sup.media} onClick={t.on ? t.stop : t.start}>{t.on ? "Parar teste" : "Permitir e testar microfone"}</button></div>
  </div>;
}

function NoCelular() {
  const { data } = useApi("/api/rede");
  if (!data) return null;
  if (!data.https) return <div className="card"><h3>Usar no celular ou tablet</h3><p className="hint" style={{ margin: "6px 0 0" }}>Inicie o servidor com <code>npm run start:https</code> e volte a esta tela para ver o endereço. No celular, o microfone só funciona com HTTPS.</p></div>;
  if (data.hospedado) return <div className="card"><h3>Usar no celular ou tablet</h3><p className="hint" style={{ margin: "6px 0 0" }}>Abra <b>{data.celular}</b> no navegador do aparelho e entre normalmente. O endereço já tem HTTPS, então o microfone funciona sem instalar nada.</p></div>;
  if (!data.celular) return <div className="alert warn">O computador não está conectado a uma rede Wi-Fi ou cabo: os aparelhos não conseguem acessar.</div>;
  return <div className="card"><h3>Usar no celular ou tablet</h3><ol style={{ margin: "6px 0 0", paddingLeft: 20 }}>
    <li>Conecte o aparelho ao mesmo Wi-Fi e abra <b>{data.certificado}</b> para instalar o certificado (uma vez).</li>
    <li>Depois abra <b>{data.celular}</b> e entre normalmente.</li></ol></div>;
}

export default function Conta({ user }) {
  return <div className="col narrow">
    <h2 style={{ fontSize: 24 }}>Minha conta</h2>
    <div className="card"><b>{user.nome}</b><br /><span className="hint">Login {user.login} · {user.categoria === "ENF" ? "Enfermeiro(a)" : "Técnico(a) de enfermagem"}{user.coren ? " · " + user.coren : ""}{user.admin ? " · administrador" : ""}</span></div>
    <MicCheck />
    <NoCelular />
    <ChangePassword />
  </div>;
}
