const { Router } = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const supabase = require('../database');
const billing = require('../services/billing');
const evolution = require('../services/zapi');
const config = require('../config');
const { logger } = require('../middleware/logger');
const { assinarToken, exigirAuth } = require('../middleware/auth');
const { registrarAuditoria } = require('../services/audit');
const { validarCpf, validarWhatsapp } = require('../services/validacao');

const router = Router();

// ============================================
// AUTENTICACAO
// ============================================

// Rate limit: 5 tentativas por minuto por IP.
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde 1 minuto.' },
});

function findUser(usuario) {
  return config.security.users.find((u) => u.usuario === usuario);
}

router.post('/login', loginLimiter, async (req, res) => {
  const { usuario, senha } = req.body || {};
  if (!usuario || !senha) {
    return res.status(400).json({ error: 'Informe usuario e senha' });
  }

  const user = findUser(usuario);
  if (!user) {
    logger.warn({ usuario, ip: req.ip }, 'Tentativa de login com usuario inexistente');
    return res.status(401).json({ error: 'Usuario ou senha invalidos' });
  }

  const ok = await bcrypt.compare(senha, user.senha_hash || '');
  if (!ok) {
    logger.warn({ usuario, ip: req.ip }, 'Tentativa de login com senha invalida');
    return res.status(401).json({ error: 'Usuario ou senha invalidos' });
  }

  const token = assinarToken({ usuario: user.usuario, nome: user.nome });
  registrarAuditoria({
    usuario: user.usuario,
    acao: 'login',
    detalhes: { ip: req.ip, userAgent: req.headers['user-agent'] },
  }).catch(() => {});

  logger.info({ usuario: user.usuario }, 'Login bem-sucedido');
  res.json({ token, nome: user.nome, usuario: user.usuario });
});

router.get('/auth/check', exigirAuth, (req, res) => {
  res.json({ usuario: req.usuario.usuario, nome: req.usuario.nome });
});

// ============================================
// HEALTH CHECK (publico)
// ============================================
router.get('/health', async (req, res) => {
  const result = { sistema: 'online', timestamp: new Date().toISOString() };
  try {
    const { error } = await supabase.from('clientes').select('id').limit(1);
    result.supabase = error ? 'erro' : 'ok';
  } catch {
    result.supabase = 'erro';
  }
  try {
    const wa = await evolution.verificarConexao();
    result.whatsapp = wa?.conectado ? 'ok' : 'desconectado';
  } catch {
    result.whatsapp = 'erro';
  }
  const statusHttp = result.supabase === 'ok' ? 200 : 503;
  res.status(statusHttp).json(result);
});

// ============================================
// A PARTIR DAQUI, TODAS AS ROTAS EXIGEM AUTH
// ============================================
router.use(exigirAuth);

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
  if (!validarWhatsapp(whatsapp)) {
    return res.status(400).json({ error: 'WhatsApp deve ter DDD + numero (ex: 5548999998888)' });
  }
  if (cpf && !validarCpf(cpf)) {
    return res.status(400).json({ error: 'CPF invalido' });
  }

  // Verificar se já existe um cliente inativo com esse WhatsApp e reativar
  const { data: existente } = await supabase
    .from('clientes')
    .select('id, ativo')
    .eq('whatsapp', whatsapp)
    .single();

  if (existente && !existente.ativo) {
    const { data, error } = await supabase
      .from('clientes')
      .update({ nome, whatsapp, cpf, email, observacoes, ativo: true })
      .eq('id', existente.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
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

router.delete('/clientes/:id', async (req, res) => {
  // Desativar cliente (soft delete)
  const { data, error } = await supabase
    .from('clientes')
    .update({ ativo: false })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Cliente removido', data });
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

router.post('/acoes/cobrar-cliente', async (req, res) => {
  const { cliente_id } = req.body;
  if (!cliente_id) {
    return res.status(400).json({ error: 'cliente_id é obrigatório' });
  }
  try {
    const resultado = await billing.cobrarClienteImediato(cliente_id);
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
// TEMPLATES DE MENSAGEM
// ============================================

router.get('/templates', async (req, res) => {
  const { data, error } = await supabase
    .from('templates_mensagem')
    .select('*')
    .eq('ativo', true)
    .order('tipo');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/templates/:tipo', async (req, res) => {
  const { conteudo } = req.body;
  if (!conteudo) return res.status(400).json({ error: 'Conteúdo é obrigatório' });

  const { data, error } = await supabase
    .from('templates_mensagem')
    .update({ conteudo, updated_at: new Date().toISOString() })
    .eq('tipo', req.params.tipo)
    .eq('ativo', true)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ============================================
// ÁUDIOS
// ============================================

router.get('/audios', async (req, res) => {
  const { data, error } = await supabase
    .from('audios')
    .select('*')
    .order('tipo');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/audios', async (req, res) => {
  const { nome, tipo, url } = req.body;
  if (!tipo || !url) return res.status(400).json({ error: 'Tipo e URL são obrigatórios' });

  // Verificar se já existe um áudio desse tipo
  const { data: existente } = await supabase
    .from('audios')
    .select('id')
    .eq('tipo', tipo)
    .limit(1);

  if (existente?.length) {
    // Atualizar existente
    const { data, error } = await supabase
      .from('audios')
      .update({ nome: nome || tipo, url, ativo: true })
      .eq('tipo', tipo)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  }

  // Criar novo
  const { data, error } = await supabase
    .from('audios')
    .insert({ nome: nome || tipo, tipo, url, ativo: true })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// ============================================
// UPLOAD DE AUDIO (Supabase Storage)
// ============================================

router.post('/upload-audio', async (req, res) => {
  try {
    const { tipo, nome, base64, filename } = req.body;

    // Validar campos obrigatórios
    if (!tipo || !base64 || !filename) {
      return res.status(400).json({ error: 'Campos obrigatórios: tipo, base64, filename' });
    }

    // Mapear tipo do frontend para o tipo do banco
    const tipoMap = {
      cobranca_1: 'bom_dia',
      cobranca_2: 'preocupacao',
      cobranca_3: 'urgencia',
      confirmacao: 'reforco_positivo',
    };
    const tipoDB = tipoMap[tipo];
    if (!tipoDB) {
      return res.status(400).json({ error: 'Tipo inválido. Use: ' + Object.keys(tipoMap).join(', ') });
    }

    // Validar extensão
    const ext = filename.split('.').pop().toLowerCase();
    const extValidas = ['ogg', 'mp3', 'wav', 'm4a', 'webm', 'oga'];
    if (!extValidas.includes(ext)) {
      return res.status(400).json({ error: 'Formato inválido. Aceitos: ' + extValidas.join(', ') });
    }

    // Extrair dados base64 (remover prefixo data:audio/xxx;base64,)
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    const buffer = Buffer.from(base64Data, 'base64');

    // Validar tamanho (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (buffer.length > maxSize) {
      return res.status(400).json({ error: 'Arquivo muito grande. Máximo: 5MB' });
    }

    // Detectar content type
    const mimeTypes = {
      ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav',
      m4a: 'audio/mp4', webm: 'audio/webm', oga: 'audio/ogg'
    };
    const contentType = mimeTypes[ext] || 'audio/ogg';

    // Garantir que o bucket existe
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets && buckets.some(b => b.name === 'audios');
    if (!bucketExists) {
      const { error: bucketErr } = await supabase.storage.createBucket('audios', {
        public: true,
        fileSizeLimit: maxSize,
        allowedMimeTypes: ['audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/webm']
      });
      if (bucketErr && !bucketErr.message.includes('already exists')) {
        console.error('[Upload] Erro ao criar bucket:', bucketErr);
        return res.status(500).json({ error: 'Erro ao criar bucket de storage' });
      }
    }

    // Path no storage: {tipo}/{timestamp}_{filename}
    const timestamp = Date.now();
    const storagePath = tipo + '/' + timestamp + '_' + filename;

    // Upload para Supabase Storage
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('audios')
      .upload(storagePath, buffer, {
        contentType: contentType,
        upsert: true
      });

    if (uploadErr) {
      console.error('[Upload] Erro ao enviar arquivo:', uploadErr);
      return res.status(500).json({ error: 'Erro ao enviar arquivo: ' + uploadErr.message });
    }

    // Obter URL pública
    const { data: urlData } = supabase.storage
      .from('audios')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Inserir novo áudio (permite múltiplos por tipo para rotação)
    const { data: audioRecord, error: audioErr } = await supabase
      .from('audios')
      .insert({ nome: nome || tipoDB, tipo: tipoDB, url: publicUrl, ativo: true })
      .select()
      .single();
    if (audioErr) return res.status(400).json({ error: audioErr.message });

    console.log('[Upload] Audio ' + tipoDB + ' salvo: ' + publicUrl);
    res.json({ url: publicUrl, tipo: tipo, nome: nome || tipoDB });

  } catch (err) {
    console.error('[Upload] Erro geral:', err);
    res.status(500).json({ error: 'Erro interno ao processar upload' });
  }
});

// ============================================
// HORÁRIOS DE COBRANÇA
// ============================================

router.get('/horarios', (req, res) => {
  const config = require('../config');
  res.json({
    horarios: config.cobranca.horarios,
  });
});

router.put('/horarios', async (req, res) => {
  const { horarios } = req.body;
  if (!horarios || !Array.isArray(horarios) || horarios.length !== 4) {
    return res.status(400).json({ error: 'Envie um array com 4 horários' });
  }

  // Validar formato HH:MM
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  for (const h of horarios) {
    if (!regex.test(h)) {
      return res.status(400).json({ error: `Horário inválido: ${h}. Use formato HH:MM` });
    }
  }

  try {
    // Atualizar variáveis no Render via API
    const renderApiKey = process.env.RENDER_API_KEY;
    const renderServiceId = process.env.RENDER_SERVICE_ID;

    if (renderApiKey && renderServiceId) {
      // Buscar env vars atuais
      const getRes = await fetch(`https://api.render.com/v1/services/${renderServiceId}/env-vars`, {
        headers: { 'Authorization': `Bearer ${renderApiKey}` },
      });
      const currentVars = await getRes.json();

      // Montar lista atualizada
      const envVars = currentVars.map(v => ({ key: v.envVar.key, value: v.envVar.value }));
      for (let i = 0; i < 4; i++) {
        const key = `COBRANCA_HORARIO_${i + 1}`;
        const idx = envVars.findIndex(v => v.key === key);
        if (idx >= 0) envVars[idx].value = horarios[i];
        else envVars.push({ key, value: horarios[i] });
      }

      // Atualizar no Render
      await fetch(`https://api.render.com/v1/services/${renderServiceId}/env-vars`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${renderApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(envVars),
      });

      // Trigger redeploy
      await fetch(`https://api.render.com/v1/services/${renderServiceId}/deploys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${renderApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      res.json({ success: true, horarios, message: 'Horários atualizados. O servidor vai reiniciar em ~30 segundos.' });
    } else {
      res.json({ success: true, horarios, message: 'Horários salvos (reinicie o servidor manualmente para aplicar).' });
    }
  } catch (err) {
    console.error('[Horários] Erro:', err);
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

// ============================================
// KILL SWITCH GLOBAL (pausar sistema inteiro)
// ============================================
router.get('/sistema/estado', async (req, res) => {
  const { estaPausado } = require('../services/sistema');
  const estado = await estaPausado();
  res.json(estado);
});

router.put('/sistema/pausar', async (req, res) => {
  const { pausar } = require('../services/sistema');
  const { motivo } = req.body || {};
  await pausar(motivo, req.usuario.usuario);
  registrarAuditoria({
    usuario: req.usuario.usuario,
    acao: 'sistema_pausar',
    detalhes: { motivo },
  }).catch(() => {});
  res.json({ ok: true, pausado: true });
});

router.put('/sistema/retomar', async (req, res) => {
  const { retomar } = require('../services/sistema');
  await retomar(req.usuario.usuario);
  registrarAuditoria({
    usuario: req.usuario.usuario,
    acao: 'sistema_retomar',
  }).catch(() => {});
  res.json({ ok: true, pausado: false });
});

// ============================================
// BLOCKLIST: pausar / retomar cobranca de cliente
// ============================================
router.put('/clientes/:id/pausar-cobranca', async (req, res) => {
  const { motivo } = req.body || {};
  const { data, error } = await supabase
    .from('clientes')
    .update({ cobranca_pausada: true, motivo_pausa: motivo || null })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  registrarAuditoria({
    usuario: req.usuario.usuario,
    acao: 'pausar_cobranca',
    entidade: 'cliente',
    entidade_id: req.params.id,
    detalhes: { motivo },
  }).catch(() => {});
  res.json(data);
});

router.put('/clientes/:id/retomar-cobranca', async (req, res) => {
  const { data, error } = await supabase
    .from('clientes')
    .update({ cobranca_pausada: false, motivo_pausa: null })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  registrarAuditoria({
    usuario: req.usuario.usuario,
    acao: 'retomar_cobranca',
    entidade: 'cliente',
    entidade_id: req.params.id,
  }).catch(() => {});
  res.json(data);
});

// ============================================
// AUDIT LOG (leitura)
// ============================================
router.get('/audit-log', async (req, res) => {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ============================================
// BACKUP MANUAL
// ============================================
router.post('/acoes/backup', async (req, res) => {
  try {
    const { rodarBackupCompleto } = require('../services/backup');
    const resultado = await rodarBackupCompleto(30);
    registrarAuditoria({
      usuario: req.usuario.usuario,
      acao: 'backup_manual',
      detalhes: {
        destino: resultado.destino,
        linhas: resultado.metadata.total_linhas,
      },
    }).catch(() => {});
    res.json({
      ok: true,
      pasta: resultado.destino,
      linhas: resultado.metadata.total_linhas,
      tabelas: Object.keys(resultado.metadata.tabelas).length,
      duracao_ms: resultado.duracao_ms,
    });
  } catch (err) {
    logger.error({ err }, 'Erro no backup manual');
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// EXPORTACAO CSV
// ============================================
function toCsvRow(values) {
  return values
    .map((v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    })
    .join(';');
}

router.get('/export/parcelas', async (req, res) => {
  const { inicio, fim } = req.query;
  let q = supabase
    .from('parcelas')
    .select(`
      id, numero, valor, data_vencimento, data_pagamento, status,
      emprestimos!inner(cliente_id, total_parcelas,
        clientes!inner(nome, whatsapp, cpf)
      )
    `)
    .order('data_vencimento');
  if (inicio) q = q.gte('data_vencimento', inicio);
  if (fim) q = q.lte('data_vencimento', fim);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const linhas = [
    toCsvRow([
      'cliente',
      'whatsapp',
      'cpf',
      'parcela',
      'valor',
      'vencimento',
      'pagamento',
      'status',
    ]),
  ];
  for (const p of data || []) {
    const cli = p.emprestimos?.clientes || {};
    linhas.push(
      toCsvRow([
        cli.nome,
        cli.whatsapp,
        cli.cpf,
        `${p.numero}/${p.emprestimos?.total_parcelas ?? ''}`,
        Number(p.valor).toFixed(2).replace('.', ','),
        p.data_vencimento,
        p.data_pagamento || '',
        p.status,
      ])
    );
  }

  const csv = '\uFEFF' + linhas.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="parcelas_${inicio || 'tudo'}_${fim || 'tudo'}.csv"`
  );
  res.send(csv);
});

module.exports = router;
