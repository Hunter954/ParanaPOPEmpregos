# Deploy Railway - ParanáPOP Empregos

Esta versão usa Baileys puro. Não usa OpenWA, Chromium ou Puppeteer.

## Variáveis necessárias

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
ADMIN_USER=admin
ADMIN_PASSWORD=sua_senha
SESSION_SECRET=uma_chave_grande_aleatoria
BASE_URL=https://seu-app.up.railway.app
NODE_ENV=production
ENABLE_WHATSAPP=true
WA_SESSION_ID=paranapop-empregos
```

Apague, se existirem:

```env
PORT
WHATSAPP_ENGINE
WA_ENABLE_OPENWA
CHROME_PATH
PUPPETEER_EXECUTABLE_PATH
WA_BROWSER_TIMEOUT_MS
WA_DEBUG_WAIT_TIMEOUT_MS
WA_PROTOCOL_TIMEOUT_MS
WA_MAX_LAUNCH_ATTEMPTS
WA_RETRY_CLEAN_SESSION
WA_START_ON_BOOT
```

## Como validar

- `/healthz` precisa responder `ok`.
- `/saude` mostra status do WhatsApp e banco.
- `/admin/qr` mostra QR, conectado, última mensagem recebida e última resposta enviada.

O WhatsApp inicia automaticamente alguns segundos depois que o servidor sobe.


## Correção 1.0.7

Esta versão corrige resposta para contatos que chegam como `@lid` no Baileys. O bot agora responde usando exatamente o JID recebido pelo WhatsApp, sem converter para `@s.whatsapp.net`. A tela `/admin/qr` também mostra o texto da última resposta e erro de envio, se acontecer.
