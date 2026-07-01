# ParanáPOP Empregos Bot

Versão `1.0.5`. Projeto com painel administrativo, PostgreSQL e WhatsApp via **Baileys puro**.

Esta versão não usa OpenWA, Chromium nem Puppeteer.

## Rotas úteis

- `/healthz` — rota mínima para Railway.
- `/saude` — diagnóstico completo do app.
- `/admin` — painel administrativo.
- `/admin/qr` — iniciar WhatsApp e ler QR Code.

## Variáveis mínimas

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
ADMIN_USER=admin
ADMIN_PASSWORD=troque_essa_senha
SESSION_SECRET=uma_chave_grande_aleatoria
BASE_URL=https://seu-app.up.railway.app
NODE_ENV=production
ENABLE_WHATSAPP=true
WA_SESSION_ID=paranapop-empregos
WA_START_ON_BOOT=false
```

Não configure `PORT` manualmente no Railway. Mesmo assim, esta versão escuta também nas portas `3000` e `8080` para reduzir risco de 502 quando sobram variáveis antigas.
