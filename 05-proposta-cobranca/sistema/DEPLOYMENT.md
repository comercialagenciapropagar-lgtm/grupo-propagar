# Deploy em Producao (Render) — Cobrai.app

## Regra de ouro: A ORDEM IMPORTA

Se voce fizer deploy do codigo novo ANTES de configurar os env vars novos no Render, o servidor **nao sobe** (tem validacao no startup que derruba o processo). Resultado: cobrancas paradas ate voce arrumar.

**Ordem correta:**

1. ✅ Rodar migration SQL no Supabase
2. ✅ Adicionar os 4 env vars novos no Render
3. ✅ Push do codigo pra GitHub (Render auto-deploya)
4. ✅ Monitorar o deploy no dashboard do Render
5. ✅ Testar `/api/health` na URL de producao
6. ✅ Configurar UptimeRobot apontando pra `/api/health`

---

## Passo 1 — Migration no Supabase

Abre o SQL Editor do projeto `ffxhlduaedkirzmrxdsz` em https://supabase.com/dashboard e cola o arquivo:

```
supabase/migration_seguranca.sql
```

Isso cria:
- Coluna `cobranca_pausada` em `clientes`
- Tabela `audit_log`
- Tabela `feriados` com seed 2026 e 2027

Idempotente — pode rodar varias vezes. Ate voce rodar isso, as features novas degradam sem quebrar (blocklist vira no-op, audit log silenciosamente ignorado, feriados vira lista vazia).

---

## Passo 2 — Env vars no Render

Entra em https://dashboard.render.com → seu service → **Environment** → **Add Environment Variable**.

Copie os valores do arquivo `.env` local (nao comite eles!):

| Nome | Origem | Uso |
|---|---|---|
| `JWT_SECRET` | `.env` linha JWT_SECRET | Assina tokens de login |
| `ASAAS_WEBHOOK_TOKEN` | `.env` linha ASAAS_WEBHOOK_TOKEN | Valida webhooks Asaas |
| `CORS_ORIGIN` | URL de producao: `https://SEU-DOMINIO.onrender.com` | Libera o dashboard |
| `AUTH_USERS_JSON` | `.env` linha AUTH_USERS_JSON | Usuarios + bcrypt hash das senhas |

**⚠️ IMPORTANTE:** o valor de `AUTH_USERS_JSON` contem aspas duplas. Render trata texto cru — cole o valor inteiro como esta no `.env`, sem modificar.

### Atualizar o webhook no painel do Asaas

No dashboard do Asaas:
1. Configuracoes → Integracoes → Webhooks
2. Edita o webhook que aponta pra `/webhooks/asaas`
3. No campo **Token** (ou header `asaas-access-token`), cola o mesmo valor de `ASAAS_WEBHOOK_TOKEN`

Sem isso, o webhook comeca a retornar 401 e os pagamentos nao sao confirmados automaticos.

---

## Passo 3 — Deploy do codigo

Ja autenticado no gh cli? Sim (verificado). Entao:

```bash
cd /Users/robertoaraujo/Documents/grupo-propagar
git add 05-proposta-cobranca/sistema
git commit -m "Endurecimento CobraAI: JWT, webhook, humanizador, backup, kill switch"
git push origin main
```

Render detecta o push e inicia auto-deploy. Acompanha em Dashboard → Deploys.

### Se o deploy falhar

O proprio Render mostra o log. Os erros tipicos de startup sao:

| Erro no log | Causa | Solucao |
|---|---|---|
| `JWT_SECRET nao definido` | env var ausente | Volta ao Passo 2 |
| `ASAAS_WEBHOOK_TOKEN nao definido` | idem | idem |
| `AUTH_USERS_JSON vazio` | env var ausente ou JSON quebrado | Colar o valor do `.env` inteiro |
| Webhook Asaas retornando 401 | Token nao atualizado no painel Asaas | Atualizar no Asaas |

### Rollback rapido

Se algo der errado e voce precisar voltar ao estado anterior **rapido** (cobrancas continuam funcionando):

1. No dashboard do Render: **Deploys** → escolhe o deploy anterior (verde) → **Rollback to this deploy**
2. Render sobe o codigo antigo em ~1 min
3. Tira os env vars novos que voce adicionou (nao causa nada se ficarem, mas deixa limpo)
4. Investiga o problema no local antes de tentar de novo

---

## Passo 4 — Validar producao

Apos o deploy estar verde, testa:

```bash
# Health check (publico)
curl https://SEU-DOMINIO.onrender.com/api/health

# Login (substitui SUA-SENHA pela real)
curl -X POST https://SEU-DOMINIO.onrender.com/api/login \
  -H 'Content-Type: application/json' \
  -d '{"usuario":"orobertoaraujo","senha":"SUA-SENHA"}'
```

Esperado:
- `/api/health` → `{"sistema":"online","supabase":"ok","whatsapp":"ok"|"desconectado"}`
- `/api/login` → `{"token":"eyJ...","nome":"Roberto Araujo",...}`

Ai entra no dashboard pela URL de producao e faz login normalmente.

---

## Passo 5 — Monitoramento (UptimeRobot)

Sem monitoring, o sistema pode estar fora do ar e voce nao sabe ate o cliente reclamar. Configure em 5 minutos:

1. Cria conta gratis em https://uptimerobot.com
2. **Add New Monitor**
3. Tipo: **HTTP(s)**
4. Friendly Name: **Cobrai.app Health**
5. URL: `https://SEU-DOMINIO.onrender.com/api/health`
6. Monitoring Interval: **5 minutes** (gratis)
7. Alert Contacts: seu email + WhatsApp (plano pago se quiser SMS)

Quando o `/api/health` retornar 500+ por 2 checagens seguidas, voce recebe email/whatsapp. Ai da tempo de arrumar antes de virar problema.

---

## Kill Switch de Emergencia

Se algo der muito errado (ex: template quebrado indo pra milhares de clientes), da pra pausar **todo** o sistema sem derrubar o server:

```bash
TOKEN=$(curl -s -X POST https://SEU-DOMINIO.onrender.com/api/login -H 'Content-Type: application/json' -d '{"usuario":"orobertoaraujo","senha":"SUA-SENHA"}' | jq -r .token)

curl -X PUT https://SEU-DOMINIO.onrender.com/api/sistema/pausar \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"motivo":"investigando template quebrado"}'
```

Isso grava `sistema_pausado=true` no Supabase. Todos os crons respeitam essa flag — nao geram cobrancas nem disparam WhatsApp. Para voltar:

```bash
curl -X PUT https://SEU-DOMINIO.onrender.com/api/sistema/retomar -H "Authorization: Bearer $TOKEN"
```

O cache em memoria demora ate 30s para invalidar, entao apos pausar aguarde 30s antes de assumir que tudo parou.

---

## Checklist final pre-deploy

- [ ] Migration SQL rodada no Supabase
- [ ] Env vars `JWT_SECRET`, `ASAAS_WEBHOOK_TOKEN`, `CORS_ORIGIN`, `AUTH_USERS_JSON` configurados no Render
- [ ] Webhook token atualizado no painel do Asaas
- [ ] Senhas diferentes de `1234` para cada usuario (gerar hash com `node -e "console.log(require('bcryptjs').hashSync('NOVASENHA', 10))"` e atualizar `AUTH_USERS_JSON`)
- [ ] `CORS_ORIGIN` aponta para o dominio real de producao
- [ ] Push pra GitHub feito
- [ ] Deploy do Render verde
- [ ] `/api/health` retornando 200 na URL de producao
- [ ] Login funciona com as novas senhas
- [ ] UptimeRobot configurado
- [ ] Um backup manual disparado pos-deploy (confirma que `git push` do backup funciona no Render — pode precisar de SSH deploy key)

---

## Atencao especial: Backup no Render

O script de backup faz `git push` pra `cobrai-backups`. No Render:

- O container e read-only em filesystem persistente, entao `backups/` desaparece a cada deploy
- `git push` precisa de chave SSH autenticada no container

Duas opcoes:

### Opcao A — Tira o backup do Render, roda em outro lugar

Recomendado. O backup nao precisa rodar no mesmo processo que faz o dispatch de mensagens. Duas alternativas:

1. **Rodar o backup no seu Mac via cron local:**
   ```bash
   crontab -e
   # adiciona:
   0 3 * * * cd /Users/robertoaraujo/Documents/grupo-propagar/05-proposta-cobranca/sistema && /usr/local/bin/npm run backup >> /tmp/cobrai-backup.log 2>&1
   ```
   Problema: so funciona se o Mac estiver ligado as 3h da manha.

2. **GitHub Action diaria:** cria `.github/workflows/backup.yml` que usa as credenciais do Supabase armazenadas em GitHub Secrets e faz o dump. Roda na infra do GitHub, nao depende do seu Mac nem do Render.

### Opcao B — Deixa rodar no Render mas aceita falhas

Render pode rodar o cron de backup, mas o push git vai falhar (sem chave SSH). O backup local vai existir por algumas horas dentro do container ate o proximo deploy. **Nao serve como backup real** — o dump e feito mas desaparece rapido.

---

## Quando bater duvida

- **Cobrancas nao rodaram hoje:** checar log do Render por entrada `[Scheduler] === HH:MM ===`. Se faltou, checar se sistema nao esta pausado (`GET /api/sistema/estado`). Se esta ok, checar se e feriado na tabela `feriados`.
- **Cliente reclamou que recebeu mensagem quebrada (`{{nome}}` literal):** o lint deveria ter bloqueado. Verificar log por `Mensagem com problema de template` — vai ter o problema exato.
- **WhatsApp desconectou:** `/api/health` retorna `whatsapp: "desconectado"`. Precisa reconectar a Evolution API — log no painel dela.
- **Pagamento confirmado no Asaas mas nao marcou como pago:** webhook provavelmente retornando 401. Verificar token no Asaas vs Render.
