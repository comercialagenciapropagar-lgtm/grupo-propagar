const config = require('../config');

const phoneNumberId = config.whatsappMeta.phoneNumberId;
const accessToken = config.whatsappMeta.accessToken;
const baseUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${accessToken}`,
};

// ============================================
// ENVIO DE MENSAGENS
// ============================================

async function enviarTexto(whatsapp, texto) {
  const numero = formatarNumero(whatsapp);

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: 'text',
      text: { body: texto },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp Meta enviarTexto: ${err}`);
  }

  return res.json();
}

async function enviarAudio(whatsapp, audioUrl) {
  const numero = formatarNumero(whatsapp);

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: 'audio',
      audio: { link: audioUrl },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp Meta enviarAudio: ${err}`);
  }

  return res.json();
}

async function enviarImagem(whatsapp, imageUrl, caption) {
  const numero = formatarNumero(whatsapp);

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: 'image',
      image: { link: imageUrl, caption },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp Meta enviarImagem: ${err}`);
  }

  return res.json();
}

// ============================================
// VERIFICAR CONEXAO
// ============================================

async function verificarConexao() {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { connected: false, error: 'Falha na requisição' };
    const data = await res.json();
    return { connected: true, phoneNumber: data.display_phone_number, quality: data.quality_rating };
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
