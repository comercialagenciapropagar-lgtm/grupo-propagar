/**
 * Auto-Publicar — Pega o vídeo do dia na pasta e posta no Instagram
 * Roda via cron todo dia às 18h
 *
 * Convenção de nomes na pasta "videos prontos":
 *   SEG.mov | TER.mov | QUA.mov | QUI.mov | SEX.mov
 *   (aceita .mov, .mp4, .m4v)
 */

import { readFileSync, readdirSync, renameSync, mkdirSync, appendFileSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

const VIDEOS_DIR = '/Users/robertoaraujo/POSICIONAMENTO ROBERTO/videos prontos';
const PUBLICADOS_DIR = '/Users/robertoaraujo/POSICIONAMENTO ROBERTO/videos prontos/publicados';
const CONTENT_DIR = resolve(__dirname, '../content');
const CONFIG_PATH = resolve(__dirname, '../config/instagram.json');
const LOG_PATH = resolve(__dirname, '../logs/auto-publicar.log');

const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
const EXTENSOES = ['.mov', '.mp4', '.m4v', '.MOV', '.MP4'];

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  try {
    mkdirSync(resolve(__dirname, '../logs'), { recursive: true });
    appendFileSync(LOG_PATH, line + '\n');
  } catch {}
}

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

function encontrarVideo(dia) {
  try {
    const arquivos = readdirSync(VIDEOS_DIR);
    for (const arquivo of arquivos) {
      const nome = arquivo.toUpperCase().replace(extname(arquivo), '');
      const ext = extname(arquivo).toLowerCase();
      if (nome === dia && (EXTENSOES.includes(ext) || EXTENSOES.includes(extname(arquivo)))) {
        return resolve(VIDEOS_DIR, arquivo);
      }
    }
  } catch {}
  return null;
}

function encontrarSemana() {
  try {
    const arquivos = readdirSync(CONTENT_DIR)
      .filter(f => f.startsWith('semana-') && f.endsWith('.json'))
      .sort()
      .reverse();
    if (arquivos.length > 0) {
      return JSON.parse(readFileSync(resolve(CONTENT_DIR, arquivos[0]), 'utf-8'));
    }
  } catch {}
  return null;
}

async function uploadVideo(videoPath) {
  log('📤 Subindo vídeo para URL pública...');

  try {
    const result = execSync(
      `curl -s -X POST -F "file=@${videoPath}" "https://tmpfiles.org/api/v1/upload"`,
      { timeout: 120000 }
    ).toString();

    const data = JSON.parse(result);
    if (data.status === 'success') {
      // Converter pra URL direta
      const url = data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      log('✅ Upload concluído: ' + url);
      return url;
    }
  } catch (err) {
    log('❌ Erro no upload: ' + err.message);
  }
  return null;
}

async function publicarReel(videoUrl, legenda) {
  const config = loadConfig();
  const token = config.access_token;
  const igId = config.instagram_account_id;

  // Etapa 1: Criar container
  const params = new URLSearchParams({
    media_type: 'REELS',
    video_url: videoUrl,
    caption: legenda,
    access_token: token
  });

  const containerRes = await fetch(
    `https://graph.facebook.com/v21.0/${igId}/media?${params}`,
    { method: 'POST' }
  );
  const container = await containerRes.json();

  if (container.error) {
    throw new Error(container.error.message);
  }

  log('✅ Container criado: ' + container.id);
  log('⏳ Aguardando processamento...');

  // Etapa 2: Polling
  let status = 'IN_PROGRESS';
  let attempts = 0;

  while (status === 'IN_PROGRESS' && attempts < 30) {
    await new Promise(r => setTimeout(r, 5000));
    attempts++;

    const checkRes = await fetch(
      `https://graph.facebook.com/v21.0/${container.id}?fields=status_code&access_token=${token}`
    );
    const check = await checkRes.json();
    status = check.status_code;
    log('   Status: ' + status + ' (tentativa ' + attempts + ')');
  }

  if (status === 'ERROR') throw new Error('Erro no processamento do vídeo');
  if (status !== 'FINISHED') throw new Error('Timeout no processamento');

  // Etapa 3: Publicar
  const pubParams = new URLSearchParams({
    creation_id: container.id,
    access_token: token
  });

  const pubRes = await fetch(
    `https://graph.facebook.com/v21.0/${igId}/media_publish?${pubParams}`,
    { method: 'POST' }
  );
  const pub = await pubRes.json();

  if (pub.error) throw new Error(pub.error.message);

  return pub.id;
}

function moverParaPublicados(videoPath, dia) {
  try {
    mkdirSync(PUBLICADOS_DIR, { recursive: true });
    const data = new Date().toISOString().split('T')[0];
    const ext = extname(videoPath);
    const novoNome = `${data}-${dia}${ext}`;
    renameSync(videoPath, resolve(PUBLICADOS_DIR, novoNome));
    log('📁 Vídeo movido para publicados/' + novoNome);
  } catch (err) {
    log('⚠️ Não conseguiu mover o vídeo: ' + err.message);
  }
}

// ====== EXECUÇÃO PRINCIPAL ======

async function main() {
  const hoje = DIAS[new Date().getDay()];

  log('');
  log('═══════════════════════════════════════');
  log('🤖 AUTO-PUBLICAR — ' + hoje + ' ' + new Date().toLocaleDateString('pt-BR'));
  log('═══════════════════════════════════════');

  // Sábado e domingo não posta Reel
  if (hoje === 'SAB' || hoje === 'DOM') {
    log('📅 Fim de semana — sem Reel programado. Só stories.');
    return;
  }

  // Procurar vídeo do dia
  const videoPath = encontrarVideo(hoje);
  if (!videoPath) {
    log('⚠️ Nenhum vídeo encontrado para ' + hoje);
    log('   Coloque o vídeo em: ' + VIDEOS_DIR + '/' + hoje + '.mov');
    return;
  }

  log('🎬 Vídeo encontrado: ' + videoPath);

  // Procurar legenda no roteiro da semana
  const semana = encontrarSemana();
  let legenda = '';

  if (semana && semana.dias[hoje]) {
    legenda = semana.dias[hoje].legenda;
    log('📝 Legenda do roteiro: ' + legenda.substring(0, 60) + '...');
  } else {
    log('⚠️ Sem roteiro para ' + hoje + '. Publicando sem legenda.');
  }

  // Upload do vídeo
  const videoUrl = await uploadVideo(videoPath);
  if (!videoUrl) {
    log('❌ Falha no upload. Abortando.');
    return;
  }

  // Publicar
  try {
    const postId = await publicarReel(videoUrl, legenda);
    log('');
    log('✅ REEL PUBLICADO COM SUCESSO!');
    log('   ID: ' + postId);
    log('   Dia: ' + hoje);
    log('   Legenda: ' + legenda.substring(0, 80) + '...');

    // Mover vídeo pra pasta de publicados
    moverParaPublicados(videoPath, hoje);

    // Atualizar status no JSON da semana
    if (semana && semana.dias[hoje]) {
      semana.dias[hoje].status = 'publicado';
      semana.dias[hoje].publicado_em = new Date().toISOString();
      semana.dias[hoje].post_id = postId;

      const arquivos = readdirSync(CONTENT_DIR)
        .filter(f => f.startsWith('semana-') && f.endsWith('.json'))
        .sort()
        .reverse();
      if (arquivos[0]) {
        const { writeFileSync } = await import('fs');
        writeFileSync(resolve(CONTENT_DIR, arquivos[0]), JSON.stringify(semana, null, 2));
        log('📋 Status atualizado no calendário.');
      }
    }
  } catch (err) {
    log('❌ Erro ao publicar: ' + err.message);
  }

  log('═══════════════════════════════════════');
}

main();
