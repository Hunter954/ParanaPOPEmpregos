# ParanáPOP Empregos Bot — Baileys puro 502 fix

Versão `1.0.4`. Esta versão usa somente Baileys. Não existe OpenWA no runtime, não usa Chromium e não usa Puppeteer.

## Variáveis obrigatórias no Railway

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
ADMIN_USER=admin
ADMIN_PASSWORD=sua_senha_forte
SESSION_SECRET=uma_chave_grande_aleatoria
BASE_URL=https://seu-app.up.railway.app
NODE_ENV=production
ENABLE_WHATSAPP=true
WA_SESSION_ID=paranapop-empregos
WA_START_ON_BOOT=false
```

Remova `PORT`, `WHATSAPP_ENGINE`, `CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH` e variáveis antigas de OpenWA.

## Logs esperados

```text
ParanáPOP Empregos rodando na porta ...
VERSAO DO PROJETO: 1.0.4 BAILEYS PURO SEM OPENWA 502 FIX
Motor WhatsApp configurado: baileys
WhatsApp aguardando início manual em /admin/qr.
```

## Healthcheck

O endpoint `/saude` responde antes de operações pesadas de banco/WhatsApp para evitar erro 502 durante startup no Railway.
