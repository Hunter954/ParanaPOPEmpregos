CREATE TABLE IF NOT EXISTS whatsapp_auth (
  session_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, key)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_auth_updated ON whatsapp_auth(updated_at DESC);

-- JIDs @lid são IDs privados do WhatsApp/Baileys, não telefones reais.
-- Limpa telefones técnicos salvos antes desta correção e qualquer telefone inválido.
UPDATE users
SET phone = NULL, updated_at = NOW()
WHERE phone IS NOT NULL
  AND (
    whatsapp_jid ILIKE '%@lid'
    OR phone !~ '^[0-9]{8,15}$'
    OR phone ~ '^([0-9])\1+$'
  );
