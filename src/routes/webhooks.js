const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.post('/mercadopago', async (req, res, next) => {
  try {
    // Estrutura reservada para futura integração real com Mercado Pago.
    // Quando ativar, valide assinatura, consulte o pagamento no Mercado Pago
    // e libere o plano do usuário conforme metadata.user_id / metadata.purpose.
    await query(
      `INSERT INTO payments (provider, provider_payment_id, amount_cents, status, purpose, metadata)
       VALUES ('mercadopago', $1, 0, 'received_webhook', 'pending_integration', $2)`,
      [req.body?.id || req.body?.data?.id || null, req.body || {}]
    );
    res.json({ ok: true, message: 'Webhook recebido. Integração Mercado Pago ainda pendente.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
