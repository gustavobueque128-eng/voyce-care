/* Microfone: permissão (getUserMedia), medidor de nível e ditado contínuo pt-BR (Web Speech API). */
import { useCallback, useEffect, useRef, useState } from "react";

const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export function micSupport() {
  return { sr: !!SR, media: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia), secure: !!window.isSecureContext };
}

export function useMicPermission() {
  const [perm, setPerm] = useState("unknown");
  useEffect(() => {
    let st = null;
    navigator.permissions && navigator.permissions.query({ name: "microphone" })
      .then(s => { st = s; setPerm(s.state); s.onchange = () => setPerm(s.state); }).catch(() => { });
    return () => { if (st) st.onchange = null; };
  }, []);
  return [perm, setPerm];
}

/* ---------- Medidor de nível (compartilhado) ---------- */
const levelSubs = new Set();
export function subscribeLevel(fn) { levelSubs.add(fn); return () => levelSubs.delete(fn); }
let actx = null;
function startLevel(stream) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    const src = actx.createMediaStreamSource(stream), an = actx.createAnalyser();
    an.fftSize = 512; src.connect(an);
    const buf = new Uint8Array(an.fftSize); let raf = 0;
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
      const l = Math.min(1, Math.sqrt(sum / buf.length) * 5); levelSubs.forEach(f => f(l));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); try { src.disconnect(); } catch (e) { } levelSubs.forEach(f => f(0)); };
  } catch (e) { return () => { }; }
}

async function openStream() {
  const s = micSupport();
  if (!s.secure) throw Object.assign(new Error("inseguro"), { name: "InsecureContext" });
  if (!s.media) throw Object.assign(new Error("sem mediaDevices"), { name: "NotSupportedError" });
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
}

export function micErrorMsg(e) {
  switch (e && e.name) {
    case "NotAllowedError": case "SecurityError":
      return "Permissão do microfone negada. Clique no ícone de cadeado ou de microfone na barra de endereço, escolha “Permitir” e tente de novo.";
    case "NotFoundError": case "OverconstrainedError":
      return "Nenhum microfone encontrado. Conecte um microfone (ou fone com microfone) e tente de novo.";
    case "NotReadableError": case "AbortError":
      return "O microfone está ocupado por outro programa (Teams, Zoom, gravador…). Feche-o e tente de novo.";
    case "InsecureContext":
      return "O navegador só libera o microfone em https:// ou em http://localhost. Neste aparelho, abra o endereço https:// mostrado pelo servidor (npm run start:https).";
    case "NotSupportedError":
      return "Este navegador não dá acesso ao microfone.";
    default:
      return "Não foi possível abrir o microfone (" + ((e && e.message) || e) + ").";
  }
}
function srErrorMsg(er) {
  if (er === "network") return "O reconhecimento de voz do navegador precisa de internet. Verifique a conexão e tente de novo.";
  if (er === "not-allowed" || er === "service-not-allowed") return micErrorMsg({ name: "NotAllowedError" });
  if (er === "audio-capture") return micErrorMsg({ name: "NotFoundError" });
  if (er === "language-not-supported") return "O navegador não reconhece português (pt-BR).";
  return "Erro no reconhecimento de voz: " + er;
}

/* ---------- Teste do microfone ---------- */
export function useMicTest() {
  const [state, setState] = useState({ on: false, msg: "", ok: null });
  const ref = useRef(null);
  const stop = useCallback(() => { if (ref.current) { ref.current.stopLevel(); ref.current.stream.getTracks().forEach(t => t.stop()); ref.current = null; } setState(s => ({ ...s, on: false })); }, []);
  const start = useCallback(async () => {
    try {
      const stream = await openStream();
      ref.current = { stream, stopLevel: startLevel(stream) };
      setState({ on: true, ok: true, msg: SR ? "Microfone liberado. Fale algo e veja a barra se mexer." : "Microfone liberado, mas este navegador não transcreve voz. Use Google Chrome ou Microsoft Edge para ditar." });
    } catch (e) { setState({ on: false, ok: false, msg: micErrorMsg(e) }); }
  }, []);
  useEffect(() => stop, [stop]);
  return { ...state, start, stop };
}

/* ---------- Ditado ---------- */
export function useDictation() {
  const [st, setSt] = useState({ listening: false, starting: false, transcript: "", interim: "", error: "" });
  const r = useRef({ want: false, rec: null, stream: null, stopLevel: null, base: "" });

  const cleanup = useCallback(() => {
    const x = r.current;
    if (x.stopLevel) x.stopLevel(); x.stopLevel = null;
    if (x.stream) x.stream.getTracks().forEach(t => t.stop()); x.stream = null;
    x.rec = null;
  }, []);

  const stop = useCallback(() => {
    const x = r.current; x.want = false;
    try { if (x.rec) x.rec.stop(); else { cleanup(); setSt(s => ({ ...s, listening: false, starting: false })); } }
    catch (e) { cleanup(); setSt(s => ({ ...s, listening: false, starting: false })); }
  }, [cleanup]);

  const start = useCallback(async (keep) => {
    if (!SR) { setSt(s => ({ ...s, error: "Este navegador não tem reconhecimento de voz. Use Google Chrome ou Microsoft Edge (com internet), ou registre por digitação." })); return; }
    const x = r.current; x.want = true;
    setSt(s => ({ listening: false, starting: true, transcript: keep ? s.transcript : "", interim: "", error: "" }));
    x.base = keep ? (x.base || "") : "";
    try { x.stream = await openStream(); x.stopLevel = startLevel(x.stream); }
    catch (e) { x.want = false; cleanup(); setSt(s => ({ ...s, starting: false, error: micErrorMsg(e) })); return; }
    if (!x.want) { cleanup(); setSt(s => ({ ...s, starting: false })); return; }
    let finals = "";
    const begin = () => {
      const rec = new SR(); x.rec = rec; finals = "";
      rec.lang = "pt-BR"; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
      rec.onstart = () => setSt(s => ({ ...s, listening: true, starting: false }));
      rec.onresult = e => {
        let f = "", it = "";
        for (let i = 0; i < e.results.length; i++) { const res = e.results[i]; if (res.isFinal) f += res[0].transcript + " "; else it += res[0].transcript; }
        finals = f;
        setSt(s => ({ ...s, transcript: (x.base + " " + f).replace(/\s+/g, " ").trim(), interim: it }));
      };
      rec.onerror = e => {
        if (e.error === "no-speech" || e.error === "aborted") return;
        x.want = false; setSt(s => ({ ...s, error: srErrorMsg(e.error) }));
      };
      rec.onend = () => {
        x.base = (x.base + " " + finals).replace(/\s+/g, " ").trim();
        if (x.want) { try { begin(); return; } catch (err) { } }
        cleanup();
        setSt(s => ({ ...s, listening: false, starting: false, transcript: (x.base + (s.interim ? " " + s.interim : "")).trim(), interim: "" }));
      };
      rec.start();
    };
    try { begin(); } catch (e) { x.want = false; cleanup(); setSt(s => ({ ...s, starting: false, error: "Não foi possível iniciar o reconhecimento de voz: " + e.message })); }
  }, [cleanup]);

  const setTranscript = useCallback(t => { r.current.base = t; setSt(s => ({ ...s, transcript: t })); }, []);
  const reset = useCallback(() => { stop(); r.current.base = ""; setSt({ listening: false, starting: false, transcript: "", interim: "", error: "" }); }, [stop]);

  useEffect(() => () => { r.current.want = false; try { if (r.current.rec) r.current.rec.abort(); } catch (e) { } cleanup(); }, [cleanup]);
  return { ...st, supported: !!SR, start, stop, setTranscript, reset };
}

export function speak(t) {
  try { if (!("speechSynthesis" in window)) return false; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = "pt-BR"; speechSynthesis.speak(u); return true; }
  catch (e) { return false; }
}
