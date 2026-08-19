# Status — Marketing

tarefa: Fase 3 completa + validação end-to-end real em produção (5 ciclos reais do pipeline, 2 personas diferentes, sorteio ponderado confirmado). Achados no caminho: (1) credencial WP do banco nunca era lida — corrigido; (2) checklist tinha 2 itens impossíveis pro 1º post de propriedade nova — desativados pra arrudacred.com.br; (3) achado novo, NÃO corrigido: `pautas.motivo_ultima_reprovacao` nunca chega no prompt do Escritor (escritor.ts não lê esse campo) — cada retry é regeneração cega, sem usar o feedback do Revisor. 376/376 testes.
desde: 2026-08-19T04:00:00-03:00
proxima: Luiz decide se quer que eu conserte o loop de correção (Escritor passa a receber motivo_ultima_reprovacao no prompt) — acharia isso pelo menos parte do motivo de 5 reprovações seguidas nos testes de hoje
bloqueio: aguardando o Coordenador mesclar a branch em main (pedido já no INBOX)
