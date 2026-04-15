# PLAYBOOK — Agente Social Media @orobertoaraujo

---

## 1. VER RELATORIO DE METRICAS

Abre o terminal na pasta do agente e roda:

```bash
cd ~/Documents/grupo-propagar/08-social-media-agent
npm run metricas
```

Vai mostrar:
- Seguidores atuais
- Ultimos 10 posts com likes e comentarios
- Media de engajamento
- Melhor post da semana

---

## 2. GERAR CONTEUDO DA SEMANA

### Pelo terminal:

```bash
cd ~/Documents/grupo-propagar/08-social-media-agent
npm run gerar-semana -- "tema do arco" "2026-04-21"
```

Isso cria a estrutura. Depois pede pro Claude Code preencher:

### Pelo Claude Code:

Abre o Claude Code e digita:

```
Preencha os roteiros da semana em
08-social-media-agent/content/semana-2026-04-21.json
usando o posicionamento do Roberto e o banco de ganchos.
O arco da semana e "tema que voce escolheu".
Gere tambem o HTML visual.
```

### Ver o material pronto:

```bash
open ~/Documents/grupo-propagar/08-social-media-agent/content/semana-2026-04-21.html
```

---

## 3. VER CALENDARIO DA SEMANA

```bash
cd ~/Documents/grupo-propagar/08-social-media-agent
npm run calendario
```

Mostra quais dias estao prontos, pendentes ou publicados.

---

## 4. PUBLICAR POST NO INSTAGRAM

### Requisitos antes de publicar:
- O video/imagem precisa estar hospedado numa URL publica
- O roteiro precisa estar preenchido no JSON (status: "pronto")

### Para publicar o post do dia:

```bash
cd ~/Documents/grupo-propagar/08-social-media-agent
npm run publicar -- semana-2026-04-14.json
```

Ele detecta o dia da semana automaticamente e publica o conteudo correspondente.

### Para publicar manualmente pelo Claude Code:

```
Publique o post de segunda no Instagram do Roberto.
Use o arquivo semana-2026-04-14.json.
O video esta em [URL DO VIDEO].
```

---

## 5. ALTERAR A BIO DO INSTAGRAM

A API do Instagram NAO permite alterar a bio programaticamente. Tem que fazer manual:

### No celular:
1. Abra o Instagram
2. Va no seu perfil > Editar perfil
3. Troque a bio para:

```
Roberto Araujo
A verdade que ninguem fala sobre negocios.
Empresarios me procuram quando cansam de conselho generico.
↓ Qual e o seu caso?
```

4. No campo "Site", coloque: `roberto-links.vercel.app`
5. Salve

### Se quiser mudar o texto da bio:
Pede pro Claude Code sugerir uma nova versao:

```
Me sugira uma nova bio pro Instagram do Roberto
baseada no posicionamento e nos resultados recentes.
```

---

## 6. ALTERAR A PAGINA DE LINKS

A pagina de links (o que aparece quando clicam na bio) e editavel:

### Pelo Claude Code:

```
Altere a pagina de links do Roberto em
07-roberto-links/index.html.
Quero [adicionar/remover/mudar] o link [X].
```

### Depois de editar, atualizar no ar:

```bash
cd ~/Documents/grupo-propagar/07-roberto-links
vercel --prod
```

O link continua o mesmo: roberto-links.vercel.app

---

## 7. RENOVAR O TOKEN (a cada 60 dias)

O token de acesso do Instagram expira. Quando as metricas derem erro de token:

### Pelo Claude Code:

```
O token do Instagram expirou.
Me ajude a renovar em 08-social-media-agent/config/instagram.json
```

### Manual:
1. Abra: https://developers.facebook.com/tools/explorer/?app_id=1263262575784689
2. Clique em "Generate Access Token"
3. Autorize (selecione a pagina Orobertoaraujo + conta orobertoaraujo)
4. Copie o novo token
5. Peca pro Claude Code atualizar o config

---

## 8. FLUXO SEMANAL RECOMENDADO

| Quando | O que fazer | Como |
|--------|------------|------|
| Domingo | Gerar o arco da semana seguinte | `npm run gerar-semana -- "tema"` + Claude Code preenche |
| Domingo | Revisar roteiros e ajustar | Abrir o HTML e ler |
| Seg-Sex | Gravar o video do dia | Ler o roteiro no HTML, gravar olhando pra camera |
| Seg-Sex | Publicar o video | Postar manual ou `npm run publicar` |
| Seg-Sex | Postar o story do dia | Seguir instrucao do HTML |
| Sabado | Ver metricas da semana | `npm run metricas` |
| Domingo | Story com pergunta (prepara proxima semana) | Usar respostas pra definir o tema do proximo arco |

---

## RESUMO RAPIDO DE COMANDOS

```bash
# Metricas
npm run metricas

# Gerar semana
npm run gerar-semana -- "tema" "data-inicio"

# Ver calendario
npm run calendario

# Publicar post do dia
npm run publicar -- semana-XXXX-XX-XX.json

# Atualizar pagina de links
cd ~/Documents/grupo-propagar/07-roberto-links && vercel --prod
```

---

## ARQUIVOS IMPORTANTES

| Arquivo | O que e |
|---------|---------|
| `08-social-media-agent/config/instagram.json` | Credenciais do Instagram (NAO compartilhar) |
| `08-social-media-agent/content/semana-*.json` | Conteudo da semana em dados |
| `08-social-media-agent/content/semana-*.html` | Conteudo da semana visual (abrir no navegador) |
| `07-roberto-links/index.html` | Pagina de links da bio |
| `POSICIONAMENTO ROBERTO/` | Posicionamento, banco de ganchos e ideias |
