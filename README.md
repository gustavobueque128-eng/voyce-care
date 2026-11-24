# Voyce Care

Sistema de anotação de enfermagem por voz para uso no setor: o técnico afere os sinais vitais, dita (ou digita), revisa e assina. O sistema calcula o NEWS2, ordena os pacientes por prioridade, avisa o enfermeiro das alterações e registra a passagem de plantão.

- **Front-end:** React 18 + Vite (`src/`)
- **Back-end:** Node.js + Express (`server/`)
- **Banco de dados:** SQLite em `server/data/voyce.db` (via sql.js, sem instalação extra)
- **Regras clínicas compartilhadas:** `shared/clinical.js` (NEWS2, faixas de alerta, interpretação da fala, prioridade)

## Como rodar

Requer Node.js 14 ou mais recente.

```bash
npm install
npm run build        # compila o front-end
npm start            # http://localhost:3001 (só neste computador)
npm run start:https  # rede: celulares e tablets (veja "Celular e tablet")
```


Para desenvolver: `npm run dev` e abra http://localhost:5173.

## Hospedar no Render

O arquivo `render.yaml` já descreve o serviço: plano gratuito, Node 22, fuso de Brasília e dados de demonstração.

1. Crie um repositório no GitHub e envie este projeto (veja os comandos abaixo).
2. No Render: **New → Blueprint**, conecte o GitHub e escolha o repositório. Confirme em **Apply**.
3. Ao terminar, o site fica em `https://voyce-care.onrender.com` (ou parecido). Ele já tem HTTPS, então o microfone funciona no celular sem instalar certificado.

```bash
git init
git config user.name "Seu Nome"
git config user.email "seu-email@exemplo.com"
git add .
git commit -m "Voyce Care"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/voyce-care.git
git push -u origin main
```

**Atenção no plano gratuito:**
- **Os dados não ficam salvos.** O disco é apagado a cada reinício, atualização ou quando o site "dorme". A cada vez que o servidor sobe, os dados fictícios de demonstração são recriados.
- O site **dorme após 15 minutos sem uso**. O primeiro acesso depois disso demora cerca de 1 minuto.
- Para guardar dados de verdade, use um plano pago com **disco persistente**: no `render.yaml`, troque `plan: free` por `plan: starter`, adicione `disk: { name: dados, mountPath: /var/data, sizeGB: 1 }` e a variável `VOYCE_DATA_DIR=/var/data`, e remova `VOYCE_DEMO`.
- A demonstração usa **admin / admin**. Qualquer pessoa que tentar essa combinação entra como administrador. Para mudar, edite `VOYCE_ADMIN_SENHA` no painel do Render (Environment) e reinicie. **Não coloque dados reais de pacientes** nesse modo.

## Primeiro acesso

1. Abra o sistema. Na primeira vez, ele pede para criar a conta do **enfermeiro administrador**.
2. Em **Administração**, cadastre os técnicos e enfermeiros com uma senha provisória. Cada um troca a senha no primeiro login.
3. Em **Pacientes**, o enfermeiro usa **Admitir paciente** (nome, leito, nascimento, diagnóstico, frequência dos sinais vitais, glicemia).

## Uso no plantão

- **Pacientes:** lista por prioridade (NEWS2 da última anotação, atrasos conforme a frequência prescrita e pendências de comunicação). Atualiza sozinha.
- **Paciente → Ditar por voz:** toque no microfone, dite e toque de novo para parar. Corrija a transcrição se precisar, toque em **Organizar campos**, confira cada campo com o monitor e assine. **Digitar** é a alternativa.
  - Exemplo: *"Leito 405, pressão 120 por 80, frequência cardíaca 76, frequência respiratória 18, saturação 96 por cento, temperatura 36 vírgula 5, alerta, em ar ambiente. Não refere dor."*
  - Valores fora da faixa ou NEWS2 alto geram a comunicação ao enfermeiro.
- **Mensagens:** o enfermeiro dá ciência e registra a conduta.
- **Validar:** o enfermeiro valida as anotações dos técnicos (as dele já saem validadas).
- **Passagem:** resumo automático dos pacientes, recados (obrigatórios para prioridade alta ou média) e assinatura com senha. Quem recebe confirma paciente por paciente ao entrar.
- **Relatórios:** voz × digitação (tempo mediano, correções), comunicação de alterações graves e exportação em CSV para o Excel.
- **Administração:** profissionais, auditoria de todas as ações e backup.

## Celular e tablet

O navegador do celular só libera o microfone com **HTTPS confiável**. O sistema resolve isso:

1. No computador, rode `npm run start:https`. O terminal mostra os endereços, por exemplo:
   ```
   Neste computador: http://localhost:3000
   1. Instale o certificado (uma vez por aparelho):  http://192.168.3.119:3000/certificado
   2. Depois abra no Chrome/Safari:                  https://192-168-3-119.sslip.io:3001
   ```
2. No celular, conectado ao **mesmo Wi-Fi**, abra o endereço do passo 1 e siga as instruções para instalar o certificado **Voyce Care CA**:
   - **Android:** Configurações → Segurança → Criptografia e credenciais → Instalar certificado → **Certificado CA**.
   - **iPhone:** Ajustes → Perfil Transferido → Instalar. Depois, Ajustes → Geral → Sobre → Ajustes de Confiança de Certificados → ativar.
3. Abra o endereço do passo 2. Não deve aparecer aviso de segurança. Entre com o seu login e senha.

Esses endereços também aparecem em **Minha conta** quando o servidor está no modo rede.

Como funciona:
- O servidor cria uma autoridade certificadora própria (`server/data/certs`) e, com ela, o certificado do servidor.
- O nome `…sslip.io` é um DNS público gratuito que aponta para o IP do computador na rede. Por isso o celular precisa de internet (o reconhecimento de voz também precisa).

**Cuidados:**
- **Fixe o IP do computador** (no roteador, "reserva de DHCP"). Se o IP mudar, o endereço muda. O certificado é refeito sozinho.
- **Guarde a pasta `server/data/certs` em segurança.** A `ca-key.pem` permite criar certificados em que os aparelhos confiam. Não envie esse arquivo a ninguém. Se ele vazar, apague a pasta: uma nova autoridade é criada, e você reinstala o certificado nos aparelhos e remove o antigo.

## Microfone

- O navegador só libera o microfone em **https://** ou em **http://localhost**. No celular, siga a seção "Celular e tablet".
- A transcrição em português usa o reconhecimento de voz do **Google Chrome** ou do **Microsoft Edge**, que precisa de internet.
- Em **Minha conta → Permitir e testar microfone** você confere se está tudo certo.

## Dados e segurança

- Senhas guardadas com hash (scrypt). A sessão dura 12 horas, em cookie HttpOnly. O login bloqueia por 5 minutos depois de 5 tentativas erradas.
- Toda ação fica na auditoria (quem, quando, o quê). As anotações assinadas não podem ser editadas: para corrigir, registre uma nova aferição.
- **Backup:** automático ao iniciar e a cada 6 horas em `server/data/backups` (guarda os 30 mais recentes). Copie essa pasta regularmente para outro lugar.
- Os dados são de saúde (dados sensíveis pela LGPD). Mantenha o computador servidor protegido por senha, limite o acesso à rede do setor e combine com a instituição o uso e a guarda das informações.

## API (resumo)

`/api/setup` · `/api/auth/login|logout|me|senha` · `/api/usuarios` · `/api/pacientes` (`/:id`, `/:id/alta`) · `/api/registros` (`/:id/validar`, `/:id/comunicar`) · `/api/comunicacoes` (`/:id/ciente`) · `/api/passagens` (`/rascunho`, `/pendente`, `/:id/receber`) · `/api/relatorios` (`/registros.csv`) · `/api/auditoria` · `/api/admin/backup`
