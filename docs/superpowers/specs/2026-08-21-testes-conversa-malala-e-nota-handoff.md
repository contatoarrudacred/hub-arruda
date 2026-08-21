# Spec — Bateria de testes da conversa da Malala + nota interna automática em handoff

Data: 2026-08-21. Pedido por Luiz: o fluxo de Limpeza de Nome está complexo demais pra testar manualmente
(sequenciamento, repetição de pergunta, alucinação, humanização, e — adicionado depois — se a transferência
pra humano de fato acontece e fica registrada). Decidido em conversa (3 perguntas respondidas por Luiz):

1. **Sem Zapster real.** Só existe 1 número de WhatsApp — testar em sequência arriscaria banimento, e o
   objetivo não é validar a Zapster, é validar a construção do fluxo e o comportamento da Malala com IA.
2. **Nem auditoria descartável, nem suíte de CI permanente.** Roda agora, pode rodar de novo no futuro
   (não a cada mudança), mas precisa ficar fácil de achar/rodar de novo quando for necessário.
3. **Corrigir já** o achado de que nenhum handoff grava nota interna — faz parte deste mesmo trabalho.

---

## Parte 1 — Achado: handoff não deixa rastro na timeline

Levantamento (`persistencia.ts`, `fluxo-limpeza-nome.ts`, `engine.ts`) confirma 4 pontos onde a Malala
escala a conversa pra um humano (hoje só o Luiz existe como atendente/consultor):

| Ponto | Dispara quando | Grava `sob_supervisor` | Grava `notificacoes` | Grava nota interna |
|---|---|---|---|---|
| A — `handoff_humano` (triagem_menu) | Lead pede assunto fora de Limpeza de Nome (score, BACEN, Jusbrasil, etc.) | ✅ | ❌ | ❌ |
| B — `escalar_supervisor` (consulta paga) | Lead pede a consulta oficial paga em vez da estimativa | ✅ | ❌ | ❌ |
| C — fim natural do funil (`ln_call_agendada`, `ln_agendamento_confirmado`, `ln_encerramento`) | Funil automatizado terminou (aceitou/recusou agendamento, ou dados completos) | ✅ | ❌ (exceto D) | ❌ |
| D — `agendar_consultor` (spec 20/08) | Dívida > corte OU pacote > R$8.000, lead aceitou horário | ✅ | ✅ (`tipo:"agendamento"`) | ❌ |

Nenhum dos 4 grava `notas_internas` — confirmado por busca em todo `src/lib/motor-fluxo/*` e no webhook.
A única função que cria nota interna hoje (`criarNotaInterna`, `repositorio-atendimento.ts:692`) exige uma
sessão de usuário logado (`obterUsuarioSistemaAtual()`) — não é chamável de dentro do motor (que roda com
`service_role`, sem sessão).

### Fix proposto

1. **Migration aditiva**: `notas_internas.autor_id` vira nullable (`alter column autor_id drop not null`).
   Nota com `autor_id is null` = gerada pelo sistema/Malala, não por um humano. Ajustar a query que já
   junta `usuarios_sistema` pro autor (`repositorio-atendimento.ts` e a UI da timeline) pra mostrar
   "Sistema" (ou "Malala") quando `autor_id` for `null`, em vez de quebrar o join.
2. **Nova função em `persistencia.ts`**: `registrarNotaInternaSistema(conversaId, texto)` — usa
   `createAdminClient()`, insere em `notas_internas` com `autor_id: null`, busca todo `usuarios_sistema`
   com `eh_consultor=true` (hoje só o Luiz) e insere `notificacoes` (`tipo:"mencao"`) pra cada um — sem o
   filtro de auto-exclusão de `extrairMencoes` (não existe autor humano pra excluir).
3. **Chamar em cada um dos 4 pontos** (`persistencia.ts`, dentro de `aplicarEfeitoNegocio`/`registrarTurnoMalala`
   onde `sob_supervisor` já é setado), com um texto padrão por motivo:
   - A: `"Malala transferiu o atendimento — lead pediu assunto fora de Limpeza de Nome (menu: {opcao})."`
   - B: `"Malala transferiu o atendimento — lead pediu a consulta oficial paga (R$39/documento)."`
   - C: `"Malala encerrou o funil automatizado — {motivo: aceitou call / recusou agendamento / dados completos}."`
   - D: substitui a criação solta de `notificacoes` de hoje — a nota interna passa a ser a única fonte
     da notificação (evita notificar duas vezes o mesmo evento).
4. **Não** cria usuário fictício "Sistema" em `usuarios_sistema` — mais simples e semanticamente mais
   correto deixar `autor_id null` do que fabricar uma pessoa que não existe.

Isso não muda nenhum comportamento do lead-facing (mensagens que o lead recebe continuam iguais) — só
fecha o rastro que faltava pro Luiz.

---

## Parte 1b — Achado (via print do editor de fluxos): `ln_passo15_selfservice` órfã

Luiz notou no editor visual (`/admin/fluxos`) que `ln_passo15_selfservice` não aparece conectada a nada.
Confirmado por grep no código e na produção: **nenhuma etapa aponta pra ela** — nem `fluxo-limpeza-nome.ts`,
nem nenhuma linha do banco. Causa raiz: quando `ln_agendamento_oferta` (spec 20/08) substituiu a antiga
`ln_passo15_alto_valor`, o menu passou de {call→`ln_call_agendada`, whatsapp→`ln_passo15_selfservice`} pra
{sim→`ln_agendamento_horario`, não→`ln_call_agendada`} — a opção de seguir em self-service desapareceu
pra **qualquer** lead de alto valor/pacote caro que recusasse o agendamento, mesmo quando isso não fazia
sentido pro motivo do gatilho.

**Decidido com Luiz:** o comportamento da recusa depende do motivo do gatilho:

- **`alto_valor` (dívida > corte, hoje R$500 mil) — ligação é obrigatória.** Recusar não é uma saída válida
  de primeira. A Malala insiste **1 vez** (reforça por que a ligação importa nesse caso), pergunta de novo.
  Se recusar a 2ª vez, transfere pra `ln_call_agendada` mesmo assim (nunca libera self-service pra esse
  motivo) — a nota interna do handoff (Parte 1) registra que foi por 2 recusas.
- **`pacote_caro` (preço do pacote > R$8.000) — recusar é válido.** O lead pode simplesmente continuar o
  atendimento normal com a Malala — vai pra `ln_passo15_selfservice`, sem insistência, sem handoff forçado.

### Desenho novo

`ln_agendamento_oferta` continua igual (sim → `ln_agendamento_horario`; não → passa a apontar pra uma nova
etapa condicional em vez de ir direto pro handoff):

- **Nova etapa condicional `ln_agendamento_router_recusa`** (`tipo_etapa: condicional`, sem mensagem,
  `aguarda_resposta:false`) — decide por `dados.alto_valor` (já existe, é o mesmo campo que define
  `motivo` em `criarResolverMensagensDinamicas`, com a mesma precedência: `alto_valor` vence `pacote_caro`
  quando os dois são `"sim"`): `se_igual:"sim"` → `ln_agendamento_insistencia`; `senão` → `ln_passo15_selfservice`.
- **Nova etapa `ln_agendamento_insistencia`** (menu, `campoSalvo` novo, ex. `aceitou_agendamento_insistencia`)
  — mensagem reforçando por que a ligação é necessária nesse caso específico (dívida alta), opções sim →
  `ln_agendamento_horario`; não → `ln_call_agendada` (2ª recusa, handoff mesmo assim).
- `ln_passo15_selfservice` volta a ser alcançável — nenhuma mudança nela própria, só ganha a nova origem.

Isso NÃO muda nada da Parte 1 (nota interna automática) — continua valendo pra `ln_call_agendada` sempre
que ele for de fato alcançado (agora só a partir da 2ª recusa em caso de dívida alta).

---

## Parte 2 — Harness de testes automatizados

### Por que dá pra automatizar sem Zapster

O webhook real (`src/app/api/webhooks/zapster/route.ts`) separa 3 coisas: (a) verificação de segredo — só
HTTP, (b) motor + persistência — `avancarConversa`/`iniciarFluxo` (`engine.ts`) e `registrarTurnoMalala`/
`carregarOuCriarConversaWhatsapp` (`persistencia.ts`), ambos funções exportadas e independentes do handler,
(c) envio real pro WhatsApp — `enviarSequenciaWhatsapp` (`src/lib/whatsapp/enviar.ts`), chamado só depois,
em módulo separado. O harness importa e chama (b) diretamente — **nunca chama (a) nem (c)**. Resultado:
IA real, banco real (Supabase de produção), zero mensagem tentando sair pelo WhatsApp de verdade.

Único ponto que NÃO é uma função isolada hoje: o debounce de 3.5s (concatenação de mensagens seguidas do
lead) vive inline dentro do handler. Cenários que testam especificamente esse comportamento (lead manda 2
mensagens em sequência rápida) vão precisar chamar o motor 1x só com as 2 mensagens já concatenadas
manualmente pelo script — não vale a pena extrair o `setTimeout` real pra isso.

### Lead fictício

- Nome: **"Testando da Silva"**.
- Telefone: fixo e reservado, longe de qualquer faixa real (ex.: `+55 11 90000-000X`, incrementando o
  último dígito só se duas execuções colidirem por algum erro de limpeza — na prática deve ser sempre o
  mesmo número, já que cada cenário apaga tudo antes do próximo começar).
- `carregarOuCriarConversaWhatsapp` reaproveita a pessoa se a conversa ainda estiver `ativa`; então o ciclo
  de cada cenário É: cria do zero → roda → analisa → apaga (pessoa + conversa + oportunidade, cascade) →
  próximo cenário parte de um banco limpo.

### Ciclo de um cenário

1. Harness chama `carregarOuCriarConversaWhatsapp("+5511900000001", ...)` — cria pessoa/conversa novas.
2. Envia a primeira mensagem do lead (roteirizada ou gerada por um "ator") através de `iniciarFluxo`.
3. Pra cada resposta da Malala, decide a próxima mensagem do lead:
   - **Cenários roteirizados** (cobertura): mensagens fixas, na ordem, cobrindo 1 branch específico do
     fluxo (dívida baixa, dívida alta, pacote caro, cada opção de menu, cada um dos 4 pontos de handoff).
   - **Cenários adversariais** (qualidade): uma 2ª chamada de IA faz o papel do lead, reagindo de verdade
     ao texto da Malala — pede pra confirmar 2x a mesma coisa, muda de ideia, pergunta fora do assunto,
     manda mensagem ambígua — pra pegar repetição/alucinação que cenário fixo não provoca.
4. Continua até a conversa terminar (`sob_supervisor=true` ou fim do funil) ou um limite de turnos (evita
   loop infinito se algo quebrar).
5. Lê de volta do banco: todas as `mensagens` da conversa, `notas_internas`, `notificacoes`, `conversas.sob_supervisor`,
   `agendamentos_consultor` (se aplicável) — monta o **espelho**: um JSON com a transcrição completa +
   todos os efeitos que de fato aconteceram no banco.
6. Salva o espelho em arquivo (`scripts/testes-malala/resultados/<timestamp>-<cenario>.json`).
7. Apaga a pessoa/conversa/oportunidade de teste (reaproveita a lógica de `reset-conversa`, sem os bloqueios
   de venda/admin que não se aplicam a um lead fictício).

### O "juiz"

Uma chamada de IA separada (Sonnet, não a mesma chamada de dentro do motor) recebe: o espelho da conversa
inteira + `PERSONA_MALALA_PROMPT_SISTEMA.md` + o trecho relevante de `SCRIPT_LIMPANOME_SERASA_SPC.md` +,
quando o cenário é de handoff, a expectativa explícita descrita por Luiz (avisa → pede confirmação → só
transfere depois de confirmado → fica registrado). Retorna um veredito estruturado por cenário: respondeu
o que foi perguntado, repetiu pergunta idêntica, alucinou algo, manteve tom humanizado e alinhado ao
propósito, e (nos cenários de handoff) se a sequência avisa/confirma/transfere/registra aconteceu.

### Relatório final

Um documento consolidando todos os vereditos, ordenado por severidade, com trechos citados da conversa
onde algo falhou — publicado como Artifact (fácil de ler, fácil de compartilhar) além de ficar salvo no
repo.

### Onde isso mora (fácil de achar de novo)

- `scripts/testes-malala/` — script(s) Node/tsx standalone, **fora do `pnpm test`** (usa IA/custo real,
  não deve rodar em CI nem sem intenção explícita).
- `scripts/testes-malala/README.md` — como rodar de novo no futuro, o que cada cenário cobre, como ler
  os resultados salvos em `resultados/`.
- `scripts/testes-malala/cenarios/` — a lista de cenários (roteirizados + adversariais), separada do
  motor do harness, pra ser fácil adicionar um cenário novo sem mexer no runner.

---

## Ordem de execução

1. Migration (`autor_id` nullable) + `registrarNotaInternaSistema` + ligar nos 4 pontos + testes unitários
   novos em `persistencia.test.ts`/`engine.test.ts` cobrindo a nota criada em cada handoff.
2. `ln_agendamento_router_recusa` + `ln_agendamento_insistencia` no seed (`fluxo-limpeza-nome.ts`) + `engine.test.ts`
   cobrindo os 2 caminhos (dívida alta insiste 1x depois transfere; pacote caro vai direto pro self-service)
   — **patch equivalente no `etapas_fluxo` real de produção só depois do código estar em `main`** (mesma
   regra de sequenciamento já usada no agendamento em si: schema/código primeiro, conteúdo do fluxo depois).
3. Runner do harness + cenários roteirizados (cobertura de todo branch + os 4 handoffs + os 2 caminhos da
   recusa de agendamento).
4. Cenários adversariais (ator-IA).
5. Rodar tudo contra produção (lead fictício), gerar os espelhos.
6. Juiz + relatório consolidado.
7. Entregar o relatório (Artifact) + deixar o harness documentado no repo pra reuso futuro.
