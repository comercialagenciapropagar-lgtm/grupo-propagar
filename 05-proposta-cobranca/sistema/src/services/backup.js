const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pipeline } = require('stream/promises');
const { createGzip } = require('zlib');
const supabase = require('../database');
const { logger } = require('../middleware/logger');

// Tabelas a incluir no dump.
// Ordem importa para restore (pais antes dos filhos), embora o restore nao
// esteja implementado — o dump em si aceita qualquer ordem.
const TABELAS = [
  'clientes',
  'emprestimos',
  'parcelas',
  'mensagens',
  'audios',
  'templates_mensagem',
  'fila_humana',
  'configuracoes',
  'audit_log',
  'feriados',
];

// Raiz da pasta de backups (fora de src/ para nao poluir codigo)
const BACKUP_ROOT = path.resolve(__dirname, '../../backups');

// Garante que a pasta existe.
function garantirPasta(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Gera um timestamp seguro para nome de arquivo: 2026-04-11_12-30-45
function timestampParaNome(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(
    d.getHours()
  )}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

// Paginacao defensiva: Supabase limita por padrao a 1000 linhas.
async function buscarTabelaCompleta(tabela) {
  const pagina = 1000;
  let offset = 0;
  const resultado = [];
  // Tenta ate 1000 paginas (1M linhas) por seguranca.
  for (let i = 0; i < 1000; i++) {
    const { data, error } = await supabase
      .from(tabela)
      .select('*')
      .range(offset, offset + pagina - 1);
    if (error) {
      // Tabela pode nao existir ainda (ex: audit_log antes da migration).
      if (
        error.message.includes('does not exist') ||
        error.code === '42P01' ||
        error.message.includes('schema cache')
      ) {
        return { data: [], skipped: true, reason: error.message };
      }
      throw new Error(`[${tabela}] ${error.message}`);
    }
    if (!data || data.length === 0) break;
    resultado.push(...data);
    if (data.length < pagina) break;
    offset += pagina;
  }
  return { data: resultado, skipped: false };
}

// Dump principal: cria pasta timestampada, grava um JSON por tabela
// e depois compacta tudo num .tar.gz? Nao — tar requer binary externo.
// Vou usar gzip por arquivo individual para manter portabilidade pura Node.
// E depois gero um metadata.json com os totais.
async function dumpDatabase() {
  const inicio = Date.now();
  const stamp = timestampParaNome();
  const destino = path.join(BACKUP_ROOT, stamp);
  garantirPasta(destino);

  logger.info({ destino }, '[Backup] Iniciando dump do banco');

  const metadata = {
    timestamp: new Date().toISOString(),
    tabelas: {},
    total_linhas: 0,
    ignoradas: [],
  };

  for (const tabela of TABELAS) {
    try {
      const { data, skipped, reason } = await buscarTabelaCompleta(tabela);
      if (skipped) {
        metadata.ignoradas.push({ tabela, reason });
        logger.warn({ tabela, reason }, '[Backup] Tabela ignorada');
        continue;
      }

      // Escreve JSON cru
      const arquivoJson = path.join(destino, `${tabela}.json`);
      const conteudo = JSON.stringify(data, null, 2);
      fs.writeFileSync(arquivoJson, conteudo);

      // Compacta em .json.gz e apaga o JSON cru para economizar espaco.
      const arquivoGz = arquivoJson + '.gz';
      await pipeline(
        fs.createReadStream(arquivoJson),
        createGzip({ level: 9 }),
        fs.createWriteStream(arquivoGz)
      );
      fs.unlinkSync(arquivoJson);

      metadata.tabelas[tabela] = {
        linhas: data.length,
        arquivo: `${tabela}.json.gz`,
        bytes: fs.statSync(arquivoGz).size,
      };
      metadata.total_linhas += data.length;

      logger.info(
        { tabela, linhas: data.length },
        '[Backup] Tabela dumpada'
      );
    } catch (err) {
      logger.error({ err: err.message, tabela }, '[Backup] Erro ao dumpar tabela');
      metadata.tabelas[tabela] = { erro: err.message };
    }
  }

  // Grava metadata
  fs.writeFileSync(
    path.join(destino, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  const duracao = Date.now() - inicio;
  logger.info(
    {
      destino,
      duracao_ms: duracao,
      total_linhas: metadata.total_linhas,
      tabelas: Object.keys(metadata.tabelas).length,
    },
    '[Backup] Dump concluido'
  );

  return {
    destino,
    duracao_ms: duracao,
    metadata,
  };
}

// Retencao: mantem os N backups mais recentes e apaga os antigos.
function aplicarRetencao(manter = 30) {
  if (!fs.existsSync(BACKUP_ROOT)) return { apagados: 0 };
  const pastas = fs
    .readdirSync(BACKUP_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({
      nome: e.name,
      caminho: path.join(BACKUP_ROOT, e.name),
      mtime: fs.statSync(path.join(BACKUP_ROOT, e.name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime); // mais recentes primeiro

  const excedentes = pastas.slice(manter);
  for (const p of excedentes) {
    fs.rmSync(p.caminho, { recursive: true, force: true });
    logger.info({ pasta: p.nome }, '[Backup] Retencao - apagado backup antigo');
  }
  return { apagados: excedentes.length, mantidos: pastas.length - excedentes.length };
}

// Push best-effort para o repo privado de backups no GitHub.
// Nao trava a rotina: se falhar (sem rede, sem auth), apenas loga.
function pushParaGitHub() {
  try {
    if (!fs.existsSync(path.join(BACKUP_ROOT, '.git'))) {
      logger.warn('[Backup] Repo git nao inicializado em backups/, pulando push');
      return { pushed: false, reason: 'sem-git' };
    }
    const stamp = new Date().toISOString();
    execSync('git add .', { cwd: BACKUP_ROOT, stdio: 'pipe' });
    // Commit so se houver mudancas (--allow-empty evitado).
    const status = execSync('git status --porcelain', { cwd: BACKUP_ROOT }).toString().trim();
    if (!status) {
      logger.info('[Backup] Nada para comitar no repo de backups');
      return { pushed: false, reason: 'sem-mudancas' };
    }
    execSync(`git commit -q -m "Backup automatico ${stamp}"`, {
      cwd: BACKUP_ROOT,
      stdio: 'pipe',
    });
    execSync('git push origin main', { cwd: BACKUP_ROOT, stdio: 'pipe' });
    logger.info('[Backup] Push para GitHub concluido');
    return { pushed: true };
  } catch (err) {
    logger.error(
      { err: err.message },
      '[Backup] Falha ao dar push (backup local esta salvo)'
    );
    return { pushed: false, reason: err.message };
  }
}

// Rotina completa: dump + retencao + push para GitHub.
async function rodarBackupCompleto(retencao = 30) {
  const resultado = await dumpDatabase();
  const retencaoResult = aplicarRetencao(retencao);
  const pushResult = pushParaGitHub();
  return { ...resultado, retencao: retencaoResult, push: pushResult };
}

module.exports = {
  dumpDatabase,
  aplicarRetencao,
  pushParaGitHub,
  rodarBackupCompleto,
  BACKUP_ROOT,
  TABELAS,
};
