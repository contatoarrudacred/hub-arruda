# Spec — Agendamento com consultor (leads de alto valor / pacote caro)

> Pedido de Luiz, 20/08/2026. Alinhado em conversa antes de codar — ver resumo das decisões na seção 8.

## 1. Contexto e os 2 gatilhos

Hoje, quando a dívida (restrição) de um lead ultrapassa R$500 mil (`ln_passo15_alto_valor`), a Malala só oferece "call" vs "seguir por WhatsApp" — se ele topa a call, ela diz "vou avisar nosso especialista" e escala pra supervisor, sem agendar nada de verdade. Vamos substituir isso por um fluxo real de agendamento, com 2 gatilhos:

- **Gatilho A — dívida alta (já existe, só falta o menu explícito):** `classificarAltoValor` já compara `documentos_valores` contra `limpanome_corte_alto_valor`, já configurado em produção como **R$500.000**. Falta só uma opção explícita no menu do `ln_passo6` pra quando o lead sabe que é mais de 500 mil mas não sabe o valor exato.
- **Gatilho B — pacote caro (novo):** quando o **preço que o lead pagaria pela ArrudaCred** (não a dívida — a soma das faixas do pacote, `combinarFaixasPacote`) ultrapassa **R$8.000**, mesmo sem nenhum documento individualmente "alto valor". Implementa a pendência já registrada e nunca construída ("Fase 5: oferta de conversa com gerente comercial quando a Malala perceber oportunidade de desconto de pacote") — mesmo mecanismo de agendamento serve pros dois casos, só muda o motivo que a Malala menciona.

Os dois gatilhos convergem pro **mesmo checkpoint de oferta de agendamento** (seção 3).

## 2. Menu do `ln_passo6` — nova opção "Acima de 500 mil"

Hoje `formatarMenuFaixas` lista as 5 faixas de `precos_por_faixa` (nenhuma tem `faixaMax: null`, então o rótulo "Acima de X" nunca aparece de verdade). A opção nova **não vira uma linha em `precos_por_faixa`** (não tem preço fixo) — é um item virtual, sempre por último no menu, com o mesmo estilo visual:

```
1️⃣ Menos de 10 mil
2️⃣ Entre 10 e 30 mil
3️⃣ Entre 30 e 50 mil
4️⃣ Entre 50 e 100 mil
5️⃣ Entre 100 e 500 mil
6️⃣ Acima de 500 mil
```
(exemplo com as 5 faixas reais de hoje — a opção virtual sempre ocupa `faixas.length + 1`, nunca um número fixo. Se alguém adicionar/remover faixa em `/admin/precos`, a posição dela desliza sozinha, recalculada a cada mensagem gerada — **nunca hardcoded**, pedido explícito do Luiz, 20/08/2026.)

- `formatarMenuFaixas` ganha um parâmetro pra anexar essa linha extra (não mexe na assinatura de quem só quer o menu real, mas quem chama do `ln_passo6` passa `incluirOpcaoAltoValor: true`) — a posição/emoji são calculados a partir de `ordenarFaixasPreco(faixas).length`, igual ao resto do menu já faz pras outras linhas.
- `criarInterpretadorFaixasDocumentos` passa a reconhecer a escolha dessa opção (número certo, ou texto livre tipo "mais de 500 mil"/"não sei mas é bem mais que isso") como um **novo status** em `ResultadoInterpretacaoFaixasDocumentos`: `{ status: "acima_do_corte" }`.
- **Decisão confirmada com Luiz:** escolher essa opção em **qualquer** documento do pacote encerra a coleta de faixas imediatamente — não faz sentido perguntar a faixa dos outros documentos pra somar com um valor que não existe. O `engine.ts` trata `acima_do_corte` pulando direto pro checkpoint de oferta de agendamento (seção 3), sem passar por `ln_passo15_router`/precificação normal.
- Valor gravado em `dados` pra fins de auditoria/painel: reaproveita o mesmo padrão já usado em `resolverValorRestricao` pro caso "não consigo converter" — grava `600000` (não é exibido pro lead, só entra no cálculo interno e no painel da Tela de Atendimento).

## 3. Checkpoint novo — oferta de agendamento (`ln_agendamento_oferta`)

Chegada por 2 caminhos (gatilho A via `acima_do_corte` no `ln_passo6`, gatilho B via preço do pacote > R$8.000 depois de calculado em `ln_passo15_router`) — mensagem dinâmica, motivo varia:

- Gatilho A: "Pelo que você me contou, essa dívida é um valor mais alto — nesses casos, quem te atende é um consultor especializado, não eu."
- Gatilho B: "Como esse é um pacote maior, quem cuida da negociação nesses casos é um consultor especializado, não eu."

Depois do motivo, sempre a mesma pergunta — menu de 2 opções:
```
1️⃣ Sim, quero agendar uma ligação/vídeo-chamada
2️⃣ Prefiro continuar por aqui mesmo
```

- Opção 1 → `ln_agendamento_horario` (seção 4).
- Opção 2 → reaproveita o texto/comportamento do `ln_call_agendada` atual ("vou avisar nosso especialista, ele continua com você por aqui assim que possível") — encerra com `sob_supervisor: true`, sem agendamento.

## 4. Checkpoint novo — escolha de horário (`ln_agendamento_horario`)

Mensagem dinâmica calculada por `criarResolverMensagensDinamicas`, oferecendo **sempre 2 horários**, sorteados em dias/turnos diferentes quando possível (algoritmo na seção 5):

```
Consigo te encaixar em um desses horários com nosso consultor:

1️⃣ Hoje (20/08), às 15h
2️⃣ Amanhã (21/08), às 10h

Qual prefere? Se nenhum funcionar, me avisa que vejo outra opção com ele.
```

- Lead escolhe 1 ou 2 (ou texto livre "prefiro amanhã de manhã", interpretado por IA igual aos outros menus) → grava o agendamento (seção 6) e confirma:
  > "Perfeito! Agendado com nosso consultor pra [dia] às [hora]. Ele já foi avisado e vai te chamar nesse horário. 🙋‍♂️"
- Encerra com `sob_supervisor: true` (mesmo padrão do `ln_call_agendada`) — a conversa fica pronta pro humano assumir, o agendamento em si só dispara a notificação, não muda quem controla o chat antes da hora marcada.
- Se o lead recusar as 2 opções, cai no mesmo texto de "vou avisar o consultor, ele vê outro horário com você" (sem repetir infinitamente — mesmo padrão de escalar depois de N tentativas já usado em outros pontos do motor).

## 5. Cálculo de horários disponíveis

Função pura (testável, sem I/O) — dado:
- `disponibilidade: { diaSemana: 0-6; inicio: "HH:mm"; fim: "HH:mm" }[]` (config do atendente, seção 7)
- `agendamentosExistentes: { inicio: Date; fim: Date }[]` (já confirmados, do mesmo atendente)
- `duracaoMinutos = 60` (fixo por enquanto, parametrizável — Luiz confirmou 1h como padrão)
- `agora: Date`

Devolve até 2 horários válidos, day+turno diferentes quando possível, dentro da janela **hoje até hoje+1** (nunca além disso — "concluir até as 22h"/"até as 16h" já é a régua, não precisa de campo novo pra isso), pulando domingo, sem sobrepor `agendamentosExistentes`. Slots começam em horas cheias (10h, 11h, 12h...) dentro da janela do dia.

## 6. Grava o agendamento + notifica (efeito de negócio novo)

Novo `EfeitoNegocio`: `{ tipo: "agendar_consultor"; consultorId: string; inicio: string; fim: string }` — executado em `persistencia.ts` (mesmo padrão de `escalar_supervisor`):
1. Insere em `agendamentos_consultor` (seção 7).
2. Insere em `notificacoes` (`tipo: "agendamento"`, `agendamento_id` preenchido) — acende o sino que já existe.
3. Marca a conversa `sob_supervisor: true` (efeito já existente, não muda).

**Quem é "o consultor"?** Hoje só existe um: Luiz. Resolvido fixo por enquanto (primeiro `usuarios_sistema` com uma flag `eh_consultor = true`, migration semeia `true` pro usuário dele) — não constrói seleção/distribuição entre vários consultores agora (YAGNI, ele mesmo disse "atualmente sou só eu").

## 7. Modelo de dados (2 tabelas novas + 1 coluna)

```sql
create table disponibilidade_atendente (
  id uuid primary key default gen_random_uuid(),
  usuario_sistema_id uuid not null references usuarios_sistema(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6), -- 0=domingo
  hora_inicio time not null,
  hora_fim time not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- semente pro Luiz: seg-sex 10:00-21:00, sáb 10:00-15:00, sem domingo (default pedido por ele)

create table agendamentos_consultor (
  id uuid primary key default gen_random_uuid(),
  usuario_sistema_id uuid not null references usuarios_sistema(id) on delete cascade,
  conversa_id uuid not null references conversas(id) on delete cascade,
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'confirmado', -- confirmado | cancelado
  lembrete_15min_enviado boolean not null default false,
  lembrete_hora_enviado boolean not null default false,
  motivo text not null, -- "divida_alta" | "pacote_caro", pro consultor saber o contexto sem abrir a conversa
  created_at timestamptz not null default now()
);

alter table usuarios_sistema add column eh_consultor boolean not null default false;
alter table notificacoes add column agendamento_id uuid references agendamentos_consultor(id) on delete cascade;
```

RLS igual ao padrão já usado em toda tabela nova do admin (`admin_acesso_total`, `for all to authenticated`) + trigger de auditoria.

## 8. Notificação e lembrete (decisões confirmadas com Luiz)

- **No momento do agendamento:** sino + notificação (reaproveita o sistema de `notificacoes` já existente, tipo novo `"agendamento"`).
- **15 minutos antes E na hora marcada:** modal que aparece em **qualquer tela** do admin, não só na de Atendimento — mora no layout raiz (`src/app/admin/(shell)/layout.tsx`), com um polling leve (a cada ~30s, reaproveitando o padrão de polling já usado pro sino) checando se há algum `agendamentos_consultor` do usuário logado cruzando a marca de 15min-antes ou da hora exata, ainda não avisado (`lembrete_15min_enviado`/`lembrete_hora_enviado`).
- **Tela de agenda:** lista simples (não calendário visual) dos agendamentos do usuário logado — passados e futuros, com status. Sem biblioteca de calendário (nenhuma instalada hoje, e não é necessária pro formato "lista").
- **Onde configurar a disponibilidade:** estende `/admin/atendentes` (tela que já existe, por usuário) em vez de criar uma tela nova — cada atendente marcado como `eh_consultor` ganha uma seção de "Disponibilidade" ali.

## 9. Fora de escopo (registrado, não construído agora)

- Múltiplos consultores / distribuição de agendamento entre eles (só Luiz existe hoje).
- Duração de reunião variável (fixo 1h, parametrizável só se virar pedido real).
- Integração com Google Calendar/Outlook — o "consultor" só vê dentro do nosso admin.
- Cancelamento/reagendamento pelo lead via WhatsApp depois de confirmado (se precisar remarcar, é manual por enquanto).

## 10. Plano de implementação (visão geral, tasks detalhadas ficam no plano)

1. Migrations (seção 7).
2. `regras-limpeza-nome.ts`: opção virtual no menu + `formatarMenuFaixas` com flag.
3. `interpretar-faixas-documentos.ts`: novo status `acima_do_corte`.
4. `tipos.ts`: novo `EfeitoNegocio` (`agendar_consultor`), novo status no resultado de faixas.
5. Módulo puro novo `agenda-consultor.ts`: cálculo de horários disponíveis (seção 5), testado (TDD).
6. `fluxo-limpeza-nome.ts`: checkpoints `ln_agendamento_oferta`/`ln_agendamento_horario`, roteamento dos 2 gatilhos.
7. `engine.ts`: liga o novo status/efeito.
8. `persistencia.ts`: executa `agendar_consultor` (grava + notifica).
9. `/admin/atendentes`: seção de disponibilidade por consultor.
10. `/admin/agenda` (nova, ou aba dentro de atendentes): lista de agendamentos do usuário logado.
11. Layout raiz: polling de lembrete + modal global.
12. Testes + verificação manual (simulador pros 2 gatilhos, navegador pra tela de agenda/disponibilidade).
