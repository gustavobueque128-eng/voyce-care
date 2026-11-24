/* Dados fictícios de demonstração. Só são criados quando o banco está vazio e VOYCE_DEMO=1
   (no plano gratuito do Render o disco é apagado a cada reinício, então a demonstração é recriada sozinha). */
import * as db from "./db.js";
import { hashPassword } from "./auth.js";
import { news, needsComm, commText } from "../shared/clinical.js";

export function seedDemoIfEmpty() {
  if (process.env.VOYCE_DEMO !== "1") return false;
  if (db.get("SELECT COUNT(*) AS n FROM usuarios").n > 0) return false;

  const NOW = Date.now(), H = 3600e3, M = 60e3;
  const at = h => Math.round(NOW - h * H);
  const pad = n => String(n).padStart(2, "0");
  const hm = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const adminSenha = process.env.VOYCE_ADMIN_SENHA || "admin";
  const demoSenha = process.env.VOYCE_DEMO_SENHA || "demo1234";

  db.tx(() => {
    const U = {};
    const user = (key, nome, login, senha, cat, coren, admin) => {
      U[key] = db.run("INSERT INTO usuarios (nome, login, senha_hash, categoria, coren, admin, trocar_senha, criado_em) VALUES (?,?,?,?,?,?,0,?)",
        [nome, login, hashPassword(senha), cat, coren, admin ? 1 : 0, at(72)]).id;
    };
    user("admin", "Administrador", "admin", adminSenha, "ENF", "", true);
    user("carla", "Carla Mendes", "carla", demoSenha, "ENF", "COREN-ES 445566-ENF (fictício)", false);
    user("ana", "Ana Souza", "ana", demoSenha, "TE", "COREN-ES 123456-TE (fictício)", false);
    user("bruno", "Bruno Lima", "bruno", demoSenha, "TE", "COREN-ES 112233-TE (fictício)", false);
    user("paula", "Paula Reis", "paula", demoSenha, "TE", "COREN-ES 654321-TE (fictício)", false);

    const pac = (leito, nome, nasc, pront, diag, freq, glic, internadoH, altaH) => {
      const id = db.run("INSERT INTO pacientes (nome, nascimento, prontuario, leito, diagnostico, freq_horas, glicemia, internado_em, alta_em, criado_por) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [nome, nasc, pront, leito, diag, freq, glic ? 1 : 0, at(internadoH), altaH != null ? at(altaH) : null, U.carla]).id;
      return { id, leito, nome };
    };
    const p401 = pac("401", "José P. Silva", "1958-03-12", "100401", "Pneumonia em tratamento, evoluindo bem", 4, false, 50);
    const p402 = pac("402", "Maria L. Alves", "1971-09-04", "100402", "Crise hipertensiva", 2, false, 30);
    const p403 = pac("403", "Rafael C. Oliveira", "1985-01-22", "100403", "Celulite infecciosa em membro inferior direito", 6, false, 70);
    const p404 = pac("404", "Antônia F. Barros", "1949-06-30", "100404", "Pneumonia; diabética; O₂ por cateter nasal", 4, true, 40);
    const p405 = pac("405", "Sebastião R. Costa", "1953-11-18", "100405", "Infecção urinária", 4, false, 26);
    const p406 = pac("406", "Luíza M. Rocha", "1997-05-07", "100406", "1º dia de pós-operatório de apendicectomia", 6, false, 22);
    pac("407", "Helena S. Martins", "1962-02-14", "100407", "Gastroenterite aguda (alta)", 6, false, 60, 6);

    const reg = (p, h, who, vit, obs, metodo, secs, corr, opts = {}) => {
      const v = { pas: "", pad: "", fc: "", fr: "", sat: "", temp: "", glic: null, cons: "", o2: "", ...vit };
      const n = news(v), precisa = needsComm(v) ? 1 : 0, aferido = at(h), registrado = aferido + Math.round((secs || 40) * 1000 + 60e3);
      const validado = opts.validado ?? true;
      const id = db.run(`INSERT INTO registros (paciente_id, usuario_id, aferido_em, registrado_em, pas, pad, fc, fr, sat, temp, glic, cons, o2, obs, metodo, transcricao, campos_corrigidos, duracao_seg, news2, precisa_comunicar, status, validado_por, validado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.id, U[who], aferido, registrado, v.pas, v.pad, v.fc, v.fr, v.sat, v.temp, v.glic, v.cons, v.o2, obs, metodo,
          metodo === "voz" ? `Leito ${p.leito}, pressão ${v.pas} por ${v.pad}, frequência cardíaca ${v.fc}, frequência respiratória ${v.fr}, saturação ${v.sat} por cento, temperatura ${v.temp}. ${obs}` : "",
          corr, secs, n.score, precisa, validado ? "validado" : "aguardando", validado ? U.carla : null, validado ? registrado + 40 * M : null]).id;
      if (opts.comm) {
        const c = opts.comm;
        db.run("INSERT INTO comunicacoes (paciente_id, registro_id, de_usuario, texto, criado_em, ciente_por, ciente_em, conduta) VALUES (?,?,?,?,?,?,?,?)",
          [p.id, id, U[who], commText(p, v, hm(aferido)), registrado, c.ciente ? U.carla : null, c.ciente ? registrado + c.ciente * M : null, c.conduta || ""]);
      }
    };

    // plantão noturno
    reg(p401, 14, "paula", { pas: "132", pad: "84", fc: "76", fr: "18", sat: "96", temp: "36,4", cons: "A", o2: "nao" }, "Não refere dor. Dormiu bem.", "digitacao", 64, 0);
    reg(p402, 14, "paula", { pas: "168", pad: "102", fc: "102", fr: "20", sat: "95", temp: "37,2", cons: "A", o2: "nao" }, "Refere cefaleia.", "voz", 38, 1, { comm: { ciente: 12, conduta: "Captopril SL conforme prescrição; reavaliar PA em 1 h." } });
    reg(p402, 11, "paula", { pas: "150", pad: "94", fc: "96", fr: "18", sat: "96", temp: "37,0", cons: "A", o2: "nao" }, "Refere melhora parcial da cefaleia.", "voz", 34, 0, { comm: { ciente: 20, conduta: "Ciente. Manter SSVV de 2 em 2 h." } });
    reg(p403, 13, "bruno", { pas: "118", pad: "76", fc: "64", fr: "16", sat: "98", temp: "36,7", cons: "A", o2: "nao" }, "Sem queixas. Membro inferior direito com hiperemia em regressão.", "digitacao", 71, 1);
    reg(p404, 12, "bruno", { pas: "112", pad: "66", fc: "88", fr: "20", sat: "94", temp: "37,2", glic: "152", cons: "A", o2: "sim" }, "Não refere falta de ar. O₂ por cateter nasal a 2 L/min.", "voz", 41, 1, { comm: { ciente: 15, conduta: "Ciente. Manter O₂ e reavaliar saturação." } });
    reg(p405, 13, "bruno", { pas: "122", pad: "76", fc: "94", fr: "20", sat: "95", temp: "38,2", cons: "A", o2: "nao" }, "Refere calafrios.", "digitacao", 69, 0, { comm: { ciente: 25, conduta: "Dipirona conforme prescrição. Atenção à curva térmica." } });
    reg(p406, 15, "paula", { pas: "124", pad: "78", fc: "84", fr: "16", sat: "98", temp: "36,9", cons: "A", o2: "nao" }, "Refere dor em ferida operatória, nota 6. Analgesia feita.", "voz", 36, 0);
    // plantão diurno
    reg(p401, 6, "ana", { pas: "126", pad: "80", fc: "72", fr: "16", sat: "97", temp: "36,6", cons: "A", o2: "nao" }, "Não refere dor. Aceitou o café da manhã.", "voz", 29, 0);
    reg(p401, 1.5, "ana", { pas: "124", pad: "78", fc: "70", fr: "16", sat: "97", temp: "36,5", cons: "A", o2: "nao" }, "Aceitou toda a dieta do almoço.", "voz", 27, 0, { validado: false });
    reg(p402, 7, "ana", { pas: "142", pad: "88", fc: "88", fr: "18", sat: "96", temp: "36,9", cons: "A", o2: "nao" }, "Refere melhora da cefaleia.", "digitacao", 58, 1, { comm: { ciente: 10, conduta: "Ciente. PA em queda, manter conduta." } });
    reg(p402, 3.2, "ana", { pas: "136", pad: "84", fc: "82", fr: "16", sat: "97", temp: "36,8", cons: "A", o2: "nao" }, "Sem cefaleia.", "voz", 31, 0, { validado: false });
    reg(p403, 7, "ana", { pas: "116", pad: "74", fc: "62", fr: "15", sat: "98", temp: "36,5", cons: "A", o2: "nao" }, "Deambulou no corredor com a fisioterapia.", "voz", 33, 0);
    reg(p404, 6.5, "ana", { pas: "116", pad: "70", fc: "84", fr: "18", sat: "96", temp: "36,9", glic: "168", cons: "A", o2: "sim" }, "Não refere falta de ar, só cansaço.", "digitacao", 74, 2, { comm: { ciente: 18, conduta: "Ciente. Mantém O₂ a 2 L/min." } });
    reg(p404, 2, "ana", { pas: "118", pad: "72", fc: "82", fr: "18", sat: "96", temp: "36,8", glic: "142", cons: "A", o2: "sim" }, "Não refere falta de ar.", "voz", 35, 1, { validado: false, comm: { ciente: 9, conduta: "Ciente." } });
    reg(p406, 8, "carla", { pas: "120", pad: "76", fc: "80", fr: "16", sat: "98", temp: "36,8", cons: "A", o2: "nao" }, "Refere melhora da dor após medicação, nota 3.", "digitacao", 52, 0);
    // o leito 405 piora ao longo do dia
    reg(p405, 7.5, "ana", { pas: "112", pad: "68", fc: "102", fr: "22", sat: "94", temp: "38,5", cons: "A", o2: "nao" }, "Refere calafrios e mal-estar.", "voz", 37, 1, { comm: { ciente: 14, conduta: "Hemoculturas colhidas. Antibiótico conforme prescrição." } });
    reg(p405, 3.5, "ana", { pas: "100", pad: "60", fc: "112", fr: "24", sat: "93", temp: "38,9", cons: "A", o2: "nao" }, "Sonolento, mas responde às perguntas.", "voz", 40, 1, { comm: { ciente: 8, conduta: "Médico plantonista avisado; aguardando avaliação." } });
    reg(p405, 0.8, "ana", { pas: "92", pad: "56", fc: "120", fr: "26", sat: "92", temp: "39,2", cons: "C", o2: "nao" }, "Fala desconexa, pergunta onde está.", "voz", 44, 2, { validado: false, comm: {} });

    db.run("INSERT INTO comunicacoes (paciente_id, de_usuario, texto, criado_em) VALUES (?,?,?,?)",
      [p406.id, U.ana, "Leito 406 (Luíza M. Rocha): familiar pergunta sobre previsão de alta.", at(0.5)]);

    const item = (p, prioridade, tier, lines, recado) => ({ paciente_id: p.id, leito: p.leito, nome: p.nome, diagnostico: "", prioridade, tier, lines, recado });
    db.run("INSERT INTO passagens (de_usuario, para_usuario, criado_em, itens, recebido_em) VALUES (?,?,?,?,?)", [U.paula, U.ana, at(8.2), JSON.stringify([
      item(p405, "Média", "media", ["Última aferição: PA 122×76, FC 94, FR 20, SpO₂ 95%, T 38,2 °C. NEWS2 2.", "Observação: Refere calafrios."], "Febre de 38,2 °C com calafrios. Enfermeira ciente. Ficar atento."),
      item(p402, "Baixa-média", "bm", ["Última aferição: PA 150×94, FC 96. NEWS2 1."], "PA alta durante a noite. Anti-hipertensivo feito. SSVV de 2 em 2 horas."),
      item(p404, "Baixa", "baixa", ["Última aferição: SpO₂ 94% em O₂, glicemia 152. NEWS2 4."], "Mantém O₂ por cateter nasal a 2 L/min."),
      item(p401, "Baixa", "baixa", ["Última aferição: PA 132×84, FC 76. NEWS2 0."], "Noite tranquila, sem dor."),
      item(p403, "Baixa", "baixa", ["Última aferição: PA 118×76, FC 64. NEWS2 0."], "Sem intercorrências."),
      item(p406, "Baixa", "baixa", ["Última aferição: PA 124×78, FC 84. NEWS2 0."], "Dor 6 na ferida operatória; analgesia feita.")
    ]), at(8)]);

    db.run("INSERT INTO auditoria (em, usuario_id, acao, detalhe) VALUES (?,?,?,?)", [NOW, U.admin, "configuracao_inicial", "Dados fictícios de demonstração criados automaticamente"]);
  });
  return true;
}
