/**
 * Instagram Graph API Client
 * Gerencia autenticação, publicação, métricas e comentários
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '../config/instagram.json');

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    console.error('❌ Config não encontrada. Copie instagram.example.json → instagram.json e preencha.');
    process.exit(1);
  }
}

const API_BASE = 'https://graph.facebook.com/v21.0';

async function apiCall(endpoint, options = {}) {
  const config = loadConfig();
  const url = new URL(`${API_BASE}${endpoint}`);
  url.searchParams.set('access_token', config.access_token);

  if (options.params) {
    for (const [key, val] of Object.entries(options.params)) {
      url.searchParams.set(key, val);
    }
  }

  const fetchOptions = { method: options.method || 'GET' };

  if (options.body) {
    fetchOptions.method = 'POST';
    fetchOptions.headers = { 'Content-Type': 'application/json' };
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(url.toString(), fetchOptions);
  const data = await res.json();

  if (data.error) {
    throw new Error(`Instagram API Error: ${data.error.message}`);
  }

  return data;
}

// ====== PUBLICAÇÃO ======

/**
 * Publica uma imagem no Instagram
 * @param {string} imageUrl - URL pública da imagem
 * @param {string} caption - Legenda do post
 */
export async function publicarImagem(imageUrl, caption) {
  const config = loadConfig();
  const igId = config.instagram_account_id;

  // Etapa 1: Criar container de mídia
  const container = await apiCall(`/${igId}/media`, {
    params: { image_url: imageUrl, caption }
  });

  // Etapa 2: Publicar o container
  const result = await apiCall(`/${igId}/media_publish`, {
    params: { creation_id: container.id }
  });

  console.log(`✅ Post publicado! ID: ${result.id}`);
  return result;
}

/**
 * Publica um carrossel no Instagram
 * @param {string[]} imageUrls - URLs públicas das imagens
 * @param {string} caption - Legenda do post
 */
export async function publicarCarrossel(imageUrls, caption) {
  const config = loadConfig();
  const igId = config.instagram_account_id;

  // Etapa 1: Criar containers individuais
  const children = [];
  for (const url of imageUrls) {
    const child = await apiCall(`/${igId}/media`, {
      params: { image_url: url, is_carousel_item: 'true' }
    });
    children.push(child.id);
  }

  // Etapa 2: Criar container do carrossel
  const container = await apiCall(`/${igId}/media`, {
    params: {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption
    }
  });

  // Etapa 3: Publicar
  const result = await apiCall(`/${igId}/media_publish`, {
    params: { creation_id: container.id }
  });

  console.log(`✅ Carrossel publicado! ID: ${result.id}`);
  return result;
}

/**
 * Publica um Reel no Instagram
 * @param {string} videoUrl - URL pública do vídeo
 * @param {string} caption - Legenda
 * @param {string} [coverUrl] - URL da thumbnail (opcional)
 */
export async function publicarReel(videoUrl, caption, coverUrl) {
  const config = loadConfig();
  const igId = config.instagram_account_id;

  const params = {
    media_type: 'REELS',
    video_url: videoUrl,
    caption
  };
  if (coverUrl) params.cover_url = coverUrl;

  // Etapa 1: Criar container
  const container = await apiCall(`/${igId}/media`, { params });

  // Etapa 2: Aguardar processamento do vídeo
  let status = 'IN_PROGRESS';
  while (status === 'IN_PROGRESS') {
    await new Promise(r => setTimeout(r, 5000));
    const check = await apiCall(`/${container.id}`, {
      params: { fields: 'status_code' }
    });
    status = check.status_code;
    if (status === 'ERROR') throw new Error('Erro no processamento do vídeo');
  }

  // Etapa 3: Publicar
  const result = await apiCall(`/${igId}/media_publish`, {
    params: { creation_id: container.id }
  });

  console.log(`✅ Reel publicado! ID: ${result.id}`);
  return result;
}

// ====== MÉTRICAS ======

/**
 * Busca métricas do perfil
 */
export async function getMetricasPerfil() {
  const config = loadConfig();
  const igId = config.instagram_account_id;

  const data = await apiCall(`/${igId}`, {
    params: {
      fields: 'username,name,followers_count,follows_count,media_count,biography'
    }
  });

  return data;
}

/**
 * Busca métricas de um post específico
 */
export async function getMetricasPost(mediaId) {
  const data = await apiCall(`/${mediaId}`, {
    params: {
      fields: 'like_count,comments_count,timestamp,caption,media_type,permalink'
    }
  });

  return data;
}

/**
 * Busca os últimos posts com métricas
 */
export async function getUltimosPosts(limit = 10) {
  const config = loadConfig();
  const igId = config.instagram_account_id;

  const data = await apiCall(`/${igId}/media`, {
    params: {
      fields: 'id,caption,like_count,comments_count,timestamp,media_type,permalink',
      limit: String(limit)
    }
  });

  return data.data || [];
}

/**
 * Busca insights do perfil (alcance, impressões, etc)
 */
export async function getInsightsPerfil(periodo = 'day', metricas = ['reach', 'impressions', 'profile_views']) {
  const config = loadConfig();
  const igId = config.instagram_account_id;

  const data = await apiCall(`/${igId}/insights`, {
    params: {
      metric: metricas.join(','),
      period: periodo
    }
  });

  return data.data || [];
}

// ====== COMENTÁRIOS ======

/**
 * Busca comentários de um post
 */
export async function getComentarios(mediaId) {
  const data = await apiCall(`/${mediaId}/comments`, {
    params: { fields: 'id,text,username,timestamp,like_count' }
  });

  return data.data || [];
}

/**
 * Responde a um comentário
 */
export async function responderComentario(comentarioId, texto) {
  const result = await apiCall(`/${comentarioId}/replies`, {
    params: { message: texto }
  });

  console.log(`✅ Resposta enviada! ID: ${result.id}`);
  return result;
}

// ====== UTILIDADES ======

/**
 * Verifica se o token está válido
 */
export async function verificarToken() {
  try {
    const perfil = await getMetricasPerfil();
    console.log(`✅ Token válido! Conectado como @${perfil.username} (${perfil.followers_count} seguidores)`);
    return true;
  } catch (err) {
    console.error(`❌ Token inválido: ${err.message}`);
    return false;
  }
}

/**
 * Renova o token de acesso (long-lived)
 */
export async function renovarToken() {
  const config = loadConfig();
  const data = await apiCall('/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: config.app_id,
      client_secret: config.app_secret,
      fb_exchange_token: config.access_token
    }
  });

  console.log(`✅ Novo token gerado! Expira em ${Math.round(data.expires_in / 86400)} dias`);
  console.log(`Token: ${data.access_token.substring(0, 20)}...`);
  return data;
}
