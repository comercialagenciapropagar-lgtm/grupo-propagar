-- ============================================
-- Cobrai.app - Migration de Seguranca e Funcionalidades
-- Rodar no Supabase SQL Editor.
-- Idempotente: pode rodar varias vezes sem erro.
-- ============================================

-- 1) Blocklist por cliente (pausar cobranca)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS cobranca_pausada BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_pausa TEXT;

CREATE INDEX IF NOT EXISTS idx_clientes_cobranca_pausada
  ON clientes(cobranca_pausada)
  WHERE cobranca_pausada = true;

-- 2) Audit log: registra acoes criticas (login, baixa manual, pausa cobranca)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario TEXT NOT NULL,
  acao TEXT NOT NULL,
  entidade TEXT,
  entidade_id TEXT,
  detalhes JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_usuario ON audit_log(usuario);
CREATE INDEX IF NOT EXISTS idx_audit_log_acao ON audit_log(acao);

-- 3) Feriados nacionais (para o scheduler nao disparar cobranca)
CREATE TABLE IF NOT EXISTS feriados (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data DATE NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feriados_data ON feriados(data);

-- Seed: feriados nacionais 2026
INSERT INTO feriados (data, nome) VALUES
  ('2026-01-01', 'Confraternizacao Universal'),
  ('2026-02-16', 'Carnaval'),
  ('2026-02-17', 'Carnaval'),
  ('2026-02-18', 'Quarta-feira de Cinzas'),
  ('2026-04-03', 'Sexta-feira Santa'),
  ('2026-04-21', 'Tiradentes'),
  ('2026-05-01', 'Dia do Trabalho'),
  ('2026-06-04', 'Corpus Christi'),
  ('2026-09-07', 'Independencia do Brasil'),
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamacao da Republica'),
  ('2026-11-20', 'Dia da Consciencia Negra'),
  ('2026-12-25', 'Natal')
ON CONFLICT (data) DO NOTHING;

-- Seed: feriados nacionais 2027
INSERT INTO feriados (data, nome) VALUES
  ('2027-01-01', 'Confraternizacao Universal'),
  ('2027-02-08', 'Carnaval'),
  ('2027-02-09', 'Carnaval'),
  ('2027-02-10', 'Quarta-feira de Cinzas'),
  ('2027-03-26', 'Sexta-feira Santa'),
  ('2027-04-21', 'Tiradentes'),
  ('2027-05-01', 'Dia do Trabalho'),
  ('2027-05-27', 'Corpus Christi'),
  ('2027-09-07', 'Independencia do Brasil'),
  ('2027-10-12', 'Nossa Senhora Aparecida'),
  ('2027-11-02', 'Finados'),
  ('2027-11-15', 'Proclamacao da Republica'),
  ('2027-11-20', 'Dia da Consciencia Negra'),
  ('2027-12-25', 'Natal')
ON CONFLICT (data) DO NOTHING;
