# Auditoria 360 — Hub Propagar

**Data:** 2026-05-27
**Origem:** funcionários relataram "inconsistências" ao usar o Hub. Investigação para descobrir o quê.
**Escopo auditado:** protótipos HTML em `prototipos/` + `~/Roberto araujo/02-HUB-PROPAGAR/`.
**Não auditado:** código de produção Next.js/Prisma (não está neste working dir).

---

## TOP 5 — provavelmente é o que estão reclamando

1. **"Os números não batem."** MRR aparece R$ 187.420 em duas telas e R$ 184.320 em outra, no mesmo dia. Clientes ativos = 47 num lugar, lojas ativas = 28 no outro, sem diferenciação. Moeda formatada como "R$ 4.2k" aqui e "R$ 184.320" ali.
2. **"Não vejo minha carteira / vejo o que não é meu."** Gerente está vendo lojas de outros gerentes em vários endpoints (`/api/stores/picker`, `/api/stores`, `/dashboard/lojas`, `/rankings`, `/comercial/*`, `/demandas`). Em `/api/clientes` é o oposto — gerente cai em "limbo" e vê ZERO clientes mesmo tendo carteira.
3. **"Tomei ponto sem saber."** Botão "Validar — tira ponto" está direto na tela de ocorrência do cliente, misturando dossiê com punição interna. DailyMetric atrasada gera ocorrência automática sem aviso prévio.
4. **"Meu bônus veio errado."** Os 3 pilares do bônus GC (Fidelidade R$350 / Excelência / Conta Nova 50%) estão prometidos no treinamento mas NÃO modelados no schema. Folha automática e Contas-a-Pagar manual coexistem — risco de pagamento duplo.
5. **"O ranking é injusto."** Mesma pessoa aparece como Gestor de uma loja E Gerente de outra (Optix, Diego). "Optix" também é nome de cliente (Optix Óticas) — vira confusão em filtros e rankings. Dra. Fernanda aparece em "Top baixas" com +8.1% (subiu, não caiu).

---

## CRÍTICO

1. **Vazamento de permissão — Gerente enxerga tudo.** `dossie-cliente-mockup.html:656-661`. 13+ cópias inline da regra de escopo. → Centralizar em `lib/access.ts` (`getCarteiraStoreIds(user)` / `getCarteiraClienteIds(user)`).
2. **Gerente vê ZERO clientes em `/api/clientes`.** `dossie-cliente-mockup.html:660`. → Adicionar branch `gerente` à função de escopo.
3. **Ocorrência de cliente penaliza funcionário no mesmo botão.** `controle-ocorrencias.html:487, 696, 720`. Viola regra do projeto (dossiê ≠ apontamento interno). → Separar em `ClientIncident` vs `InternalAudit`.
4. **MRR aparece em 3 valores diferentes.** v2/v3: R$ 187.420 (`dashboard-hub-propagar-v2.html:412,570`; `dashboard-hub-propagar-v3-trading.html:361,556`). Dossiê: R$ 184.320 (`dossie-cliente-mockup.html:683`). → Selector/hook único, nunca hardcode.
5. **Bônus GC prometido na UI, não modelado no schema.** `treinamento-hub-propagar.html:430`. → Migration `GcBonus { type, value, period, eligibilityRule }`.

## ALTO

6. **Mesma pessoa é Gestor E Gerente simultaneamente.** Optix gerente da Rio Luz (`v3-trading:448`) e gestor da Mega Calçados (`:486`) e Launch Bauru (`:492`). Diego idem. Bônus contabilizado 2×. → Política: 1 user → 1 role por organização, ou tabela `assignment(storeId, userId, role)`.
7. **Loja com Gestor=Gerente=mesmo nome.** `v3-trading:466` "Imobi Bahia · Gestor: Darlan · Gerente: Darlan". Fallback bugado. → Validação no schema/seed.
8. **Bug de classificação:** Dra. Fernanda em "Top baixas" com +8.1%. `v3-trading:497-500`. → Ordenação por valor absoluto sem checar sinal.
9. **"Optix" = pessoa E cliente.** `v3:448, v2:512, v3-trading:486, 525; dossie:352`. → Renomear pessoa ou cliente.
10. **Terminologia "Loja" × "Cliente" × "Conta" misturada.** v2:483 "28 lojas ativas"; dossie:688 "Clientes ativos: 47"; v2:385,397 mistura "Loja gerenciada" com "Mega Calçados — contrato". → Glossário único + lint.
11. **Discrepância 28 ≠ 47** sem explicação. → Diferenciar "lojas ativas" de "clientes ativos" ou unificar.
12. **DailyMetric atrasada vira "ocorrência automática"** (`treinamento:466`) sem tela do gestor ver isso antes de virar punição. → Tela "minhas métricas hoje" + warning preventivo.

## MÉDIO

13. **CSV de permissões diz "Gerente vê todas as lojas"** (linha 2-4) contradizendo dossiê (linha 654-659). → Atualizar CSV após hardening.
14. **Formato monetário inconsistente:** "R$ 4.2k" (v2:494), "R$ 187.420" (v2:412), "R$ 28k" (v3:393), "R$ 184.320" (dossie:683). → Helper `formatCurrency(value, mode)`.
15. **`<a href="#">` no dossiê** (`:472,715,722,729,736`). → Rotear ou desabilitar visualmente.
16. **Sidebar `hub-propagar-dashboard-blue.html`** com 10+ links `href="#"` (`:733-746`).
17. **Datas em formatos diferentes:** "14/05/2026", "14 de maio · 2026", "Segunda · 25 de maio · 2026", "21.04.2026", "25/05/2026 às 12h59". → Locale único `pt-BR`.
18. **Badge "Notif" hardcoded com `3`** (`dashboard-hub-propagar-v2.html:76` via CSS `content: "3"`). Nunca atualiza.
19. **`/dashboard/folha` (automática) e `/dashboard/financeiro/contas-a-pagar` (manual) coexistem** (`hub-contas-a-pagar-fluxo.html:449-451`). Risco de pagamento duplo. → Bloquear sobreposição.

## BAIXO

20. **"Dia útil" não definido** — `treinamento:466` cobra DailyMetric sem calendário de feriados/folga.
21. **Promoção "6 meses no básico"** (`treinamento:508`) sem contagem regressiva visível no perfil.
22. **Watermark Flecha 4% opacidade** pode quebrar contraste em telas claras (v2:39-42).

---

## Plano de ação sugerido

**Sprint 1 (esta semana):**
- Hardening de permissão (#1, #2, #13) — centralizar `lib/access.ts`.
- Separar dossiê × apontamento interno (#3).
- Auditar fonte única do MRR/financeiro (#4, #11, #14).

**Sprint 2:**
- Schema `GcBonus` + UI de cálculo (#5).
- Tabela `assignment` ou política de papel único (#6, #7).
- Bloqueio folha × contas-a-pagar (#19).

**Sprint 3:**
- Glossário (#10), helper de moeda/data (#14, #17), tela de DailyMetric preventiva (#12).
- Limpeza de `href="#"` e badge hardcoded (#15, #16, #18).

**Próximo passo crítico:** dar acesso ao repo Next.js/Prisma de produção pra confirmar quais dos 22 achados já estão corrigidos vs ainda vivos.
