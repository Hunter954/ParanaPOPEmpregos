# Deploy no Railway — ParanáPOP Empregos Bot

Esta versão é **Baileys puro**. Não usa OpenWA, Chromium nem Puppeteer.

## Variáveis obrigatórias

No serviço do APP, deixe somente o necessário:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
ADMIN_USER=admin
ADMIN_PASSWORD=troque_esta_senha
SESSION_SECRET=uma_chave_grande_aleatoria
BASE_URL=https://seu-app.up.railway.app
NODE_ENV=production
ENABLE_WHATSAPP=true
WA_SESSION_ID=paranapop-empregos
WA_START_ON_BOOT=false
```

`PORT` é fornecido pelo Railway. Pode apagar `PORT` manual.

## Apague variáveis antigas

Apague se existirem:

```env
WHATSAPP_ENGINE
WA_ENABLE_OPENWA
CHROME_PATH
PUPPETEER_EXECUTABLE_PATH
WA_BROWSER_TIMEOUT_MS
WA_DEBUG_WAIT_TIMEOUT_MS
WA_PROTOCOL_TIMEOUT_MS
WA_MAX_LAUNCH_ATTEMPTS
WA_RETRY_CLEAN_SESSION
```

## Log correto

Depois do deploy correto, o log precisa mostrar:

```text
VERSAO DO PROJETO: 1.0.3 BAILEYS PURO SEM OPENWA BUILD FIX
Motor WhatsApp configurado: baileys
WhatsApp aguardando início manual em /admin/qr.
```

Se aparecer `OpenWA`, `Version: 4.76.0` ou `Launching Browser`, o Railway ainda está rodando um deploy antigo.

## Build

Esta versão usa Dockerfile com `git`, `python3`, `make` e `g++` para evitar falha de build em dependências npm.
