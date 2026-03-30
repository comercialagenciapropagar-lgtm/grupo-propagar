const config = require('../config');

const instanceId = config.zapi.instanceId;
const token = config.zapi.token;
const clientToken = config.zapi.clientToken;
const baseUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}`;

const headers = {
  'Content-Type': 'application/json',
  'Client-Token': clientToken,
};

// ============================================
// ENVIO DE MENSAGENS
// ============================================

async function enviarTexto(whatsapp, texto) {
  const numero = formatarNumero(whatsapp);

  const res = await fetch(`${baseUrl}/send-text`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      phone: numero,
      message: texto,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Z-API enviarTexto: ${err}`);
  }

  return res.json();
}

async function enviarAudio(whatsapp, audioUrl) {
  const numero = formatarNumero(whatsapp);

  const res = await fetch(`${baseUrl}/send-audio`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      phone: numero,
      audio: audioUrl,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Z-API enviarAudio: ${err}`);
  }

  return res.json();
}

async function enviarImagem(whatsapp, imageUrl, caption) {
  const numero = formatarNumero(whatsapp);

  const res = await fetch(`${baseUrl}/send-image`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      phone: numero,
      image: imageUrl,
      caption,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Z-API enviarImagem: ${err}`);
  }

  return res.json();
}

// ============================================
// VERIFICAR CONEXAO
// ============================================

async function verificarConexao() {
  try {
    const res = await fetch(`${baseUrl}/status`, { headers });
    if (!res.ok) return { connected: false, error: 'Falha na requisição' };
    const data = await res.json();
    return { connected: data.connected, state: data.connected ? 'open' : 'disconnected' };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

// ============================================
// HELPERS
// ============================================

function formatarNumero(whatsapp) {
  let num = whatsapp.replace(/\D/g, '');
  if (!num.startsWith('55')) num = '55' + num;
  return num;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  enviarTexto,
  enviarAudio,
  enviarImagem,
  verificarConexao,
  formatarNumero,
};
