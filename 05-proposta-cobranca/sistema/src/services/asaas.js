const config = require('../config');

const headers = {
  'Content-Type': 'application/json',
  access_token: config.asaas.apiKey,
};

const baseUrl = config.asaas.apiUrl;

// ============================================
// CLIENTES NO ASAAS
// ============================================

async function criarCliente({ nome, cpf, whatsapp, email }) {
  const res = await fetch(`${baseUrl}/customers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: nome,
      cpfCnpj: cpf,
      mobilePhone: whatsapp,
      email,
      notificationDisabled: true, // Nós cuidamos das notificações
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Asaas criarCliente: ${JSON.stringify(err)}`);
  }

  return res.json();
}

async function buscarCliente(asaasCustomerId) {
  const res = await fetch(`${baseUrl}/customers/${asaasCustomerId}`, { headers });

  if (!res.ok) return null;
  return res.json();
}

// ============================================
// COBRANCAS PIX
// ============================================

async function criarCobrancaPix({ asaasCustomerId, valor, descricao, vencimento, externalReference }) {
  const res = await fetch(`${baseUrl}/payments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customer: asaasCustomerId,
      billingType: 'PIX',
      value: valor,
      dueDate: vencimento,
      description: descricao,
      externalReference,
      postalService: false,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Asaas criarCobrancaPix: ${JSON.stringify(err)}`);
  }

  return res.json();
}

async function buscarQrCodePix(paymentId) {
  const res = await fetch(`${baseUrl}/payments/${paymentId}/pixQrCode`, { headers });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Asaas buscarQrCodePix: ${JSON.stringify(err)}`);
  }

  return res.json();
}

async function buscarCobranca(paymentId) {
  const res = await fetch(`${baseUrl}/payments/${paymentId}`, { headers });

  if (!res.ok) return null;
  return res.json();
}

async function cancelarCobranca(paymentId) {
  const res = await fetch(`${baseUrl}/payments/${paymentId}`, {
    method: 'DELETE',
    headers,
  });

  return res.ok;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  criarCliente,
  buscarCliente,
  criarCobrancaPix,
  buscarQrCodePix,
  buscarCobranca,
  cancelarCobranca,
};
