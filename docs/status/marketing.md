# Status — Marketing

tarefa: Sequência de achados/correções na Agenda de Posts e Fila de Pautas, tudo já commitado. (1) Menu de ações virou flutuante + visualizar local/WordPress + calendário sem "Agendado" + ordem cronológica. (2) Bug real no Trocar Foto: post sem capa embutida no HTML (efeito do guard de orçamento) tinha a URL salva no banco mas a imagem nunca aparecia — substituirImagemNoHtml só substituía, nunca inseria; corrigido pra inserir a figura quando não há nada pra trocar, e corrigido o 1 registro já quebrado. (3) Resetadas as 2 pautas bloqueadas (57f423b8, 719099df) — confirmado que nenhuma tinha post publicado no WordPress, seguro. (4) Luiz confirmou querer consertar o "Reabrir" da Fila de Pautas: agora zera tentativas por padrão (senão reabrir uma pauta bloqueada por esgotamento a bloqueava de novo na hora), EXCETO quando o motivo começa com "Publicado em " (post já foi ao ar, só falhou registro local — reabrir e zerar tentativas aí duplicaria o post); a tela mostra um aviso amarelo nesse caso. (5) Tooltips (title) adicionados no botão "Reabrir" e em todos os itens do menu flutuante da Agenda. 636/636 testes (só 1 falha pré-existente não relacionada, do CRM), tsc/eslint limpos.
desde: 2026-08-21T19:30:00-03:00
proxima: nenhuma pendência conhecida — aguardar próximo pedido do Luiz
bloqueio: nenhum
turno_fim: 2026-08-21T22:20:00-03:00
