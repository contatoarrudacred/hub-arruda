-- Patch pontual (NÃO é migration de schema) — atualiza só o conteúdo do checkpoint ln_passo16_1
-- pra refletir o novo tipo_resposta "negociacao_pagamento" (captura de detalhe de pagamento no
-- fechamento). Ver docs/superpowers/specs/2026-08-18-captura-detalhe-pagamento-fechamento-design.md
-- e docs/superpowers/plans/2026-08-18-captura-detalhe-pagamento-fechamento.md.
--
-- Antes (o que está no banco hoje): tipo_resposta "texto_livre", campo_salvo "data_primeira_parcela",
-- pergunta fixa "qual a melhor data pra você pra realizar o pagamento da primeira parcela".
-- Depois: tipo_resposta "negociacao_pagamento" (checkpoint em loop, mensagem gerada dinamicamente
-- pelo motor — não fica hardcoded aqui), campo_salvo "detalhe_pagamento_confirmado_bruto".
--
-- Não é destrutivo: só troca o "conteudo"/"campo_salvo" de UMA linha já existente, identificada
-- pelo código dentro do próprio jsonb (não por id, que pode ser diferente do seu banco). Não apaga
-- nenhuma conversa/oportunidade em andamento — quem já estiver parado nesse checkpoint continua
-- funcionando (a única mudança é como a PRÓXIMA resposta do lead é interpretada).

update etapas_fluxo
set
  conteudo = '{"codigo":"ln_passo16_1","mensagens":[{"tipo":"texto","texto":"(mensagem de confirmação de pagamento gerada dinamicamente)"}],"aguarda_resposta":true,"tipo_resposta":"negociacao_pagamento","proximo_codigo":"ln_passo17a","kanban_subetapa":"negociacao_duvidas"}'::jsonb,
  campo_salvo = 'detalhe_pagamento_confirmado_bruto'
where conteudo->>'codigo' = 'ln_passo16_1';

-- Verificação rápida depois de rodar (deve devolver 1 linha, com tipo_resposta = negociacao_pagamento):
-- select conteudo->>'codigo', conteudo->>'tipo_resposta', campo_salvo from etapas_fluxo where conteudo->>'codigo' = 'ln_passo16_1';
