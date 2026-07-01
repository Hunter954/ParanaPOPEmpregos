# Deploy Railway — ParanáPOP Empregos

Esta versão é **Baileys puro**, sem OpenWA, Chromium ou Puppeteer.

## Variáveis mínimas

No serviço do APP, deixe somente:

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

Pode apagar `PORT`, `WHATSAPP_ENGINE`, `WA_ENABLE_OPENWA`, `CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH` e todas as variáveis antigas de OpenWA.

## Como conferir

Depois do deploy, abra:

```text
/healthz
/saude
```

O log correto precisa mostrar:

```text
VERSAO DO PROJETO: 1.0.5 BAILEYS PURO SEM OPENWA PORTFIX
Motor WhatsApp configurado: baileys
WhatsApp aguardando início manual em /admin/qr.
```

Se o domínio principal ainda der 502, teste `/healthz`. Se `/healthz` abrir e `/` não, o problema é banco/sessão; se `/healthz` também der 502, o Railway ainda está rodando build antigo ou a porta do serviço está travada por variável antiga.
