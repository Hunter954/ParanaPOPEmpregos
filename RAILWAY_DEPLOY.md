# Deploy Railway — versão 1.0.4 502 fix

1. Suba este projeto no GitHub.
2. No Railway, conecte o repositório.
3. Adicione PostgreSQL no mesmo projeto.
4. No serviço do APP, configure apenas:

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

5. Remova `PORT` se você criou manualmente. Railway injeta essa variável sozinho.
6. Remova todas variáveis antigas de OpenWA/Chromium/Puppeteer.
7. Faça Redeploy.

Acesse `/saude`. Se responder JSON, o servidor está online. Depois acesse `/admin` e vá em QR Code.
