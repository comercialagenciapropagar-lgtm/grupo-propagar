const supabase = require('../database');
const asaas = require('./asaas');
const evolution = require('./zapi');

// ============================================
// GERAR COBRANÇAS DO DIA
// ============================================

async function gerarCobrancasDoDia() {
  const hoje = new Date().toISOString().split('T')[0];
  console.log(`[Billing] Gerando cobranças para ${hoje}...`);

  // Buscar parcelas do dia que ainda não têm cobrança no Asaas
  const { data: parcelas, error } = await supabase
    .from('parcelas')
    .select(`
      id, numero, valor, emprestimo_id,
      emprestimos!inner(id, asaas_customer_id, cliente_id,
        clientes!inner(id, nome, whatsapp, cpf, email)
      )
    `)
    .eq('data_vencimento', hoje)
    .eq('status', 'pendente')
    .is('asaas_payment_id', null);

  if (error) {
    console.error('[Billing] Erro ao buscar parcelas:', error);
    return { sucesso: 0, erros: 0 };
  }

  if (!parcelas?.length) {
    console.log('[Billing] Nenhuma parcela pendente sem cobrança hoje.');
    return { sucesso: 0, erros: 0 };
  }

  let sucesso = 0;
  let erros = 0;

  for (const parcela of parcelas) {
    try {
      const emp = parcela.emprestimos;
      const cliente = emp.clientes;

      // Garantir que o cliente existe no Asaas
      let asaasCustomerId = emp.asaas_customer_id;
      if (!asaasCustomerId) {
        const asaasCliente = await asaas.criarCliente({
          nome: cliente.nome,
          cpf: cliente.cpf,
          whatsapp: cliente.whatsapp,
          email: cliente.email,
        });
        asaasCustomerId = asaasCliente.id;

        await supabase
          .from('emprestimos')
          .update({ asaas_customer_id: asaasCustomerId })
          .eq('id', emp.id);
      }

      // Criar cobrança PIX no Asaas
      const cobranca = await asaas.criarCobrancaPix({
        asaasCustomerId,
        valor: parcela.valor,
        descricao: `Parcela ${parcela.numero} - ${cliente.nome}`,
        vencimento: hoje,
        externalReference: parcela.id,
      });

      // Buscar QR Code PIX
      const qrcode = await asaas.buscarQrCodePix(cobranca.id);

      // Atualizar parcela com dados do Asaas
      await supabase
        .from('parcelas')
        .update({
          asaas_payment_id: cobranca.id,
          asaas_pix_qrcode: qrcode.encodedImage,
          asaas_pix_copiaecola: qrcode.payload,
        })
        .eq('id', parcela.id);

      sucesso++;
      console.log(`[Billing] ✓ Cobrança criada: ${cliente.nome} - Parcela ${parcela.numero} - R$ ${parcela.valor}`);
    } catch (err) {
      erros++;
      console.error(`[Billing] ✗ Erro parcela ${parcela.id}:`, err.message);
    }
  }

  console.log(`[Billing] Resultado: ${sucesso} cobranças criadas, ${erros} erros.`);
  return { sucesso, erros };
}

// ============================================
// DISPARAR MENSAGENS DE COBRANÇA
// ============================================

async function dispararMensagens(tipoMensagem) {
  const hoje = new Date().toISOString().split('T')[0];
  console.log(`[Billing] Disparando mensagens tipo: ${tipoMensagem}...`);

  // Buscar template
  const { data: templates } = await supabase
    .from('templates_mensagem')
    .select('conteudo')
    .eq('tipo', tipoMensagem)
    .eq('ativo', true)
    .limit(1);

  const template = templates?.[0]?.conteudo;
  if (!template) {
    console.error(`[Billing] Template não encontrado: ${tipoMensagem}`);
    return { enviados: 0, erros: 0 };
  }

  // Buscar áudio correspondente ao tipo
  const tipoAudio = {
    cobranca_1: 'bom_dia',
    cobranca_2: 'preocupacao',
    cobranca_3: 'urgencia',
    cobranca_4: 'atraso',
  }[tipoMensagem];

  const { data: audios } = await supabase
    .from('audios')
    .select('url')
    .eq('tipo', tipoAudio)
    .eq('ativo', true);

  const audioUrl = audios?.length > 0 ? audios[Math.floor(Math.random() * audios.length)].url : null;

  // Buscar parcelas pendentes de hoje
  const { data: parcelas, error } = await supabase
    .from('parcelas')
    .select(`
      id, numero, valor, asaas_pix_copiaecola, asaas_pix_qrcode,
      emprestimos!inner(id, total_parcelas, parcelas_pagas,
        clientes!inner(id, nome, whatsapp)
      )
    `)
    .eq('data_vencimento', hoje)
    .eq('status', 'pendente')
    .not('asaas_pix_copiaecola', 'is', null);

  if (error) {
    console.error('[Billing] Erro ao buscar parcelas:', error);
    return { enviados: 0, erros: 0 };
  }

  if (!parcelas?.length) {
    console.log('[Billing] Nenhuma parcela pendente para enviar mensagem.');
    return { enviados: 0, erros: 0 };
  }

  // Verificar quais já receberam esta mensagem hoje
  const parcelaIds = parcelas.map(p => p.id);
  const { data: jaEnviadas } = await supabase
    .from('mensagens')
    .select('parcela_id')
    .in('parcela_id', parcelaIds)
    .eq('tipo', tipoMensagem)
    .gte('enviado_em', hoje);

  const jaEnviadasSet = new Set((jaEnviadas || []).map(m => m.parcela_id));

  let enviados = 0;
  let erros = 0;

  for (const parcela of parcelas) {
    if (jaEnviadasSet.has(parcela.id)) continue;

    const emp = parcela.emprestimos;
    const cliente = emp.clientes;

    try {
      // Montar mensagem personalizada (sem o PIX no corpo)
      const mensagem = template
        .replace(/\{\{nome\}\}/g, cliente.nome.split(' ')[0])
        .replace(/\{\{valor\}\}/g, parcela.valor.toFixed(2).replace('.', ','))
        .replace(/\{\{pix_copiaecola\}\}/g, '')
        .replace(/\{\{numero\}\}/g, parcela.numero)
        .replace(/\{\{total\}\}/g, emp.total_parcelas)
        .replace(/\{\{restantes\}\}/g, emp.total_parcelas - emp.parcelas_pagas)
        .replace(/\n{3,}/g, '\n\n');

      // Enviar texto via WhatsApp
      await evolution.enviarTexto(cliente.whatsapp, mensagem);

      // Enviar código PIX separado (fácil de copiar)
      if (parcela.asaas_pix_copiaecola) {
        await new Promise(r => setTimeout(r, 1500));
        await evolution.enviarTexto(cliente.whatsapp, parcela.asaas_pix_copiaecola);
      }

      // Enviar áudio se disponível (apenas nas cobranças 1-3)
      if (audioUrl && tipoMensagem !== 'cobranca_4') {
        await new Promise(r => setTimeout(r, 2000));
        await evolution.enviarAudio(cliente.whatsapp, audioUrl);
      }

      // Enviar mensagem de direcionamento para renovação/quitação
      await new Promise(r => setTimeout(r, 2000));
      await evolution.enviarTexto(cliente.whatsapp, '📲 Quer *renovar* seu crédito ou *quitar* seu contrato? Fale direto com nosso atendente: https://wa.me/5548992238802');

      // Registrar envio
      await supabase.from('mensagens').insert({
        parcela_id: parcela.id,
        cliente_id: cliente.id,
        tipo: tipoMensagem,
        conteudo: mensagem,
      });

      enviados++;
      console.log(`[Billing] ✓ Mensagem enviada: ${cliente.nome} (${tipoMensagem})`);
    } catch (err) {
      erros++;
      console.error(`[Billing] ✗ Erro envio ${cliente.nome}:`, err.message);

      await supabase.from('mensagens').insert({
        parcela_id: parcela.id,
        cliente_id: cliente.id,
        tipo: tipoMensagem,
        conteudo: '',
        status_envio: 'erro',
        erro: err.message,
      });
    }

    // Delay entre clientes para não sobrecarregar a API
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`[Billing] Resultado ${tipoMensagem}: ${enviados} enviados, ${erros} erros.`);
  return { enviados, erros };
}

// ============================================
// PROCESSAR WEBHOOK DE PAGAMENTO (ASAAS)
// ============================================

async function processarPagamento(paymentId) {
  console.log(`[Billing] Processando pagamento: ${paymentId}`);

  // Buscar parcela pelo ID do Asaas
  const { data: parcelas, error } = await supabase
    .from('parcelas')
    .select(`
      id, numero, valor, emprestimo_id,
      emprestimos!inner(id, total_parcelas, parcelas_pagas,
        clientes!inner(id, nome, whatsapp)
      )
    `)
    .eq('asaas_payment_id', paymentId)
    .limit(1);

  if (error || !parcelas?.length) {
    console.error('[Billing] Parcela não encontrada para payment:', paymentId);
    return false;
  }

  const parcela = parcelas[0];
  const emp = parcela.emprestimos;
  const cliente = emp.clientes;

  // Marcar como pago
  await supabase
    .from('parcelas')
    .update({
      status: 'pago',
      data_pagamento: new Date().toISOString(),
    })
    .eq('id', parcela.id);

  // Remover da fila humana se estiver
  await supabase
    .from('fila_humana')
    .update({ status: 'resolvido', resolvido_em: new Date().toISOString() })
    .eq('parcela_id', parcela.id)
    .eq('status', 'pendente');

  // Buscar template de confirmação
  const { data: templates } = await supabase
    .from('templates_mensagem')
    .select('conteudo')
    .eq('tipo', 'confirmacao')
    .eq('ativo', true)
    .limit(1);

  if (templates?.[0]) {
    const parcelas_pagas_atualizadas = emp.parcelas_pagas + 1;
    const mensagem = templates[0].conteudo
      .replace(/\{\{nome\}\}/g, cliente.nome.split(' ')[0])
      .replace(/\{\{numero\}\}/g, parcela.numero)
      .replace(/\{\{total\}\}/g, emp.total_parcelas)
      .replace(/\{\{restantes\}\}/g, emp.total_parcelas - parcelas_pagas_atualizadas);

    try {
      await evolution.enviarTexto(cliente.whatsapp, mensagem);

      // Enviar áudio de reforço positivo
      const { data: audios } = await supabase
        .from('audios')
        .select('url')
        .eq('tipo', 'reforco_positivo')
        .eq('ativo', true)
        .limit(1);

      if (audios?.[0]?.url) {
        await new Promise(r => setTimeout(r, 2000));
        await evolution.enviarAudio(cliente.whatsapp, audios[0].url);
      }

      // Enviar mensagem de direcionamento para renovação/quitação
      await new Promise(r => setTimeout(r, 2000));
      await evolution.enviarTexto(cliente.whatsapp, '📲 Quer *renovar* seu crédito ou *quitar* seu contrato? Fale direto com nosso atendente: https://wa.me/5548992238802');

      await supabase.from('mensagens').insert({
        parcela_id: parcela.id,
        cliente_id: cliente.id,
        tipo: 'confirmacao',
        conteudo: mensagem,
      });
    } catch (err) {
      console.error('[Billing] Erro ao enviar confirmação:', err.message);
    }
  }

  console.log(`[Billing] ✓ Pagamento confirmado: ${cliente.nome} - Parcela ${parcela.numero}`);
  return true;
}

// ============================================
// ATUALIZAR PARCELAS ATRASADAS
// ============================================

async function atualizarAtrasados() {
  const hoje = new Date().toISOString().split('T')[0];
  console.log('[Billing] Atualizando parcelas atrasadas...');

  const { data, error } = await supabase
    .from('parcelas')
    .update({ status: 'atrasado' })
    .eq('status', 'pendente')
    .lt('data_vencimento', hoje)
    .select('id');

  if (error) {
    console.error('[Billing] Erro ao atualizar atrasados:', error);
    return 0;
  }

  const count = data?.length || 0;
  if (count > 0) console.log(`[Billing] ${count} parcelas marcadas como atrasadas.`);
  return count;
}

// ============================================
// MOVER PARA FILA HUMANA
// ============================================

async function moverParaFilaHumana() {
  console.log('[Billing] Verificando clientes para fila humana...');

  // Buscar configuração
  const { data: configData } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'dias_para_fila_humana')
    .limit(1);

  const diasLimite = parseInt(configData?.[0]?.valor || '1');
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - diasLimite);
  const dataLimiteStr = dataLimite.toISOString().split('T')[0];

  // Buscar parcelas atrasadas que NÃO estão na fila humana
  const { data: atrasadas } = await supabase
    .from('parcelas')
    .select(`
      id, emprestimo_id,
      emprestimos!inner(cliente_id)
    `)
    .eq('status', 'atrasado')
    .lte('data_vencimento', dataLimiteStr);

  if (!atrasadas?.length) return 0;

  // Verificar quais já estão na fila
  const parcelaIds = atrasadas.map(p => p.id);
  const { data: jaFilas } = await supabase
    .from('fila_humana')
    .select('parcela_id')
    .in('parcela_id', parcelaIds)
    .in('status', ['pendente', 'em_atendimento']);

  const jaFilaSet = new Set((jaFilas || []).map(f => f.parcela_id));

  const novos = atrasadas.filter(p => !jaFilaSet.has(p.id));
  if (!novos.length) return 0;

  const inserts = novos.map(p => ({
    cliente_id: p.emprestimos.cliente_id,
    parcela_id: p.id,
    motivo: 'ignorou_mensagens',
    prioridade: 1,
  }));

  await supabase.from('fila_humana').insert(inserts);
  console.log(`[Billing] ${inserts.length} clientes adicionados à fila humana.`);
  return inserts.length;
}

// ============================================
// BUSCAR DADOS DO DASHBOARD
// ============================================

async function getDashboardData() {
  const hoje = new Date().toISOString().split('T')[0];

  // Cobranças de hoje
  const { data: cobrancas } = await supabase
    .from('parcelas')
    .select(`
      id, numero, valor, status, data_pagamento,
      asaas_pix_copiaecola,
      emprestimos!inner(id, total_parcelas, parcelas_pagas, valor_parcela,
        clientes!inner(id, nome, whatsapp)
      )
    `)
    .eq('data_vencimento', hoje)
    .order('status');

  // Mensagens de hoje
  const { data: mensagensHoje } = await supabase
    .from('mensagens')
    .select('parcela_id, tipo, status_envio')
    .gte('enviado_em', hoje);

  // Montar mapa de mensagens por parcela
  const msgMap = {};
  for (const m of mensagensHoje || []) {
    if (!msgMap[m.parcela_id]) msgMap[m.parcela_id] = [];
    msgMap[m.parcela_id].push(m.tipo);
  }

  // Calcular stats
  const totalClientes = cobrancas?.length || 0;
  const pagos = cobrancas?.filter(c => c.status === 'pago') || [];
  const pendentes = cobrancas?.filter(c => c.status === 'pendente') || [];
  const atrasados = cobrancas?.filter(c => c.status === 'atrasado') || [];

  const valorRecebido = pagos.reduce((sum, c) => sum + parseFloat(c.valor), 0);
  const valorEsperado = (cobrancas || []).reduce((sum, c) => sum + parseFloat(c.valor), 0);

  // Fila humana
  const { data: filaHumana, count: filaCount } = await supabase
    .from('fila_humana')
    .select('*, clientes(nome, whatsapp)', { count: 'exact' })
    .in('status', ['pendente', 'em_atendimento']);

  // Clientes bons (upsell)
  const { data: clientesBons } = await supabase
    .from('emprestimos')
    .select(`
      id, total_parcelas, parcelas_pagas, valor_total, valor_parcela,
      clientes!inner(id, nome, whatsapp)
    `)
    .eq('status', 'ativo');

  const upsellCandidatos = (clientesBons || [])
    .filter(e => {
      const perc = (e.parcelas_pagas / e.total_parcelas) * 100;
      return perc >= 70;
    })
    .map(e => ({
      cliente_id: e.clientes.id,
      nome: e.clientes.nome,
      whatsapp: e.clientes.whatsapp,
      emprestimo_id: e.id,
      valor_total: e.valor_total,
      valor_parcela: e.valor_parcela,
      total_parcelas: e.total_parcelas,
      parcelas_pagas: e.parcelas_pagas,
      percentual: Math.round((e.parcelas_pagas / e.total_parcelas) * 100),
    }));

  // Formatar cobranças para o frontend
  const cobrancasFormatadas = (cobrancas || []).map(c => {
    const emp = c.emprestimos;
    const cli = emp.clientes;
    const perc = Math.round((emp.parcelas_pagas / emp.total_parcelas) * 100);

    return {
      parcela_id: c.id,
      cliente_id: cli.id,
      nome: cli.nome,
      whatsapp: cli.whatsapp,
      numero: c.numero,
      total_parcelas: emp.total_parcelas,
      valor: parseFloat(c.valor),
      status: c.status,
      data_pagamento: c.data_pagamento,
      percentual_pago: perc,
      mensagens: msgMap[c.id] || [],
    };
  });

  return {
    stats: {
      total_clientes: totalClientes,
      pagos: pagos.length,
      pendentes: pendentes.length,
      atrasados: atrasados.length,
      fila_humana: filaCount || 0,
      valor_recebido: valorRecebido,
      valor_esperado: valorEsperado,
    },
    cobrancas: cobrancasFormatadas,
    clientes_bons: upsellCandidatos,
    fila_humana: filaHumana || [],
  };
}

// ============================================
// COBRAR CLIENTE IMEDIATAMENTE
// ============================================

async function cobrarClienteImediato(clienteId) {
  console.log(`[Billing] Cobrança imediata para cliente ${clienteId}...`);

  const hoje = new Date().toISOString().split('T')[0];

  // Buscar parcelas pendentes do cliente (sem cobrança gerada)
  const { data: parcelas, error } = await supabase
    .from('parcelas')
    .select(`
      id, numero, valor, data_vencimento, emprestimo_id,
      emprestimos!inner(id, asaas_customer_id, cliente_id, total_parcelas, parcelas_pagas,
        clientes!inner(id, nome, whatsapp, cpf, email)
      )
    `)
    .eq('emprestimos.cliente_id', clienteId)
    .eq('status', 'pendente')
    .is('asaas_payment_id', null)
    .order('data_vencimento', { ascending: true })
    .limit(1);

  if (error) {
    console.error('[Billing] Erro ao buscar parcelas do cliente:', error);
    throw new Error('Erro ao buscar parcelas do cliente');
  }

  if (!parcelas?.length) {
    return { sucesso: 0, erros: 0, mensagem: 'Nenhuma parcela pendente para este cliente' };
  }

  let sucesso = 0;
  let erros = 0;

  for (const parcela of parcelas) {
    try {
      const emp = parcela.emprestimos;
      const cliente = emp.clientes;

      // Garantir que o cliente existe no Asaas
      let asaasCustomerId = emp.asaas_customer_id;
      if (!asaasCustomerId) {
        const asaasCliente = await asaas.criarCliente({
          nome: cliente.nome,
          cpf: cliente.cpf,
          whatsapp: cliente.whatsapp,
          email: cliente.email,
        });
        asaasCustomerId = asaasCliente.id;

        await supabase
          .from('emprestimos')
          .update({ asaas_customer_id: asaasCustomerId })
          .eq('id', emp.id);
      }

      // Criar cobrança PIX no Asaas
      const cobranca = await asaas.criarCobrancaPix({
        asaasCustomerId,
        valor: parcela.valor,
        descricao: `Parcela ${parcela.numero} - ${cliente.nome}`,
        vencimento: hoje,
        externalReference: parcela.id,
      });

      // Buscar QR Code PIX
      const qrcode = await asaas.buscarQrCodePix(cobranca.id);

      // Atualizar parcela
      await supabase
        .from('parcelas')
        .update({
          asaas_payment_id: cobranca.id,
          asaas_pix_qrcode: qrcode.encodedImage,
          asaas_pix_copiaecola: qrcode.payload,
          data_vencimento: hoje,
        })
        .eq('id', parcela.id);

      // Buscar template de cobrança 1 (lembrete)
      const { data: templates } = await supabase
        .from('templates_mensagem')
        .select('conteudo')
        .eq('tipo', 'cobranca_1')
        .eq('ativo', true)
        .limit(1);

      const template = templates?.[0]?.conteudo;

      if (template) {
        const mensagem = template
          .replace(/\{\{nome\}\}/g, cliente.nome.split(' ')[0])
          .replace(/\{\{valor\}\}/g, parcela.valor.toFixed(2).replace('.', ','))
          .replace(/\{\{pix_copiaecola\}\}/g, '')
          .replace(/\{\{numero\}\}/g, parcela.numero)
          .replace(/\{\{total\}\}/g, emp.total_parcelas)
          .replace(/\{\{restantes\}\}/g, emp.total_parcelas - emp.parcelas_pagas)
          .replace(/\n{3,}/g, '\n\n');

        // Enviar mensagem WhatsApp
        await evolution.enviarTexto(cliente.whatsapp, mensagem);

        // Enviar PIX separado
        if (qrcode.payload) {
          await new Promise(r => setTimeout(r, 1500));
          await evolution.enviarTexto(cliente.whatsapp, qrcode.payload);
        }

        // Enviar mensagem de direcionamento para renovação/quitação
        await new Promise(r => setTimeout(r, 2000));
        await evolution.enviarTexto(cliente.whatsapp, '📲 Quer *renovar* seu crédito ou *quitar* seu contrato? Fale direto com nosso atendente: https://wa.me/5548992238802');

        // Registrar envio
        await supabase.from('mensagens').insert({
          parcela_id: parcela.id,
          cliente_id: cliente.id,
          tipo: 'cobranca_1',
          conteudo: mensagem,
        });
      }

      sucesso++;
      console.log(`[Billing] ✓ Cobrança imediata: ${cliente.nome} - Parcela ${parcela.numero} - R$ ${parcela.valor}`);
    } catch (err) {
      erros++;
      console.error(`[Billing] ✗ Erro cobrança imediata parcela ${parcela.id}:`, err.message);
    }
  }

  return { sucesso, erros };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  gerarCobrancasDoDia,
  dispararMensagens,
  processarPagamento,
  atualizarAtrasados,
  moverParaFilaHumana,
  getDashboardData,
  cobrarClienteImediato,
};
