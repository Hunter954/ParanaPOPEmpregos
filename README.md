# ParanáPOP Empregos Bot

Projeto completo para um bot de WhatsApp comercial do **ParanáPOP Empregos**, com **Node.js/Express**, **PostgreSQL**, painel online para login, QR Code e gestão de candidatos, empresas, vagas e candidaturas.

## Atualização desta versão

Esta versão mantém o **OpenWA** instalado, mas deixa o motor **Baileys blindado como padrão no Railway**. Mesmo se uma variável antiga `WHATSAPP_ENGINE=openwa` continuar salva, o projeto força Baileys enquanto `WA_ENABLE_OPENWA=false`.

Motivo: o OpenWA 4.76.0 pode travar no WhatsApp Web atual com o erro `Waiting failed: 30000ms exceeded` logo depois de `Page loaded`. Com `WHATSAPP_ENGINE=baileys`, o QR Code é gerado por WebSocket, sem depender do Chromium/Puppeteer.

Para usar OpenWA mesmo assim, defina as duas variáveis:

```env
WHATSAPP_ENGINE=openwa
WA_ENABLE_OPENWA=true
```

Para o Railway, o recomendado é:

```env
WHATSAPP_ENGINE=baileys
WA_ENABLE_OPENWA=false
WA_START_ON_BOOT=false
WA_ALLOW_BOOT_START=false
WA_UNSAFE_START_ON_BOOT=false
```

## O que já vem pronto

- Bot WhatsApp com fluxo inicial: Candidato, Empresa ou Suporte.
- Cadastro automático do número de WhatsApp no primeiro contato.
- Cadastro de candidato com nome, cidade, áreas, modalidade, experiência e preferência de alertas.
- Liberação automática de 60 dias grátis para candidatos.
- Estrutura comercial preparada para plano candidato de R$ 9,90 por 90 dias.
- Cadastro de empresa com nome, responsável e cidade.
- Empresa pode cadastrar vaga pelo WhatsApp.
- Empresa pode ver vagas, pausar, reativar e consultar candidatos.
- Limite inicial de vagas por empresa no plano gratuito.
- Estrutura preparada para futuro plano empresa de R$ 34,90.
- Alertas automáticos para candidatos compatíveis quando uma vaga é publicada.
- Candidato pode ver vagas, ver detalhes e se candidatar usando comandos como `VAGA 12` e `CANDIDATAR 12`.
- Painel `/admin` com:
  - login;
  - status do WhatsApp;
  - QR Code;
  - motor atual do WhatsApp;
  - usuários;
  - vagas;
  - candidaturas;
  - disparo manual;
  - suporte;
  - ativação manual de premium.
- Webhook reservado para Mercado Pago em `/webhooks/mercadopago`.
- Dockerfile pronto para Railway com Chromium instalado para o caso de usar OpenWA.

## Estrutura

```txt
paranapop-empregos-bot/
├── Dockerfile
├── railway.json
├── package.json
├── .env.example
├── migrations/
│   └── 001_init.sql
└── src/
    ├── server.js
    ├── bot.js
    ├── db.js
    ├── flows.js
    ├── templates.js
    ├── routes/
    ├── views/
    └── public/
```

## Como subir no Railway

> Importante no Railway: depois de criar o PostgreSQL, a variável do banco precisa estar no **serviço do app**. Se aparecer erro `ECONNREFUSED 127.0.0.1:5432` ou `Banco PostgreSQL não configurado`, veja o arquivo `RAILWAY_DEPLOY.md`.

1. Suba este projeto para um repositório GitHub.
2. No Railway, crie um novo projeto apontando para o repositório.
3. Adicione um serviço PostgreSQL no Railway.
4. No serviço do app, vá em **Variables** e adicione a referência `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
5. Configure as demais variáveis abaixo no Railway.

```env
NODE_ENV=production
PORT=3000
BASE_URL=https://seu-projeto.up.railway.app
SESSION_SECRET=uma-chave-grande-e-segura
ADMIN_USER=admin
ADMIN_PASSWORD=uma-senha-forte
RUN_MIGRATIONS=true
ENABLE_WHATSAPP=true
WA_SESSION_ID=paranapop-empregos
WHATSAPP_ENGINE=baileys
WA_ENABLE_OPENWA=false
WA_START_ON_BOOT=false
WA_ALLOW_BOOT_START=false
WA_UNSAFE_START_ON_BOOT=false
WA_AUTO_RECONNECT=true
WA_RECONNECT_DELAY_MS=5000
WA_MAX_LAUNCH_ATTEMPTS=2
WA_RETRY_CLEAN_SESSION=true
CANDIDATE_TRIAL_DAYS=60
CANDIDATE_PREMIUM_PRICE_BRL=9.90
CANDIDATE_PREMIUM_DAYS=90
COMPANY_FREE_JOB_LIMIT=3
COMPANY_PREMIUM_PRICE_BRL=34.90
BROADCAST_LIMIT_PER_JOB=80
BROADCAST_DELAY_MS=700
```

6. Faça deploy.
7. Acesse `https://seu-projeto.up.railway.app/admin`.
8. Faça login com `ADMIN_USER` e `ADMIN_PASSWORD`.
9. Vá em **QR Code**, clique em **Gerar/Iniciar** e leia com o WhatsApp comercial.
10. Se precisar gerar outro QR, clique em **Limpar sessão e tentar de novo**.

## Usando OpenWA

O OpenWA continua disponível. Para ativar:

```env
WHATSAPP_ENGINE=openwa
WA_ENABLE_OPENWA=true
CHROME_PATH=/usr/bin/chromium
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WA_DEBUG_WAIT_TIMEOUT_MS=120000
WA_BROWSER_TIMEOUT_MS=120000
WA_PROTOCOL_TIMEOUT_MS=120000
```

Mesmo com o patch de timeout, o OpenWA pode continuar falhando se o WhatsApp Web alterar a estrutura interna. Nesse caso, volte para:

```env
WHATSAPP_ENGINE=baileys
```

## Rodando localmente

```bash
npm install
cp .env.example .env
npm run db:init
npm run dev
```

Para rodar localmente, você precisa ter PostgreSQL instalado. Se usar OpenWA, também precisa de Chromium/Chrome e `CHROME_PATH` configurado.

## Comandos importantes no WhatsApp

### Geral

- `MENU` — volta para o menu principal do perfil já cadastrado.
- `RESETAR` — apaga o fluxo atual e começa novamente.
- `PAUSAR` — pausa alertas.
- `ATIVAR` — ativa alertas.

### Candidato

- `VAGA 12` — vê detalhes da vaga 12.
- `CANDIDATAR 12` — registra interesse na vaga 12.

### Empresa

A empresa usa o menu numérico para cadastrar, pausar, reativar e consultar candidatos.

## Futuro Mercado Pago

O endpoint `/webhooks/mercadopago` já existe, mas ainda não libera planos automaticamente. Para ativar depois:

1. Criar preferência de pagamento no Mercado Pago.
2. Salvar `metadata.user_id` e `metadata.purpose`.
3. Validar assinatura do webhook.
4. Consultar o pagamento no Mercado Pago.
5. Atualizar:
   - candidato: `subscription_plan`, `subscription_status`, `premium_until`;
   - empresa: `company_plan`.

## Observações de uso

- Use disparos com moderação para reduzir risco de bloqueio do número.
- Evite importar listas frias de contatos. O ideal é o usuário chamar o número primeiro.
- Mantenha o WhatsApp comercial ativo e com boa reputação.
- A sessão do WhatsApp em deploy sem volume persistente pode pedir novo QR após redeploy.
- Faça backup do PostgreSQL.
