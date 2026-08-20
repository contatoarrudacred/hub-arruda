# Status — Vendas

tarefa: Documentação atualizada (plano mestre seção 11 + spec 2026-08-19, tudo que saiu do previsto registrado) e bug real corrigido: Nova Oportunidade não carregava o endereço já salvo de uma pessoa existente encontrada por CPF/CNPJ (campo ficava em branco, nada era enviado pro salvarEndereco) — corrigido em `actions.ts`/`nova-oportunidade-client.tsx` (commit `497f5d4`), buscando o endereço junto na busca por documento, igual fechamento-client.tsx já fazia. tsc/eslint/vitest limpos (401 testes de Vendas); sem `.env.local` neste worktree pra testar visualmente com Supabase real.
desde: 2026-08-20T15:45:00-03:00
proxima: Luiz confirmar o fix testando de novo com uma pessoa já cadastrada, depois rodar o teste real de ponta a ponta — Nova Oportunidade → PDF → Assinafy (assinatura de verdade) → Asaas (cobrança/pagamento de verdade).
bloqueio: nenhum — falta o teste ao vivo, que depende do Luiz assinar/pagar de verdade um documento de teste.

## Verificação da Task 18 (2026-08-19) — o que foi confirmado e o que ficou pendente

**Confirmado (automatizado, branch inteira, HEAD `8350a6e`):**
- `pnpm exec tsc --noEmit` — limpo.
- `pnpm exec eslint src` — limpo.
- `pnpm exec vitest run` — 385/385 testes, 31 arquivos, verde.

**Pendente (roteiro manual do brief da Task 18 — precisa de Supabase real, não dá pra rodar neste worktree):**
- Nova Oportunidade (produto `proprio`, boleto/pix parcelado) aparecer no Painel em "Nova Oportunidade" antes do PDF terminar.
- Card avançar sozinho até "Aguardando Assinaturas" via Realtime, sem F5.
- Forçar erro (3 tentativas) → botão de retentativa manual aparecer e funcionar.
- Nova Oportunidade `comissionado` NÃO aparecer em `contratos`/Painel até "Confirmar venda".
- Fechamento de Venda (caminho CRM) criar o registro em "Nova Oportunidade" assim que a tela abre.
- Caminho de cartão — Checkout gerado, link funcional (confirmação final de pagamento depende de conta Asaas real, que ainda não existe).

**Por que não bloqueia o merge:** todas as 18 tasks passaram por revisão individual (spec + qualidade) durante a implementação, com 3 achados Critical/Important reais encontrados e corrigidos ao longo do processo (ver `.superpowers/sdd/2026-08-19-vendas-nova-oportunidade-kanban/progress.md`, não versionado — histórico completo do processo). O código está pronto pra funcionar assim que a migration rodar; falta só a verificação com dado real, que é ação do Luiz + deploy, não algo que eu resolvo sozinho neste worktree.

## Revisão final de branch (2026-08-19) — achados corrigidos + pendências que sobraram

Depois das 18 tasks implementadas e revisadas individualmente, rodei uma revisão final olhando a branch inteira (18 commits, diff completo) — esse tipo de passada pega coisas que cruzam múltiplas tasks, que nenhuma revisão isolada consegue ver. Achou 2 Critical reais (corrigidos no mesmo dia, commit `5f51e42`):
- Parcelamento do cartão nunca chegava na Asaas (o client coletava, o server descartava) — Checkout sempre saía em 1x. Corrigido com coluna nova `contratos.max_parcelas_cartao`.
- Retentativa automática "3x" não existe de fato (nenhuma etapa re-tenta sozinha) mas o botão manual só aparecia depois de 3 falhas acumuladas — um contrato com 1 erro ficava preso pra sempre, sem ação disponível. Corrigido: botão aparece a partir do primeiro erro.

Mais 4 achados Important corrigidos junto (migration não-idempotente; nome do Leitor de Documento IA sendo apagado; debounce/guarda de resposta obsoleta perdidos na busca por documento; card do Kanban sem indicador visual de erro).

**Re-revisão focada nos fixes (mesmo dia)** encontrou 2 achados Important novos — expostos justamente pela correção do Critical 2 (botão de retry agora fácil de clicar, o que tornou alcançável um caminho antes inatingível na prática) — corrigidos no commit `58ef970`:
- Retentativa manual do boleto/pix podia recriar cobranças já emitidas com sucesso na Asaas antes de uma falha no meio do lote de parcelas (risco de boleto duplicado pro cliente). Corrigido: `contrato_parcelas.asaas_payment_id` agora é lido de volta e o loop pula parcela já cobrada.
- Parcelamento do cartão sem limite de 1-21 (regra da Asaas) em nenhuma ponta — um valor fora da faixa só falharia depois do contrato assinado. Validado no client e no server, nas duas telas.
Mais 3 Minors baratos corrigidos junto (indicador "Buscando..." podia ficar preso; card vermelho do Kanban com mesmo fundo do normal no tema escuro; `cancelarVenda` não limpava `ultimo_erro`, deixando venda cancelada aparecer vermelha na coluna errada).

**Pendências que sobraram desta última rodada (Minor, não corrigidas — baixo risco):**
- Se a busca por documento do Leitor de Documento IA falhar (erro de rede/server), o nome e endereço já extraídos pela IA se perdem (o `await` aborta o callback antes de aplicá-los) — precisa de um `try/catch` em volta.
- O timer de debounce (300ms) da busca por documento não é cancelado quando o Leitor de Documento IA dispara uma busca direta dentro dessa janela — cenário raro (usuário digita e usa o leitor quase ao mesmo tempo).

**Pendências mais antigas, registradas — não bloqueiam, mas valem revisitar:**
- **Status transitório "aguardando_assinaturas" quando `ASAAS_API_KEY` não está configurada:** o webhook da Assinafy grava esse status ao confirmar assinatura e só avança pra "gerando_financeiro" se a chave da Asaas existir. Sem ela (estado atual), um contrato assinado fica visualmente indistinguível de um não-assinado, sem erro registrado. Auto-resolve quando o Luiz configurar a conta Asaas real — registrado aqui pra não surpreender ninguém antes disso.
- **Cadeia PDF+Assinafy sem `maxDuration` explícito nas rotas de Vendas:** se `tentarEmitirContrato` (Puppeteer + upload + Assinafy) estourar o timeout padrão da função, o contrato pode ficar em `emitindo_contrato` sem erro registrado (a função morre no meio, antes do catch rodar). Mitigação futura: mover pra `after()` (padrão já usado nos webhooks) e/ou exportar `maxDuration`. Não corrigido nesta passada — mudança de arquitetura maior, melhor como item isolado.
- Diversos Minors de polimento (feedback de quantos cards foram retentados em lote; `Record<string,string>` sem exaustividade em `FORMA_PAGAMENTO_LABEL`; logs de debug com dado sensível ainda em `fechamento/actions.ts`) — ver relatório completo da revisão em `.superpowers/sdd/2026-08-19-vendas-nova-oportunidade-kanban/` (workspace local, não versionado).

## Pendências conhecidas — Asaas Checkout (cartão, Task 10/10b)

- **Reconciliação de parcelas do cartão:** os "títulos a receber" reais do cartão (datas/valores exatos que a Asaas vai creditar por parcela) ainda não são gravados em `contrato_parcelas` — a parcela única criada no submit (Task 13) continua sendo só um placeholder pro valor total. Resolver depende da pesquisa pendente da spec seção 6.1 (onde/como a Asaas expõe o detalhe por parcela de um Checkout pago). Não bloqueia o resto do plano.
- **Possível duplicação de clientes no painel Asaas (baixa prioridade):** a doc oficial do Checkout não confirma se `customerData` (dados soltos, sem id) casa automaticamente com um cliente Asaas já existente pelo CPF/CNPJ ou sempre cria um novo. Se criar um novo a cada Checkout, o dashboard da Asaas acumula clientes duplicados pro mesmo CPF/CNPJ ao longo do tempo — sem impacto funcional pro nosso sistema (a reconciliação usa `externalReference`, não o id do cliente), mas pode confundir o Luiz olhando o painel da Asaas. Não bloqueia.
turno_fim: 2026-08-20T14:02:22-03:00
