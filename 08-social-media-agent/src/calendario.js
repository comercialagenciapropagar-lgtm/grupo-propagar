/**
 * Calendário Visual
 * Mostra o status da semana no terminal
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = resolve(__dirname, '../content');

function statusIcon(status) {
  switch (status) {
    case 'publicado': return '✅';
    case 'pronto': return '🟢';
    case 'pendente': return '🟡';
    default: return '⚪';
  }
}

function mostrarCalendario() {
  let arquivos;
  try {
    arquivos = readdirSync(CONTENT_DIR).filter(f => f.startsWith('semana-') && f.endsWith('.json'));
  } catch {
    console.log('📂 Nenhuma semana gerada ainda.');
    console.log('   Use: npm run gerar-semana -- "tema do arco"');
    return;
  }

  if (arquivos.length === 0) {
    console.log('📂 Nenhuma semana gerada ainda.');
    console.log('   Use: npm run gerar-semana -- "tema do arco"');
    return;
  }

  // Pegar a semana mais recente (ou a especificada)
  const arquivo = process.argv[2] || arquivos.sort().reverse()[0];
  const caminho = resolve(CONTENT_DIR, arquivo);
  const semana = JSON.parse(readFileSync(caminho, 'utf-8'));

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  📅  SEMANA: ${semana.data_inicio}                        ║`);
  console.log(`║  🎯  ARCO: "${semana.tema_do_arco}"`.padEnd(51) + '║');
  console.log('╠══════════════════════════════════════════════════╣');

  for (const [dia, config] of Object.entries(semana.dias)) {
    const icon = statusIcon(config.status);
    const pilar = config.pilar.substring(0, 22).padEnd(22);
    const preenchido = !config.roteiro.hook.includes('[PREENCHER]');
    const conteudoStatus = preenchido ? '📝' : '  ';

    console.log(`║  ${icon} ${dia} │ ${pilar} │ ${conteudoStatus} ${config.status.padEnd(10)} ║`);
  }

  console.log('╠══════════════════════════════════════════════════╣');

  // Stories
  const storiesFeitos = semana.stories_semana.filter(s => !s.conteudo.includes('[PREENCHER]')).length;
  console.log(`║  📱 Stories: ${storiesFeitos}/${semana.stories_semana.length} preenchidos                   ║`);

  // Contadores
  const total = Object.keys(semana.dias).length;
  const publicados = Object.values(semana.dias).filter(d => d.status === 'publicado').length;
  const prontos = Object.values(semana.dias).filter(d => d.status === 'pronto').length;
  const pendentes = Object.values(semana.dias).filter(d => d.status === 'pendente').length;

  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  ✅ ${publicados} publicados  🟢 ${prontos} prontos  🟡 ${pendentes} pendentes        ║`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (pendentes > 0) {
    console.log('\n  💡 Use o Claude Code com @conteudo-chief pra preencher os roteiros.');
  }
}

mostrarCalendario();
