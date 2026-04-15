/**
 * Gerador de Conteúdo Semanal
 * Cria o arco temático da semana com 5 roteiros de vídeo + stories
 * Baseado no posicionamento do Roberto Araújo
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carregar posicionamento
const POSICIONAMENTO_PATH = '/Users/robertoaraujo/POSICIONAMENTO ROBERTO/POSICIONAMENTO-INSTAGRAM.md';
const BANCO_GANCHOS_PATH = '/Users/robertoaraujo/POSICIONAMENTO ROBERTO/BANCO-DE-GANCHOS.md';

function lerArquivo(path) {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}

// Estrutura do calendário semanal (do posicionamento)
const CALENDARIO = {
  SEG: { energia: 'Alta', tipo: 'Opinião forte — começa a semana batendo de frente', pilar: 'OPINIÃO FORTE' },
  TER: { energia: 'Construção', tipo: 'Verdade inconveniente sobre o mercado', pilar: 'VERDADES INCONVENIENTES' },
  QUA: { energia: 'Prova', tipo: 'Bastidor real — mostra decisão, número, erro', pilar: 'BASTIDORES REAIS' },
  QUI: { energia: 'Reflexão', tipo: 'Pensamento de campo — insight do dia', pilar: 'REFLEXÕES DE CAMPO' },
  SEX: { energia: 'Polêmica', tipo: 'A opinião mais forte da semana', pilar: 'OPINIÃO FORTE' },
};

// Template de roteiro
const TEMPLATE_ROTEIRO = {
  estrutura: {
    hook: '[0-3s] OPINIÃO BOMBÁSTICA — a frase que para o scroll',
    argumento: '[3-30s] ARGUMENTO — por que você pensa isso, com exemplo real',
    nocaute: '[30-60s] NOCAUTE — a frase final que não tem resposta'
  },
  regras: [
    'Máximo 15 palavras no hook',
    'Fale pro empresário — "seu negócio", "seu faturamento"',
    'NUNCA comece com "Nesse vídeo..." ou "3 passos pra..."',
    'NÃO TEM CTA NO FINAL — o vídeo termina na opinião, seco',
    'Fale como conversa, não como palestra',
    'Não se desculpe — sem "na minha opinião"'
  ]
};

// Stories template
const TEMPLATE_STORIES = {
  tipos: [
    'Pensamento em tempo real — "Acabei de perceber que..."',
    'Reação a algo que viu — "Vi um post de um guru dizendo X. Que absurdo."',
    'Bastidor sem roteiro — filma o que tá fazendo, comenta por cima',
    'Opinião rápida — texto no fundo preto, 1 frase forte',
    'Enquete de opinião — "Concorda ou discorda: [afirmação polêmica]"'
  ],
  proibido: [
    '"Manda ESCALAR no DM"',
    '"Link na bio"',
    '"Últimas vagas"',
    '"Diagnóstico gratuito"',
    'Qualquer coisa com cara de propaganda'
  ]
};

function gerarSemana(tema, dataInicio) {
  const posicionamento = lerArquivo(POSICIONAMENTO_PATH);
  const ganchosUsados = lerArquivo(BANCO_GANCHOS_PATH);

  const semana = {
    tema_do_arco: tema,
    data_inicio: dataInicio,
    gerado_em: new Date().toISOString(),
    posicionamento_resumo: {
      tagline: 'A verdade que ninguém fala sobre negócios',
      tom: 'Opinativo, provocador, autêntico, convicto, coloquial',
      regra_de_ouro: 'Se todo mundo concordar, você está sendo fraco'
    },
    dias: {},
    stories_semana: [],
    instrucoes: TEMPLATE_ROTEIRO
  };

  // Gerar estrutura para cada dia
  for (const [dia, config] of Object.entries(CALENDARIO)) {
    semana.dias[dia] = {
      pilar: config.pilar,
      energia: config.energia,
      tipo: config.tipo,
      roteiro: {
        hook: `[PREENCHER] — Opinião sobre "${tema}" no estilo ${config.pilar}`,
        argumento: '[PREENCHER] — Exemplo real, caso concreto, número se possível',
        nocaute: '[PREENCHER] — Frase final devastadora, sem resposta',
      },
      legenda: '[PREENCHER] — Legenda curta que reforça a opinião, sem CTA',
      hashtags: '#marketingdeverdade #empresario #opiniaoimpopular',
      horario_sugerido: '18:00',
      status: 'pendente'
    };
  }

  // Stories para a semana
  semana.stories_semana = [
    { dia: 'SEG', tipo: 'Enquete de opinião', conteudo: `[PREENCHER] Enquete sobre ${tema}` },
    { dia: 'TER', tipo: 'Pensamento em tempo real', conteudo: '[PREENCHER] Insight do dia' },
    { dia: 'QUA', tipo: 'Bastidor', conteudo: '[PREENCHER] Mostrar algo real do trabalho' },
    { dia: 'QUI', tipo: 'Reação', conteudo: '[PREENCHER] Reagir a algo do mercado' },
    { dia: 'SEX', tipo: 'Opinião rápida', conteudo: `[PREENCHER] A mais forte sobre ${tema}` },
    { dia: 'SAB', tipo: 'Pessoal + negócio', conteudo: '[PREENCHER] Reflexão pessoal' },
    { dia: 'DOM', tipo: 'Pergunta aberta', conteudo: '[PREENCHER] Pergunta pra audiência' },
  ];

  return semana;
}

function salvarSemana(semana) {
  const pastaContent = resolve(__dirname, '../content');
  mkdirSync(pastaContent, { recursive: true });

  const nomeArquivo = `semana-${semana.data_inicio}.json`;
  const caminho = resolve(pastaContent, nomeArquivo);
  writeFileSync(caminho, JSON.stringify(semana, null, 2), 'utf-8');

  console.log(`\n✅ Semana gerada: ${caminho}`);
  console.log(`\n📋 ARCO: "${semana.tema_do_arco}"`);
  console.log(`📅 Início: ${semana.data_inicio}\n`);

  for (const [dia, config] of Object.entries(semana.dias)) {
    console.log(`  ${dia} | ${config.pilar} | ${config.tipo}`);
  }

  console.log(`\n📱 ${semana.stories_semana.length} stories planejados`);
  console.log(`\n⚠️  Preencha os campos [PREENCHER] no arquivo ou use o Claude Code com os skills de conteúdo.`);

  return caminho;
}

// ====== EXECUÇÃO ======

const tema = process.argv[2] || 'Marketing que funciona vs. marketing de guru';
const dataInicio = process.argv[3] || new Date().toISOString().split('T')[0];

const semana = gerarSemana(tema, dataInicio);
salvarSemana(semana);
