# ParanáPOP Empregos Bot

Versão 1.0.6: Baileys puro, sem OpenWA, sem Chromium e com inicialização automática do WhatsApp em segundo plano.

## Variáveis mínimas no Railway

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

Não precisa de OpenWA, Puppeteer, Chrome ou WHATSAPP_ENGINE.

## Teste

1. Acesse `/healthz`. Deve responder `ok`.
2. Acesse `/admin/qr`.
3. Escaneie o QR se aparecer.
4. Espere aparecer conectado.
5. Envie `olá` para o número.

Se não responder, olhe `/admin/qr`: agora a tela mostra a última mensagem recebida e a última resposta enviada.


## Correção 1.0.7

Esta versão corrige resposta para contatos que chegam como `@lid` no Baileys. O bot agora responde usando exatamente o JID recebido pelo WhatsApp, sem converter para `@s.whatsapp.net`. A tela `/admin/qr` também mostra o texto da última resposta e erro de envio, se acontecer.
