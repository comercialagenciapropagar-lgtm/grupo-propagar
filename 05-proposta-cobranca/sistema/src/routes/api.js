const { Router } = require('express');
const supabase = require('../database');
const billing = require('../services/billing');
const evolution = require('../services/evolution');

const router = Router();

// ============================================
// DASHBOARD
// ============================================

router.get('/dashboard', async (req, res) => {
  try {
    const data = await billing.getDashboardData();
    res.json(data);
  } catch (err) {
    console.error('[API] Erro dashboard:', err);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

// ============================================
// CLIENTES - CRUD
// ============================================

router.get('/clientes', async (req, res) => {
  const { data, error } = await supabase
    .from('clientes')
    .select('*, emprestimos(id, valor_total, valor_parcela, total_parcelas, parcelas_pagas, status)')
    .eq('ativo', true)
    .order('nome');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/clientes/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('clientes')
    .select(`
      *,
      emprestimos(
        *,
        parcelas(*)
      )
    `)
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(data);
});

router.post('/clientes', async (req, res) => {
  const { nome, whatsapp, cpf, email, observacoes } = req.body;

  if (!nome || !whatsapp) {
    return res.status(400).json({ error: 'Nome e WhatsApp são obrigatórios' });
  }

  const { data, error } = await supabase
    .from('clientes')
    .insert({ nome, whatsapp, cpf, email, observacoes })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/clientes/:id', async (req, res) => {
  const { nome, whatsapp, cpf, email, observacoes, ativo } = req.body;

  const { data, error } = await supabase
    .from('clientes')
    .update({ nome, whatsapp, cpf, email, observacoes, ativo })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ============================================
// EMPRÉSTIMOS
// ============================================

router.post('/emprestimos', async (req, res) => {
  const { cliente_id, valor_total, valor_parcela, total_parcelas, data_inicio } = req.body;

  if (!cliente_id || !valor_total || !valor_parcela || !total_parcelas || !data_inicio) {
    return res.status(400).json({ error: 'Campos obrigatórios: cliente_id, valor_total, valor_parcela, total_parcelas, data_inicio' });
  }

  // Criar empréstimo
  const { data: emprestimo, error: errEmp } = await supabase
    .from('emprestimos')
    .insert({ cliente_id, valor_total, valor_parcela, total_parcelas, data_inicio })
    .select()
    .single();

  if (errEmp) return res.status(400).json({ error: errEmp.message });

  // Gerar parcelas automaticamente (dias úteis a partir de data_inicio)
  const parcelas = [];
  let dataAtual = new Date(data_inicio + 'T12:00:00');

  for (let i = 1; i <= total_parcelas; i++) {
    // Pular fins de semana
    while (dataAtual.getDay() === 0 || dataAtual.getDay() === 6) {
      dataAtual.setDate(dataAtual.getDate() + 1);
    }

    parcelas.push({
      emprestimo_id: emprestimo.id,
      numero: i,
      valor: valor_parcela,
      data_vencimento: dataAtual.toISOString().split('T')[0],
    });

    dataAtual.setDate(dataAtual.getDate() + 1);
  }

  const { error: errParcelas } = await supabase.from('parcelas').insert(parcelas);
  if (errParcelas) {
    return res.status(400).json({ error: errParcelas.message });
  }

  res.status(201).json({ emprestimo, parcelas_criadas: parcelas.length });
});

router.get('/emprestimos/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('emprestimos')
    .select('*, clientes(*), parcelas(*)')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Empréstimo não encontrado' });
  res.json(data);
});

// ============================================
// FILA HUMANA
// ============================================

router.get('/fila-humana', async (req, res) => {
  const { data, error } = await supabase
    .from('fila_humana')
    .select(`
      *,
      clientes(nome, whatsapp),
      parcelas(numero, valor, data_vencimento,
        emprestimos(total_parcelas, parcelas_pagas)
      )
    `)
    .in('status', ['pendente', 'em_atendimento'])
    .order('prioridade', { ascending: false })
    .order('created_at');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/fila-humana/:id/atender', async (req, res) => {
  const { atendido_por } = req.body;

  const { data, error } = await supabase
    .from('fila_humana')
    .update({ status: 'em_atendimento', atendido_por })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/fila-humana/:id/resolver', async (req, res) => {
  const { observacoes } = req.body;

  const { data, error } = await supabase
    .from('fila_humana')
    .update({
      status: 'resolvido',
      observacoes,
      resolvido_em: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ============================================
// CLIENTES BONS (UPSELL)
// ============================================

router.get('/clientes-bons', async (req, res) => {
  try {
    const dashboard = await billing.getDashboardData();
    res.json(dashboard.clientes_bons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// AÇÕES MANUAIS
// ============================================

router.post('/acoes/gerar-cobrancas', async (req, res) => {
  try {
    const resultado = await billing.gerarCobrancasDoDia();
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/acoes/disparar-mensagens', async (req, res) => {
  const { tipo } = req.body;
  const tiposValidos = ['cobranca_1', 'cobranca_2', 'cobranca_3', 'cobranca_4'];

  if (!tiposValidos.includes(tipo)) {
    return res.status(400).json({ error: `Tipo inválido. Use: ${tiposValidos.join(', ')}` });
  }

  try {
    const resultado = await billing.dispararMensagens(tipo);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/acoes/atualizar-atrasados', async (req, res) => {
  try {
    const count = await billing.atualizarAtrasados();
    res.json({ atrasados_atualizados: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// MÉTRICAS FINANCEIRAS
// ============================================

router.get('/metricas', async (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const mesAtual = hoje.substring(0, 7); // "2026-03"
    const primeiroDiaMes = mesAtual + '-01';
    const diasNoMes = new Date(parseInt(mesAtual.split('-')[0]), parseInt(mesAtual.split('-')[1]), 0).getDate();

    // Parcelas do mês
    const { data: parcelasMes } = await supabase
      .from('parcelas')
      .select('id, valor, data_vencimento, status, data_pagamento')
      .gte('data_vencimento', primeiroDiaMes)
      .lte('data_vencimento', mesAtual + '-31')
      .order('data_vencimento');

    // Recebido hoje
    const parcelasHoje = parcelasMes?.filter(p => p.data_vencimento === hoje) || [];
    const recebidoHoje = parcelasHoje
      .filter(p => p.status === 'pago')
      .reduce((s, p) => s + parseFloat(p.valor), 0);
    const esperadoHoje = parcelasHoje
      .reduce((s, p) => s + parseFloat(p.valor), 0);

    // Recebido no mês
    const recebidoMes = (parcelasMes || [])
      .filter(p => p.status === 'pago')
      .reduce((s, p) => s + parseFloat(p.valor), 0);
    const esperadoMes = (parcelasMes || [])
      .reduce((s, p) => s + parseFloat(p.valor), 0);

    // Dias úteis passados no mês (com parcelas)
    const diasComParcela = [...new Set((parcelasMes || [])
      .filter(p => p.data_vencimento <= hoje)
      .map(p => p.data_vencimento))];
    const diasPassados = diasComParcela.length || 1;

    // Média diária recebida
    const mediaDiaria = recebidoMes / diasPassados;

    // MRR (receita mensal recorrente) = soma de todas as parcelas de empréstimos ativos
    const { data: empAtivos } = await supabase
      .from('emprestimos')
      .select('valor_parcela, total_parcelas, parcelas_pagas')
      .eq('status', 'ativo');

    // MRR = dias úteis no mês * média de valor/dia dos empréstimos ativos
    const diasUteisMes = (parcelasMes || [])
      .map(p => p.data_vencimento)
      .filter((v, i, a) => a.indexOf(v) === i).length || diasNoMes;

    const mrr = esperadoMes;

    // Projeção do mês (baseado na média diária)
    const diasRestantes = [...new Set((parcelasMes || [])
      .filter(p => p.data_vencimento > hoje)
      .map(p => p.data_vencimento))].length;
    const projecaoMes = recebidoMes + (mediaDiaria * diasRestantes);

    // Gráfico: recebido por dia no mês
    const recebidoPorDia = {};
    for (const p of parcelasMes || []) {
      const dia = p.data_vencimento;
      if (!recebidoPorDia[dia]) recebidoPorDia[dia] = { recebido: 0, esperado: 0 };
      recebidoPorDia[dia].esperado += parseFloat(p.valor);
      if (p.status === 'pago') recebidoPorDia[dia].recebido += parseFloat(p.valor);
    }

    const grafico_diario = Object.entries(recebidoPorDia)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, v]) => ({ dia, recebido: v.recebido, esperado: v.esperado }));

    // Taxa de inadimplência
    const totalVencidas = (parcelasMes || []).filter(p => p.data_vencimento < hoje).length;
    const totalPagas = (parcelasMes || []).filter(p => p.status === 'pago').length;
    const taxaAdimplencia = totalVencidas > 0 ? Math.round((totalPagas / totalVencidas) * 100) : 100;

    res.json({
      hoje: { recebido: recebidoHoje, esperado: esperadoHoje },
      mes: { recebido: recebidoMes, esperado: esperadoMes },
      media_diaria: Math.round(mediaDiaria * 100) / 100,
      mrr: Math.round(mrr * 100) / 100,
      projecao_mes: Math.round(projecaoMes * 100) / 100,
      taxa_adimplencia: taxaAdimplencia,
      grafico_diario,
      dias_passados: diasPassados,
      dias_restantes: diasRestantes,
    });
  } catch (err) {
    console.error('[API] Erro métricas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// STATUS DO SISTEMA
// ============================================

router.get('/status', async (req, res) => {
  const whatsapp = await evolution.verificarConexao();

  res.json({
    sistema: 'online',
    whatsapp,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
