// Script CLI standalone para rodar backup manualmente.
// Uso: node src/scripts/run-backup.js
const { rodarBackupCompleto } = require('../services/backup');

(async () => {
  try {
    const resultado = await rodarBackupCompleto(30);
    console.log('\n✓ Backup concluido');
    console.log('  Pasta:', resultado.destino);
    console.log('  Duracao:', resultado.duracao_ms, 'ms');
    console.log('  Total de linhas:', resultado.metadata.total_linhas);
    console.log('  Tabelas:', Object.keys(resultado.metadata.tabelas).length);
    console.log(
      '  Retencao:',
      resultado.retencao.apagados,
      'antigos apagados'
    );
    process.exit(0);
  } catch (err) {
    console.error('✗ Erro no backup:', err.message);
    process.exit(1);
  }
})();
