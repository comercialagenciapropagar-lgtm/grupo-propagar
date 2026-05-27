---
titulo: Checklist de Implementação Kommo — Propagar
operacao: Empréstimo pessoal + cobrança diária
pessoas: 18 (1 gerente + 2 supervisores + 15 operadores)
versao: 1
data: 2026-04-16
---

# Checklist de Implementação Kommo — Propagar

Ordem executável do zero ao go-live. Cada bloco depende do anterior — **não pule**.

---

## Fase 0 — Decisões fechadas antes de abrir o Kommo

Sem isso, você retrabalha tudo depois.

- [ ] Composição exata dos 17 usuários (captador / analista / cobrador / híbrido)
- [ ] Alçada de aprovação por nível (supervisor até R$X · gerente acima)
- [ ] Política de renegociação (quantas vezes, desconto máximo, quem aprova)
- [ ] Integração de recebimento escolhida (PIX Cobrança, boleto, manual)
- [ ] Decisão: Kommo é a **fonte da verdade** da carteira, ou só camada de atendimento?
- [ ] Plano Kommo escolhido (ver Fase 1.2)
- [ ] Domínio de e-mail pronto pros 18 logins (`@propagar.com.br`)
- [ ] Número central de WhatsApp Business escolhido

---

## Fase 1 — Conta e plano

### 1.1 Criar workspace Propagar
- [ ] Acessar kommo.com → criar conta com e-mail master (`roberto@propagar.com.br` ou conta de operação)
- [ ] Nomear workspace: **Propagar Crédito**
- [ ] Fuso horário: America/Manaus (ou Belém se operação for em PA)
- [ ] Moeda: BRL

### 1.2 Escolher plano
Para 18 seats, avaliar:

| Plano | Preço/user | Limita | Observação |
|---|---|---|---|
| Basic | ~US$ 15 | 1 pipeline, 100 leads/user | **Não atende** (precisa 2 pipelines) |
| Advanced | ~US$ 25 | automações, campos custom | **Mínimo viável** |
| Enterprise | ~US$ 45 | auditoria completa, SSO | Recomendado se operação > R$ 500k/mês |

- [ ] Comprar 18 seats (negociar desconto por volume — Kommo aceita)
- [ ] Ativar faturamento anual se desconto > 15%

### 1.3 Configurações básicas do workspace
- [ ] Upload de logo Propagar
- [ ] Idioma: Português
- [ ] Formato de data: DD/MM/AAAA
- [ ] Ativar 2FA obrigatório pra todos os users

---

## Fase 2 — Criar 18 usuários

### 2.1 Gerente (admin)
- [ ] Login: `roberto@propagar.com.br`
- [ ] Perfil: **Administrador**
- [ ] Acesso: total

### 2.2 Supervisores (2)
- [ ] Login: `sup-a@propagar.com.br` · Perfil **Gerente de equipe A**
- [ ] Login: `sup-b@propagar.com.br` · Perfil **Gerente de equipe B**
- [ ] Permissão: ver/editar **apenas leads do próprio time**
- [ ] Permissão: exportar relatórios do próprio time

### 2.3 Operadores (15)
- [ ] Criar `op-01@propagar.com.br` até `op-15@propagar.com.br`
- [ ] Perfil: **Usuário**
- [ ] Permissão: ver/editar **apenas os próprios leads** (campo `Operador responsável = self`)
- [ ] Atribuir ao time (A ou B) conforme divisão territorial
- [ ] Enviar convite + senha provisória por e-mail

### 2.4 Grupos (times)
- [ ] Criar grupo **Team A** · adicionar Sup A + operadores A
- [ ] Criar grupo **Team B** · adicionar Sup B + operadores B

---

## Fase 3 — Pipeline 1: Originação

### 3.1 Criar pipeline
- [ ] Nome: **Originação · Novos empréstimos**
- [ ] Criar as 6 etapas:
  1. Novo lead
  2. Contato inicial
  3. Em análise
  4. Aprovado · aguarda liberação
  5. Liberado (etapa de sucesso — cor verde)
  6. Recusado (etapa de perda — cor vermelha, motivo obrigatório)

### 3.2 Campos custom (aplicam a leads deste pipeline)
Criar em **Configurações → Campos → Leads**:

**Identificação:**
- [ ] `CPF` (texto, único, obrigatório)
- [ ] `Nome completo` (texto, obrigatório)
- [ ] `Telefone principal` (telefone, obrigatório)
- [ ] `Endereço completo` (texto multilinha)
- [ ] `Referência 1 — Nome` + `Referência 1 — Telefone`
- [ ] `Referência 2 — Nome` + `Referência 2 — Telefone`
- [ ] `Foto do cliente` (arquivo)
- [ ] `Foto do documento` (arquivo)
- [ ] `Comprovante de residência` (arquivo)

**Empréstimo:**
- [ ] `Valor solicitado` (número — na etapa 1)
- [ ] `Valor aprovado` (número — na etapa 4)
- [ ] `Taxa de juros` (número %, default conforme política)
- [ ] `Prazo` (lista: 30d / 60d / 90d / customizado)
- [ ] `Parcela diária` (número — calculado ou preenchido manualmente)
- [ ] `Data prevista de liberação` (data)

**Classificação:**
- [ ] `Score interno` (lista A/B/C/D)
- [ ] `Origem` (lista: indicação, porta, tráfego pago, recorrente)
- [ ] `N° de empréstimos anteriores` (número)
- [ ] `Motivo de recusa` (lista — obrigatório ao entrar na etapa 6)

### 3.3 Automações do Pipeline 1
- [ ] Ao criar lead: notificar operador territorial por CEP
- [ ] Ao entrar em "Em análise": tarefa para operador "Coletar 3 referências + fotos"
- [ ] Ao entrar em "Aprovado": notificar supervisor para revisão
- [ ] Ao entrar em "Liberado": criar card no Pipeline 2 (Cobrança) automaticamente
- [ ] Ao criar lead com CPF já ativo e em atraso: bloquear criação + alertar gerente

---

## Fase 4 — Pipeline 2: Cobrança Diária

### 4.1 Criar pipeline
- [ ] Nome: **Cobrança Diária · Carteira ativa**
- [ ] Criar as 7 etapas:
  1. Em dia (verde)
  2. Atrasado 1–3 dias (amarelo)
  3. Atrasado 4–7 dias (laranja)
  4. Atrasado 8–15 dias (vermelho claro)
  5. Renegociação (azul)
  6. Escalação jurídica / perda (vermelho escuro)
  7. Quitado (verde — arquivado)

### 4.2 Campos custom adicionais (além dos herdados do Pipeline 1)
- [ ] `Data de liberação` (data — preenchida automaticamente na transição)
- [ ] `Data de quitação prevista` (data)
- [ ] `Saldo devedor atual` (número — atualizado por automação)
- [ ] `Parcelas pagas` (número)
- [ ] `Parcelas totais` (número)
- [ ] `Dias em atraso` (número — calculado diário)
- [ ] `Valor em atraso` (número)
- [ ] `Última cobrança — Data` (data)
- [ ] `Última cobrança — Canal` (lista: WhatsApp, visita, ligação)
- [ ] `Motivo de atraso` (lista: desemprego, doença, esqueceu, recusa, outro)
- [ ] `Histórico de renegociações` (número)
- [ ] `Risco atual` (lista: baixo/médio/alto — derivado de dias em atraso)

### 4.3 Automações do Pipeline 2 (as 6 críticas)
- [ ] **AUTO 01** · Cron diário 06h: reduzir `Saldo devedor` pelo valor recebido
- [ ] **AUTO 02** · Ao atualizar `Dias em atraso`, mover card entre etapas 1→2→3→4 automaticamente
- [ ] **AUTO 03** · Atraso ≥ 8 dias: notificar supervisor + marcar card como urgente
- [ ] **AUTO 04** · Bloqueio de CPF inadimplente (já implementada no Pipeline 1, documentar aqui)
- [ ] **AUTO 05** · Cron diário 07h: criar tarefa "Cobrar hoje" pra cada card "Em dia"
- [ ] **AUTO 06** · Checkpoint de rota — exigir foto + geolocalização ao registrar visita

---

## Fase 5 — Integração WhatsApp via Coexistence

**Arquitetura escolhida:** cada operador mantém seu número, roda no **WhatsApp Business App (celular)** e no **Cloud API (Kommo)** simultaneamente via modo Coexistence (Meta, 2025).

### 5.1 Pré-requisitos Meta (fazer antes de tudo)
- [ ] CNPJ novo criado e ativo (destino dos 17 números)
- [ ] Meta Business Account (business.facebook.com) criada com esse CNPJ
- [ ] Verificação de negócio concluída (envio de contrato social, comprovante, prazo ~5 dias úteis)
- [ ] Meta confirma Business Account **verificada** (sem isso, Coexistence não ativa)

### 5.2 Transferência dos 17 números pro CNPJ
- [ ] Listar os 17 números atuais e os CPFs em que estão registrados
- [ ] Cada operador autoriza transferência (assinatura digital ou termo simples)
- [ ] No app Business: Configurações → Conta → Meta Business Account → vincular ao CNPJ Propagar
- [ ] Repetir pros 17 números (fazer em lotes de 5 por dia pra não estressar Meta)
- [ ] Validar que todos os 17 aparecem listados na Meta Business Account

### 5.3 Checar compatibilidade técnica
- [ ] WhatsApp Business App versão ≥ 2.24.17 em todos os celulares
- [ ] Cada número tem ≥ 7 dias de atividade recente (se for chip novo, aguardar)
- [ ] Sistema operacional dos celulares compatível (Android 5.1+ / iOS 12+)

### 5.4 Escolher BSP (Business Solution Provider)
BSPs que suportam Coexistence + Kommo no Brasil:

| BSP | Custo/número/mês | Observação |
|---|---|---|
| **Poli Digital** | ~R$ 100 | Brasileiro, suporte PT-BR, painel amigável |
| **Chatsac** | ~R$ 80 | Barato, foco em pequenas operações |
| **Take Blip** | ~R$ 200 | Robusto, caro, atende grandes volumes |
| **360Dialog** | ~R$ 100 | Europeu, integração direta Meta |

- [ ] Escolher BSP (recomendado: Poli Digital ou 360Dialog pra esse volume)
- [ ] Criar conta no BSP e vincular à Meta Business Account do CNPJ
- [ ] Confirmar que BSP suporta **Coexistence Mode** (alguns só fazem Cloud API tradicional)

### 5.5 Ativar Coexistence número a número no Kommo
Pra cada um dos 17 números:

1. [ ] No Kommo: **Settings → Integrations → WhatsApp Business → Connect via Coexistence**
2. [ ] Abre Embedded Signup do BSP → tela da Meta
3. [ ] Operador abre o app no celular → **Aparelhos Conectados** → escaneia QR
4. [ ] Confirma no celular
5. [ ] Número aparece no Kommo · mensagens começam a espelhar
6. [ ] Atribuir o número ao user Kommo do operador (ex: `op-03@propagar` dono do número X)
7. [ ] Testar: mandar uma msg pro número → verificar que aparece no Kommo em < 30 seg

### 5.6 Fluxo híbrido final
- **Conversas recebidas:** aparecem no app do celular E no Kommo simultaneamente
- **Operador responde pelo celular:** resposta espelha no Kommo (grátis Meta, vai pelo app)
- **Operador/gerente responde pelo Kommo Web:** vai via Cloud API (conta como conversa Meta, pode gerar custo)
- **Histórico:** tudo salvo no Kommo, indexável, pesquisável
- **Supervisão:** gerente entra em qualquer conversa de qualquer operador

### 5.7 Custo mensal esperado
| Item | Valor |
|---|---|
| Kommo Advanced (18 seats) | ~R$ 2.700 |
| BSP Coexistence (17 × R$ 100) | ~R$ 1.700 |
| Meta fees (conversas iniciadas via API) | ~R$ 300 |
| **Total** | **~R$ 4.700/mês** |

### 5.8 O que Coexistence NÃO resolve
- [ ] Ban continua sendo risco **comportamental** (volume, repetição, bloqueio do cliente)
- [ ] Proteção real anti-ban: humanizar envio, não disparar em massa, respeitar opt-out
- [ ] Plano B: se número cair, ter chip reserva já verificado no Meta Business pra rotação rápida

---

## Fase 6 — Relatórios e dashboards

### 6.1 Dashboards por perfil

**Gerente:**
- [ ] Carteira ativa total (R$, n° clientes)
- [ ] PAR (Portfolio at Risk) — 1d, 7d, 30d
- [ ] Taxa de recebimento diária (esperado vs. recebido)
- [ ] Ranking de operadores
- [ ] Inadimplência por origem

**Supervisor:**
- [ ] Carteira do time
- [ ] PAR do time
- [ ] Rota do dia por operador
- [ ] Alertas de atraso > 7 dias

**Operador:**
- [ ] Minha carteira (só os próprios clientes)
- [ ] Tarefas do dia (cobranças previstas)
- [ ] Minhas últimas visitas (foto + geo)

### 6.2 Relatórios exportáveis
- [ ] Carteira ativa (CSV semanal)
- [ ] Recebimentos por operador (CSV mensal)
- [ ] Inadimplência histórica (CSV mensal)

---

## Fase 7 — LGPD e compliance

- [ ] Termo de consentimento LGPD no 1º contato (template em PDF no card)
- [ ] Política de retenção: quanto tempo guardar dados de clientes inadimplentes
- [ ] Processo de exclusão por solicitação do titular (responsável: gerente)
- [ ] Backup semanal exportado do Kommo → armazenamento próprio
- [ ] Contrato de tratamento de dados com Kommo (DPA) assinado

---

## Fase 8 — Treinamento

### 8.1 Playbook do operador (criar em PDF)
- [ ] Como criar lead novo (docs obrigatórios)
- [ ] Como registrar cobrança (canal + resultado)
- [ ] Como solicitar renegociação ao supervisor
- [ ] Proibido: editar campos de outro operador, criar lead sem foto, fechar lead como recusado sem motivo

### 8.2 Playbook do supervisor
- [ ] Rotina diária de auditoria (1h da manhã)
- [ ] Aprovação de renegociação
- [ ] Escalonamento ao gerente

### 8.3 Sessões de treino
- [ ] Sessão 1 (2h): operadores — criação de lead e cobrança
- [ ] Sessão 2 (1h): supervisores — auditoria e aprovações
- [ ] Sessão 3 (30min): gerente — relatórios

---

## Fase 9 — Go-live

### 9.1 Piloto (semana 1)
- [ ] 2 operadores piloto (1 de cada time) usam o Kommo com carteira real
- [ ] Resto da operação continua no sistema atual
- [ ] Reunião diária de ajuste (15 min)

### 9.2 Rollout (semana 2–3)
- [ ] Migrar +5 operadores por dia
- [ ] Validar que dados estão chegando corretos
- [ ] Registrar bugs/ajustes em planilha

### 9.3 Full (semana 4)
- [ ] 100% da operação no Kommo
- [ ] Sistema antigo em modo read-only por 30 dias (rollback)
- [ ] Gerente aprova desativação do sistema antigo

### 9.4 Plano de rollback
- [ ] Export diário do Kommo nos primeiros 30 dias (pra poder voltar)
- [ ] Contato direto com suporte Kommo (SLA de resposta)
- [ ] Se falha crítica: sistema antigo reabre em < 2h

---

## Fase 10 — Pós go-live (30–90 dias)

- [ ] Revisar automações (o que está disparando demais / de menos)
- [ ] Auditoria de campos não preenchidos (quais campos são ignorados na prática)
- [ ] Revisar permissões (alguém está esbarrando em "não tenho acesso"?)
- [ ] Calcular ROI: custo Kommo vs. inadimplência reduzida + produtividade ganha
- [ ] Decidir: manter Kommo, migrar pra Hub Propagar próprio, ou híbrido

---

## Anexos

- Mapa visual: `prototipos/mapa-kommo.html`
- Mapa técnico: `prototipos/mapa-kommo.md`
- Playbook do operador: **criar após Fase 8.1**
- Playbook do supervisor: **criar após Fase 8.2**
