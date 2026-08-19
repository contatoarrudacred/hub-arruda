-- Patch pontual (NÃO é migration de schema) — corrige o checkpoint abertura_email: a justificativa
-- do e-mail ("É por ele que mando a proposta por escrito...") saía junto da pergunta, no mesmo
-- turno, antes do lead ter chance de responder. Achado ao vivo por Luiz, 18/08/2026.
--
-- Depois deste patch: a 1ª pergunta é só "Pra eu te atender melhor, me confirma também seu e-mail:".
-- A justificativa só aparece se a resposta não for reconhecida como e-mail válido (recusa, "pra
-- quê?", ou e-mail mal formado) — nesse caso ela vira a mensagem de retomada, gerada
-- dinamicamente pelo motor (ver criarResolverMensagensDinamicas em fluxo-limpeza-nome.ts).
-- `tipo_resposta`/`campo_salvo` não mudam — só o conteúdo (mensagens).
--
-- Não é destrutivo: só troca o "conteudo" de UMA linha já existente, identificada pelo código
-- dentro do próprio jsonb. Não afeta quem já estiver parado nesse checkpoint.

update etapas_fluxo
set
  conteudo = '{"codigo":"abertura_email","mensagens":[{"tipo":"texto","texto":"Pra eu te atender melhor, me confirma também seu e-mail:"}],"aguarda_resposta":true,"tipo_resposta":"email","proximo_codigo":"triagem_menu","kanban_subetapa":"novo_lead_triagem","opcional_apos_tentativas":2,"interpretacao_ia":{"habilitado":true,"instrucao":"O lead pode escrever o e-mail com erros de digitação, espaços, ou por extenso (ex.: ''joao arroba gmail ponto com''). Extraia e normalize para o formato padrão nome@dominio.com. Se a mensagem claramente não contém um e-mail (ex.: pergunta ''pra quê'', diz que não tem, ou ignora o pedido), marque como não interpretado — não insista nem invente um e-mail."}}'::jsonb
where conteudo->>'codigo' = 'abertura_email';

-- Verificação rápida depois de rodar (deve devolver 1 linha, com só 1 item no array "mensagens"):
-- select conteudo->'mensagens' from etapas_fluxo where conteudo->>'codigo' = 'abertura_email';
