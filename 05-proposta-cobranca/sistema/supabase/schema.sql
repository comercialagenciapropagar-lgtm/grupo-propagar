-- ============================================
-- Cobrai.app - Schema do Banco de Dados
-- Sistema de Cobranca Inteligente
-- ============================================

-- Extensoes
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. CLIENTES
-- ============================================
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  cpf TEXT,
  email TEXT,
  observacoes TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_clientes_whatsapp ON clientes(whatsapp);
CREATE INDEX idx_clientes_ativo ON clientes(ativo);

-- ============================================
-- 2. EMPRESTIMOS
-- ============================================
CREATE TABLE emprestimos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  valor_total NUMERIC(12,2) NOT NULL,
  valor_parcela NUMERIC(12,2) NOT NULL,
  total_parcelas INTEGER NOT NULL,
  parcelas_pagas INTEGER DEFAULT 0,
  data_inicio DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'quitado', 'inadimplente', 'cancelado')),
  asaas_customer_id TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_emprestimos_cliente ON emprestimos(cliente_id);
CREATE INDEX idx_emprestimos_status ON emprestimos(status);

-- ============================================
-- 3. PARCELAS
-- ============================================
CREATE TABLE parcelas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  emprestimo_id UUID NOT NULL REFERENCES emprestimos(id),
  numero INTEGER NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
  data_pagamento TIMESTAMPTZ,
  asaas_payment_id TEXT,
  asaas_pix_qrcode TEXT,
  asaas_pix_copiaecola TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_parcelas_emprestimo ON parcelas(emprestimo_id);
CREATE INDEX idx_parcelas_vencimento ON parcelas(data_vencimento);
CREATE INDEX idx_parcelas_status ON parcelas(status);
CREATE UNIQUE INDEX idx_parcelas_asaas ON parcelas(asaas_payment_id) WHERE asaas_payment_id IS NOT NULL;

-- ============================================
-- 4. MENSAGENS ENVIADAS (log)
-- ============================================
CREATE TABLE mensagens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parcela_id UUID NOT NULL REFERENCES parcelas(id),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('cobranca_1', 'cobranca_2', 'cobranca_3', 'cobranca_4', 'confirmacao', 'atraso', 'upsell')),
  canal TEXT NOT NULL DEFAULT 'whatsapp',
  conteudo TEXT,
  enviado_em TIMESTAMPTZ DEFAULT now(),
  status_envio TEXT DEFAULT 'enviado' CHECK (status_envio IN ('enviado', 'entregue', 'lido', 'erro')),
  erro TEXT
);

CREATE INDEX idx_mensagens_parcela ON mensagens(parcela_id);
CREATE INDEX idx_mensagens_cliente ON mensagens(cliente_id);
CREATE INDEX idx_mensagens_data ON mensagens(enviado_em);

-- ============================================
-- 5. AUDIOS PRE-GRAVADOS
-- ============================================
CREATE TABLE audios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('bom_dia', 'preocupacao', 'urgencia', 'reforco_positivo', 'atraso')),
  url TEXT NOT NULL,
  duracao_segundos INTEGER,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 6. TEMPLATES DE MENSAGEM
-- ============================================
CREATE TABLE templates_mensagem (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo TEXT NOT NULL CHECK (tipo IN ('cobranca_1', 'cobranca_2', 'cobranca_3', 'cobranca_4', 'confirmacao', 'atraso', 'upsell')),
  conteudo TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7. FILA HUMANA
-- ============================================
CREATE TABLE fila_humana (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  parcela_id UUID REFERENCES parcelas(id),
  motivo TEXT NOT NULL CHECK (motivo IN ('ignorou_mensagens', 'dificuldade_financeira', 'atraso_3dias', 'solicitou_contato')),
  prioridade INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_atendimento', 'resolvido')),
  atendido_por TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolvido_em TIMESTAMPTZ
);

CREATE INDEX idx_fila_humana_status ON fila_humana(status);
CREATE INDEX idx_fila_humana_cliente ON fila_humana(cliente_id);

-- ============================================
-- 8. CONFIGURACOES
-- ============================================
CREATE TABLE configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  descricao TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- DADOS INICIAIS
-- ============================================

-- Templates de mensagem padrão
INSERT INTO templates_mensagem (tipo, conteudo) VALUES
('cobranca_1', 'Bom dia, {{nome}}! Tudo bem? Sua parcela de hoje: *R$ {{valor}}*.\n\nPaga por esse PIX que eu já dou baixa na hora pra você:\n\n📋 *Copia e cola:*\n{{pix_copiaecola}}\n\nQualquer coisa, me chama aqui!'),

('cobranca_2', '{{nome}}, vi que a parcela de hoje ainda tá aberta. Sei que o dia corre! Se puder resolver agora no almoço, fica tudo em dia.\n\nPIX: {{pix_copiaecola}}\n\nQualquer dificuldade, me fala.'),

('cobranca_3', '{{nome}}, a parcela de hoje ainda não caiu aqui. Preciso dar baixa até o fim do dia pra não gerar pendência no seu acordo.\n\nConsegue resolver agora?\nPIX: {{pix_copiaecola}}'),

('cobranca_4', '{{nome}}, seu dia de pagamento tá fechando e a parcela de R$ {{valor}} ainda tá pendente. Amanhã entra como atraso.\n\nSe já pagou e eu não vi, manda o comprovante aqui. Se não conseguiu, me responde que a gente vê uma solução.'),

('confirmacao', '✅ *Recebi, {{nome}}!* Parcela de hoje confirmada pelo banco. Tá tudo em dia!\n\nParcela {{numero}} de {{total}} ✓\nFaltam {{restantes}} parcelas.\n\nAté amanhã! 🤝'),

('atraso', '{{nome}}, suas parcelas estão acumulando e eu preciso resolver isso com você. Você está com {{dias_atraso}} dia(s) de atraso.\n\nMe responde aqui pra gente achar uma saída. Quero te ajudar a ficar em dia.'),

('upsell', '{{nome}}, você é um(a) cliente exemplar — já pagou {{percentual}}% do seu acordo sem atraso. Quero te oferecer uma condição especial pra um novo empréstimo. Posso te chamar 2 minutinhos?');

-- Configurações padrão
INSERT INTO configuracoes (chave, valor, descricao) VALUES
('percentual_upsell', '70', 'Percentual mínimo de parcelas pagas para oferecer novo empréstimo'),
('dias_sem_atraso_upsell', '15', 'Dias sem atraso para qualificar para upsell'),
('max_tentativas_auto', '4', 'Máximo de mensagens automáticas por dia'),
('dias_para_fila_humana', '1', 'Dias de atraso para ir pra fila humana');

-- ============================================
-- VIEWS UTEIS
-- ============================================

-- View: Resumo diario de cobranças
CREATE OR REPLACE VIEW v_resumo_diario AS
SELECT
  p.data_vencimento,
  COUNT(*) AS total_parcelas,
  COUNT(*) FILTER (WHERE p.status = 'pago') AS pagos,
  COUNT(*) FILTER (WHERE p.status = 'pendente') AS pendentes,
  COUNT(*) FILTER (WHERE p.status = 'atrasado') AS atrasados,
  COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'pago'), 0) AS valor_recebido,
  COALESCE(SUM(p.valor), 0) AS valor_esperado
FROM parcelas p
GROUP BY p.data_vencimento
ORDER BY p.data_vencimento DESC;

-- View: Clientes bons (candidatos a upsell)
CREATE OR REPLACE VIEW v_clientes_bons AS
SELECT
  c.id AS cliente_id,
  c.nome,
  c.whatsapp,
  e.id AS emprestimo_id,
  e.valor_total,
  e.valor_parcela,
  e.total_parcelas,
  e.parcelas_pagas,
  ROUND((e.parcelas_pagas::NUMERIC / e.total_parcelas) * 100) AS percentual_pago,
  (SELECT MAX(p2.data_vencimento)
   FROM parcelas p2
   WHERE p2.emprestimo_id = e.id AND p2.status = 'atrasado'
  ) AS ultimo_atraso
FROM clientes c
JOIN emprestimos e ON e.cliente_id = c.id AND e.status = 'ativo'
WHERE
  e.parcelas_pagas >= (e.total_parcelas * 0.7)
  AND NOT EXISTS (
    SELECT 1 FROM parcelas p3
    WHERE p3.emprestimo_id = e.id
      AND p3.status = 'atrasado'
      AND p3.data_vencimento >= CURRENT_DATE - INTERVAL '15 days'
  )
ORDER BY percentual_pago DESC;

-- View: Cobranças de hoje com detalhes
CREATE OR REPLACE VIEW v_cobrancas_hoje AS
SELECT
  p.id AS parcela_id,
  p.numero,
  p.valor,
  p.status,
  p.data_pagamento,
  p.asaas_pix_copiaecola,
  p.asaas_pix_qrcode,
  e.id AS emprestimo_id,
  e.total_parcelas,
  e.parcelas_pagas,
  e.valor_parcela,
  c.id AS cliente_id,
  c.nome,
  c.whatsapp,
  ROUND((e.parcelas_pagas::NUMERIC / e.total_parcelas) * 100) AS percentual_pago,
  (SELECT COUNT(*) FROM mensagens m
   WHERE m.parcela_id = p.id AND m.enviado_em::DATE = CURRENT_DATE
  ) AS mensagens_hoje,
  (SELECT MAX(m2.tipo) FROM mensagens m2
   WHERE m2.parcela_id = p.id AND m2.enviado_em::DATE = CURRENT_DATE
  ) AS ultima_mensagem,
  CASE
    WHEN p.data_vencimento < CURRENT_DATE AND p.status != 'pago'
    THEN (CURRENT_DATE - p.data_vencimento)
    ELSE 0
  END AS dias_atraso
FROM parcelas p
JOIN emprestimos e ON e.id = p.emprestimo_id
JOIN clientes c ON c.id = e.cliente_id
WHERE p.data_vencimento = CURRENT_DATE
  AND e.status = 'ativo'
  AND c.ativo = true
ORDER BY
  CASE p.status
    WHEN 'atrasado' THEN 1
    WHEN 'pendente' THEN 2
    WHEN 'pago' THEN 3
  END,
  c.nome;

-- View: Fila humana ativa
CREATE OR REPLACE VIEW v_fila_humana_ativa AS
SELECT
  fh.id,
  fh.motivo,
  fh.prioridade,
  fh.status,
  fh.created_at,
  c.nome,
  c.whatsapp,
  p.valor,
  p.numero,
  e.total_parcelas,
  e.parcelas_pagas,
  (CURRENT_DATE - p.data_vencimento) AS dias_atraso
FROM fila_humana fh
JOIN clientes c ON c.id = fh.cliente_id
LEFT JOIN parcelas p ON p.id = fh.parcela_id
LEFT JOIN emprestimos e ON e.id = p.emprestimo_id
WHERE fh.status IN ('pendente', 'em_atendimento')
ORDER BY fh.prioridade DESC, fh.created_at;

-- ============================================
-- FUNCOES
-- ============================================

-- Atualizar parcelas atrasadas automaticamente
CREATE OR REPLACE FUNCTION fn_atualizar_parcelas_atrasadas()
RETURNS void AS $$
BEGIN
  UPDATE parcelas
  SET status = 'atrasado', updated_at = now()
  WHERE status = 'pendente'
    AND data_vencimento < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Atualizar contador de parcelas pagas no emprestimo
CREATE OR REPLACE FUNCTION fn_atualizar_parcelas_pagas()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pago' AND OLD.status != 'pago' THEN
    UPDATE emprestimos
    SET parcelas_pagas = parcelas_pagas + 1, updated_at = now()
    WHERE id = NEW.emprestimo_id;

    -- Verificar se quitou
    UPDATE emprestimos
    SET status = 'quitado', updated_at = now()
    WHERE id = NEW.emprestimo_id
      AND parcelas_pagas >= total_parcelas;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_parcela_paga
  AFTER UPDATE OF status ON parcelas
  FOR EACH ROW
  EXECUTE FUNCTION fn_atualizar_parcelas_pagas();

-- Trigger updated_at automatico
CREATE OR REPLACE FUNCTION fn_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION fn_updated_at();
CREATE TRIGGER trg_emprestimos_updated_at BEFORE UPDATE ON emprestimos FOR EACH ROW EXECUTE FUNCTION fn_updated_at();
CREATE TRIGGER trg_parcelas_updated_at BEFORE UPDATE ON parcelas FOR EACH ROW EXECUTE FUNCTION fn_updated_at();

-- ============================================
-- RLS (Row Level Security) - Opcional
-- ============================================
-- Habilitar se quiser controle de acesso por usuario
-- ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE emprestimos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE parcelas ENABLE ROW LEVEL SECURITY;
