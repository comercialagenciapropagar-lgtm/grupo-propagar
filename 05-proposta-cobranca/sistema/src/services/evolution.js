const config = require('../config');

const baseUrl = config.evolution.apiUrl;
const instance = config.evolution.instance;
const headers = {
  'Content-Type': 'application/json',
  apikey: config.evolution.apiKey,
};

// ============================================
// ENVIO DE MENSAGENS
// ============================================

async function enviarTexto(whatsapp, texto) {
  const numero = formatarNumero(whatsapp);

  const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      number: numero,
      textMessage: { text: texto },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Evolution enviarTexto: ${err}`);
  }

  return res.json();
}

async function enviarAudio(whatsapp, audioUrl) {
  const numero = formatarNumero(whatsapp);

  const res = await fetch(`${baseUrl}/message/sendWhatsAppAudio/${instance}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      number: numero,
      audio: audioUrl,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Evolution enviarAudio: ${err}`);
  }

  return res.json();
}

async function enviarImagem(whatsapp, imageUrl, caption) {
  const numero = formatarNumero(whatsapp);

  const res = await fetch(`${baseUrl}/message/sendMedia/${instance}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      number: numero,
      mediatype: 'image',
      media: imageUrl,
      caption,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Evolution enviarImagem: ${err}`);
  }

  return res.json();
}

// ============================================
// VERIFICAR CONEXAO
// ============================================

async function verificarConexao() {
  try {
    const res = await fetch(`${baseUrl}/instance/connectionState/${instance}`, { headers });
    if (!res.ok) return { connected: false, error: 'Falha na requisição' };
    const data = await res.json();
    return { connected: data.instance?.state === 'open', state: data.instance?.state };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

// ============================================
// HELPERS
// ============================================

function formatarNumero(whatsapp) {
  // Remove tudo que não é número
  let num = whatsapp.replace(/\D/g, '');
  // Garante formato 55DDDNUMERO
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
