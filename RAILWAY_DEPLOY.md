# Deploy no Railway — checklist rápido

## 1. Banco PostgreSQL

Se aparecer `DATABASE_URL não configurada` ou `ECONNREFUSED 127.0.0.1:5432`, o app está sem a URL do PostgreSQL.

1. Abra seu projeto no Railway.
2. Clique em **+ New** / **Create**.
3. Adicione um banco **PostgreSQL**.
4. Clique no serviço do app, não no banco.
5. Abra **Variables**.
6. Adicione a referência:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Se o serviço do banco não se chamar `Postgres`, use o nome que aparece no canvas. Exemplo:

```env
DATABASE_URL=${{PostgreSQL.DATABASE_URL}}
```

## 2. Variáveis mínimas do app

```env
NODE_ENV=production
PORT=3000
BASE_URL=https://SEU-DOMINIO.up.railway.app
SESSION_SECRET=troque-por-uma-chave-grande-e-segura
ADMIN_USER=admin
ADMIN_PASSWORD=troque-esta-senha
RUN_MIGRATIONS=true
ENABLE_WHATSAPP=true
WA_SESSION_ID=paranapop-empregos
WHATSAPP_ENGINE=baileys
WA_START_ON_BOOT=false
WA_AUTO_RECONNECT=true
WA_RECONNECT_DELAY_MS=5000
WA_MAX_LAUNCH_ATTEMPTS=2
WA_RETRY_CLEAN_SESSION=true
```

## 3. Como gerar o QR Code

Com `WA_START_ON_BOOT=false`, o deploy sobe primeiro e o WhatsApp só inicia quando você mandar pelo painel.

1. Faça **Redeploy** do app.
2. Acesse `https://SEU-DOMINIO.up.railway.app/admin`.
3. Entre com `ADMIN_USER` e `ADMIN_PASSWORD`.
4. Vá em **QR Code**.
5. Confirme que o motor atual está como **Baileys**.
6. Clique em **Gerar/Iniciar**.
7. Leia o QR com o WhatsApp comercial.
8. Envie uma mensagem para o número e teste o fluxo.

## 4. Sobre o erro `Waiting failed: 30000ms exceeded`

Esse erro vem do Puppeteer/OpenWA esperando o WhatsApp Web liberar objetos internos da página. Nesta versão, o padrão foi alterado para `WHATSAPP_ENGINE=baileys`, que usa o protocolo WebSocket do WhatsApp Web e não depende de abrir o Chromium para gerar o QR.

Se o log ainda mostrar `OpenWA`, revise as variáveis do serviço do app e deixe:

```env
WHATSAPP_ENGINE=baileys
WA_START_ON_BOOT=false
```

Também remova ou deixe `false` qualquer variável antiga `WA_START_ON_BOOT=true`.

## 5. Se quiser insistir no OpenWA

Use:

```env
WHATSAPP_ENGINE=openwa
CHROME_PATH=/usr/bin/chromium
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WA_DEBUG_WAIT_TIMEOUT_MS=120000
WA_BROWSER_TIMEOUT_MS=120000
WA_PROTOCOL_TIMEOUT_MS=120000
```

O projeto mantém OpenWA, mas o Railway deve usar Baileys se o OpenWA continuar travando no WhatsApp Web atual.
