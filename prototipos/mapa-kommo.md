---
titulo: Operação Kommo — Propagar (empréstimo + cobrança diária)
versao: 2
data: 2026-04-16
---

# Operação Kommo — Propagar

**Operação:** empréstimo pessoal com parcela diária. Mapa do time, pipelines e campos custom pra implementar o Kommo corretamente.

> **Mudança vs. versão anterior:** o protótipo v1 desenhava funil de vendas (lead → proposta → fechado). A operação real é ciclo de **originação + cobrança diária**, não venda. Estrutura e campos foram refeitos.

---

## 1. Estrutura humana — 18 pessoas

```
OPERAÇÃO (18 pessoas)
│
├─ GERENTE (1) — Roberto
│   · Meta global de carteira, P&L
│   · Política de crédito (limite, taxa, prazo)
│   · Aprovação acima do teto de alçada
│   · Comissionamento
│   Acesso Kommo: admin geral
│
├─ SUPERVISORES (2)  [AJUSTAR se a composição real for outra]
│   · Daily com operadores
│   · Auditoria de rota e de registros de cobrança
│   · 1ª escalação (cliente difícil, renegociação)
│   · Controle de PAR (Portfolio at Risk) do time
│   Acesso Kommo: leitura/edição do time sob supervisão
│
└─ OPERADORES DE CAMPO (15)  [AJUSTAR composição — captador/analista/cobrador]
    · Cada um com carteira territorial
    · Responsável por: captação, análise inicial, cobrança diária da própria carteira
    Acesso Kommo: user individual, vê apenas a própria carteira
```

> **[AJUSTAR]** Me confirma a composição real dos 17. A estrutura acima assume modelo "cobrador-captador híbrido" (cada operador cobre ponta a ponta na sua área). Se tiver captadores separados de cobradores, a divisão de permissões muda.

---

## 2. Seats no Kommo — 18 logins individuais

| Login | Dono | Permissão |
|---|---|---|
| `roberto@propagar.com.br` | Gerente | Admin |
| `sup-a@propagar.com.br` | Supervisor A | Gerente de equipe (Team A) |
| `sup-b@propagar.com.br` | Supervisor B | Gerente de equipe (Team B) |
| `op-01@propagar.com.br` … `op-15@propagar.com.br` | 15 operadores | Usuário restrito à própria carteira |
| **Total** | | **18 seats** |

**Por que 18 seats individuais e não login compartilhado:**
- **Jurídico/LGPD** — cobrança de dívida exige prova de quem contatou, quando, o que falou. Login compartilhado anula prova em disputa.
- **Auditoria** — saber quem marcou "pagou", quem alterou valor, quem renegociou.
- **Comissão** — atribuição automática por user, não por campo manual.
- **ToS do Kommo** — login compartilhado viola os Termos, risco de ban.
- **Sessões simultâneas** — 17 pessoas no mesmo login = logout constante em horário de pico.

---

## 3. Pipelines — 2 funis macro

A operação tem **dois ciclos distintos** que NÃO devem estar no mesmo pipeline (confundem relatório e permissão):

### 3.1 Pipeline "Originação" (cliente novo → empréstimo liberado)

| # | Etapa | O que acontece |
|---|---|---|
| 1 | **Novo lead** | Entrou pelo WhatsApp, indicação, porta, tráfego |
| 2 | **Contato inicial** | Operador enviou 1ª mensagem ou visitou |
| 3 | **Em análise** | Coletou docs, ref pessoal, endereço, score interno |
| 4 | **Aprovado · aguardando liberação** | Supervisor OK, aguarda desembolso |
| 5 | **Liberado** | Dinheiro entregue → move pro pipeline **Cobrança** |
| 6 | **Recusado** | Motivo obrigatório (score, documento, histórico) |

Ao chegar em **Liberado**, automação cria card no pipeline de Cobrança e arquiva este.

### 3.2 Pipeline "Cobrança Diária" (cliente ativo → quitado/write-off)

| # | Etapa | Trigger |
|---|---|---|
| 1 | **Em dia** | Parcela diária sendo paga no prazo |
| 2 | **Atrasado 1–3 dias** | Automático quando `Dias em atraso >= 1` |
| 3 | **Atrasado 4–7 dias** | Automático quando `Dias em atraso >= 4` |
| 4 | **Atrasado 8–15 dias** | Automático + notifica supervisor |
| 5 | **Renegociação** | Manual — novo acordo de parcela |
| 6 | **Escalação jurídica / perda** | > 30 dias, manual, gerente aprova |
| 7 | **Quitado** | Último pagamento recebido (final feliz) |

---

## 4. Campos custom obrigatórios (por lead)

### Identificação do cliente
- `CPF` (único — evita cliente duplicado)
- `Nome completo`
- `Telefone principal` (WhatsApp)
- `Endereço completo` (rua, número, bairro, referência)
- `Referência 1` (nome + telefone)
- `Referência 2` (nome + telefone)
- `Foto do cliente` (upload) — pra reconhecimento em rota
- `Foto do documento`
- `Foto do comprovante de residência`

### Dados do empréstimo
- `Valor emprestado` (R$)
- `Taxa de juros` (%)
- `Prazo` (dias — ex: 30, 60, 90)
- `Parcela diária` (R$)
- `Data de liberação`
- `Data de quitação prevista`
- `Saldo devedor atual` (calculado — automação atualiza diário)
- `Parcelas pagas / Parcelas totais` (ex: 12/30)

### Cobrança
- `Operador responsável` (user Kommo — derivado automaticamente do criador)
- `Dias em atraso` (atualizado por automação)
- `Valor em atraso` (R$)
- `Última cobrança registrada` (data + canal: whatsapp/visita/ligação)
- `Motivo de atraso` (dropdown: desemprego, doença, esqueceu, recusa, outro)
- `Histórico de renegociações` (contador)

### Classificação
- `Score interno` (A/B/C/D)
- `Origem` (indicação, porta, tráfego, recorrente)
- `N° de empréstimos anteriores` (cliente recorrente)
- `Risco atual` (baixo/médio/alto — derivado de dias em atraso)

---

## 5. Automações críticas

1. **Atualização diária do saldo** — cron diário reduz `Saldo devedor` pelo valor da `Parcela diária` quando marcado como recebido.
2. **Escalonamento automático de atraso** — move card entre as etapas 1→2→3→4 baseado em `Dias em atraso`.
3. **Notificação ao supervisor** — ao atingir 8 dias de atraso, dispara notificação pro supervisor do operador.
4. **Bloqueio de novo empréstimo com CPF inadimplente** — ao criar lead com CPF já ativo em Cobrança com atraso > 3 dias, bloqueia e notifica gerente.
5. **Tarefa diária recorrente** — cada cliente em "Em dia" gera tarefa "Cobrar hoje" pro operador responsável, às 07h.
6. **Checkpoint de rota** — operador registra foto/geolocalização ao marcar visita (auditoria + prova).

---

## 6. Integração WhatsApp — arquitetura Coexistence

**Decisão:** cada operador mantém seu próprio número (cliente já tem o contato), e cada número roda simultaneamente no **WhatsApp Business App (celular)** e na **Cloud API (Kommo)** via o modo **Coexistence** lançado pela Meta em 2025.

### Como funciona
```
[Cliente] ──mensagem──▶ [Número do operador]
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
       [App no celular]              [Cloud API → Kommo]
       (operador usa                 (gerente supervisiona,
        normalmente)                  histórico fica salvo)

         ↕ mensagens espelham automaticamente ↕
```

- Operador continua respondendo pelo app do celular (comportamento atual preservado)
- Gerente entra no Kommo e vê todas as conversas de todos os 17 operadores
- Se operador sai, o número fica na conta Meta da empresa (CNPJ Propagar) → histórico permanece, número transfere pro próximo
- Sem perda de conversa, sem mudança de hábito

### Pré-requisitos
- [x] Número ativo no WhatsApp Business App há ≥ 7 dias com atividade recente
- [x] App versão 2.24.17 ou superior em todos os celulares
- [ ] **Meta Business Account verificada no CNPJ da Propagar** (passo crítico — sem CNPJ verificado, Coexistence não ativa)
- [ ] Todos os 17 números registrados na Meta Business Account do CNPJ
- [ ] BSP contratado que suporta Coexistence + Kommo (Poli Digital, Chatsac, Take Blip, 360Dialog)

### Ativação número a número
1. No Kommo: Settings → Integrations → WhatsApp Business → Coexistence
2. Embedded Signup do BSP abre tela Meta
3. Operador abre o app no celular → Aparelhos Conectados → escaneia QR code
4. Confirma no celular
5. Número aparece no Kommo, mensagens começam a espelhar
6. Repetir pros 17

### Custo estimado mensal
| Item | Valor |
|---|---|
| Kommo Advanced (18 seats) | ~R$ 2.700 |
| BSP Coexistence (17 números) | ~R$ 1.700 |
| Meta fees (só envios via API) | ~R$ 300 |
| **Total** | **~R$ 4.700** |

Mensagens enviadas pelo app do celular são **grátis** na Meta — só paga conversa iniciada via Cloud API (templates, automações). Como o grosso vai continuar sendo manual pelo operador, o custo Meta fica baixo.

### O que Coexistence resolve
- ✅ Histórico centralizado no Kommo
- ✅ Supervisão do gerente (vê todas as conversas)
- ✅ App continua no celular dos operadores (zero mudança de hábito)
- ✅ Continuidade quando operador sai (número no CNPJ)

### O que Coexistence NÃO resolve
- ❌ Ban por comportamento (volume, mensagem repetida, bloqueio do cliente) — isso continua igual
- ❌ A solução pra ban é comportamental: humanizar envio, respeitar opt-out, não mandar texto idêntico pra muitos clientes

---

## 7. Relatórios essenciais (gerente)

1. **Carteira ativa por operador** (n° clientes, valor emprestado, saldo devedor)
2. **PAR (Portfolio at Risk)** — % da carteira com atraso > 1 dia, > 7 dias, > 30 dias
3. **Taxa de recebimento diária** — esperado vs. recebido
4. **Inadimplência por origem** — qual canal de captação traz mais calote
5. **Performance por operador** — carteira, recebimento, inadimplência
6. **Cliente recorrente** — % da carteira que é 2º+ empréstimo (indicador de qualidade)

---

## 8. O que ficou de fora (decisões pendentes)

- [ ] Composição exata dos 17 usuários (captadores vs. cobradores vs. analistas)
- [ ] Alçada de aprovação de cada nível (supervisor libera até R$X, gerente acima)
- [ ] Política de renegociação (até quantas vezes, qual desconto máximo)
- [ ] Integração com sistema de pagamento (PIX Cobrança? Boleto? Recebimento manual em dinheiro?)
- [ ] Onde mora a fonte da verdade: **Kommo** ou sistema próprio + Kommo como camada de atendimento?
- [ ] Backup de dados: extração semanal do Kommo para planilha/banco próprio

---

## 9. Referências cruzadas

- Checklist de implementação passo-a-passo: `prototipos/kommo-checklist.md`
- Protótipo visual: `prototipos/mapa-kommo.html`
- Projeto relacionado (possível fonte da verdade futura): `06-girou-credito/` e `cobrai-app` (migrado pra repo privado)
