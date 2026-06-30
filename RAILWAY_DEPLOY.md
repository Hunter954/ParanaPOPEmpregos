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
WA_START_ON_BOOT=false
WA_DEBUG_WAIT_TIMEOUT_MS=120000
WA_BROWSER_TIMEOUT_MS=120000
WA_PROTOCOL_TIMEOUT_MS=120000
WA_MAX_LAUNCH_ATTEMPTS=2
WA_RETRY_CLEAN_SESSION=true
CHROME_PATH=/usr/bin/chromium
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

## 3. Como gerar o QR Code

Com `WA_START_ON_BOOT=false`, o deploy sobe primeiro e o OpenWA só inicia quando você mandar pelo painel. Isso evita que o Railway fique preso no Chromium/WhatsApp Web durante o deploy.

1. Faça **Redeploy** do app.
2. Acesse `https://SEU-DOMINIO.up.railway.app/admin`.
3. Entre com `ADMIN_USER` e `ADMIN_PASSWORD`.
4. Vá em **QR Code**.
5. Clique em **Gerar/Iniciar**.
6. Se aparecer `Waiting failed: 30000ms exceeded`, clique em **Limpar sessão e tentar de novo**.

## 4. Sobre o erro `Waiting failed: 30000ms exceeded`

Esse erro vem do Puppeteer/OpenWA esperando o WhatsApp Web liberar os objetos internos usados pela biblioteca. O projeto agora:

- não inicia o OpenWA automaticamente no deploy;
- não trava o botão do painel enquanto o Chromium abre;
- aumenta o timeout interno do OpenWA para 120 segundos via patch pós-instalação;
- limpa a sessão local e tenta novamente uma vez;
- mantém o painel online mesmo se o WhatsApp Web falhar.

Depois que o QR for lido, mantenha o celular conectado por alguns minutos para salvar a sessão multi-device.
