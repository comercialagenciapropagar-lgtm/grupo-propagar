/**
 * Publicador de Posts
 * Lê o conteúdo gerado e publica no Instagram via API
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { publicarImagem, publicarReel, publicarCarrossel, verificarToken } from './instagram-api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DIAS_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

async function publicarHoje(arquivoSemana) {
  // Verificar token
  const tokenValido = await verificarToken();
  if (!tokenValido) {
    console.error('❌ Configure o token primeiro em config/instagram.json');
    process.exit(1);
  }

  // Carregar semana
  const caminho = resolve(__dirname, '../content', arquivoSemana);
  const semana = JSON.parse(readFileSync(caminho, 'utf-8'));

  // Descobrir dia da semana
  const hoje = DIAS_SEMANA[new Date().getDay()];
  const conteudo = semana.dias[hoje];

  if (!conteudo) {
    console.log(`📅 ${hoje} — Sem conteúdo planejado (SAB/DOM são stories).`);
    return;
  }

  if (conteudo.status === 'publicado') {
    console.log(`⏭️  ${hoje} — Já foi publicado.`);
    return;
  }

  // Verificar se foi preenchido
  if (conteudo.legenda.includes('[PREENCHER]')) {
    console.error(`❌ ${hoje} — Legenda ainda não foi preenchida!`);
    console.log('   Use o Claude Code com os skills de conteúdo pra gerar.');
    return;
  }

  console.log(`\n📤 Publicando conteúdo de ${hoje}...`);
  console.log(`   Pilar: ${conteudo.pilar}`);
  console.log(`   Legenda: ${conteudo.legenda.substring(0, 80)}...`);

  // Publicar baseado no tipo de mídia
  try {
    if (conteudo.video_url) {
      await publicarReel(conteudo.video_url, conteudo.legenda);
    } else if (conteudo.imagens && conteudo.imagens.length > 1) {
      await publicarCarrossel(conteudo.imagens, conteudo.legenda);
    } else if (conteudo.imagem_url) {
      await publicarImagem(conteudo.imagem_url, conteudo.legenda);
    } else {
      console.log('⚠️  Nenhuma mídia associada. Adicione video_url, imagem_url ou imagens[] ao JSON.');
      return;
    }

    // Marcar como publicado
    conteudo.status = 'publicado';
    conteudo.publicado_em = new Date().toISOString();
    writeFileSync(caminho, JSON.stringify(semana, null, 2), 'utf-8');

    console.log(`\n✅ ${hoje} publicado com sucesso!`);
  } catch (err) {
    console.error(`\n❌ Erro ao publicar: ${err.message}`);
  }
}

// ====== EXECUÇÃO ======
const arquivo = process.argv[2];
if (!arquivo) {
  console.log('Uso: npm run publicar -- semana-2026-04-14.json');
  process.exit(1);
}

publicarHoje(arquivo);
