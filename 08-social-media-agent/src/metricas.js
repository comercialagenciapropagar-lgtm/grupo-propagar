/**
 * Monitor de Métricas
 * Puxa dados do Instagram e mostra relatório no terminal
 */

import { getMetricasPerfil, getUltimosPosts, getInsightsPerfil, verificarToken } from './instagram-api.js';

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function barraVisual(valor, max, tamanho = 20) {
  const preenchido = Math.round((valor / max) * tamanho);
  return '█'.repeat(preenchido) + '░'.repeat(tamanho - preenchido);
}

async function relatorio() {
  const ok = await verificarToken();
  if (!ok) process.exit(1);

  console.log('\n════════════════════════════════════════');
  console.log('   📊  RELATÓRIO @orobertoaraujo');
  console.log('════════════════════════════════════════\n');

  // Perfil
  const perfil = await getMetricasPerfil();
  console.log(`  👤 @${perfil.username}`);
  console.log(`  👥 Seguidores: ${formatNum(perfil.followers_count)}`);
  console.log(`  📱 Posts: ${perfil.media_count}`);
  console.log('');

  // Últimos posts
  const posts = await getUltimosPosts(10);

  if (posts.length === 0) {
    console.log('  Nenhum post encontrado.\n');
    return;
  }

  const maxLikes = Math.max(...posts.map(p => p.like_count || 0), 1);
  const maxComments = Math.max(...posts.map(p => p.comments_count || 0), 1);

  console.log('  ── ÚLTIMOS 10 POSTS ──\n');

  for (const post of posts) {
    const data = new Date(post.timestamp).toLocaleDateString('pt-BR');
    const tipo = post.media_type === 'VIDEO' ? '🎬' : post.media_type === 'CAROUSEL_ALBUM' ? '📸' : '🖼️';
    const caption = (post.caption || '').substring(0, 50).replace(/\n/g, ' ');
    const likes = post.like_count || 0;
    const comments = post.comments_count || 0;

    console.log(`  ${tipo} ${data}  "${caption}..."`);
    console.log(`     ❤️  ${String(likes).padStart(5)} ${barraVisual(likes, maxLikes, 15)}`);
    console.log(`     💬 ${String(comments).padStart(5)} ${barraVisual(comments, maxComments, 15)}`);
    console.log('');
  }

  // Resumo
  const totalLikes = posts.reduce((s, p) => s + (p.like_count || 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.comments_count || 0), 0);
  const avgLikes = Math.round(totalLikes / posts.length);
  const avgComments = Math.round(totalComments / posts.length);

  console.log('  ── RESUMO ──\n');
  console.log(`  Média de likes:       ${avgLikes}`);
  console.log(`  Média de comentários: ${avgComments}`);
  console.log(`  Taxa de engajamento:  ${((totalLikes + totalComments) / posts.length / perfil.followers_count * 100).toFixed(2)}%`);

  // Post com melhor performance
  const melhor = posts.reduce((best, p) =>
    ((p.like_count || 0) + (p.comments_count || 0)) > ((best.like_count || 0) + (best.comments_count || 0)) ? p : best
  );

  console.log(`\n  🏆 Melhor post: "${(melhor.caption || '').substring(0, 60)}..."`);
  console.log(`     ❤️ ${melhor.like_count}  💬 ${melhor.comments_count}`);
  console.log(`     🔗 ${melhor.permalink}`);

  console.log('\n════════════════════════════════════════\n');
}

relatorio().catch(err => {
  console.error('Erro:', err.message);
});
