# Status — CRM

tarefa: "Corrigir tudo de forma global" (Luiz) — as 3 frentes concluídas: (1) debounce/concatenação de mensagens seguidas do lead no webhook, (2) interpretar-lista-documentos.ts com memória entre turnos + prompt menos hesitante, (3) mesmo ajuste de prompt no modo_livre de faixas_documentos. Código+testes+lint+tsc verdes, commitado local (não empurrado ainda). Falta rodar a migration 20260819100000_conversas_buffer_token.sql (senão o debounce não funciona — coluna não existe).
desde: 2026-08-19T03:22:00-03:00
proxima: Push + confirmar com Luiz que rodou a migration, depois novo teste real no WhatsApp (o log que ele mandou)
bloqueio: nenhum — mas ANTHROPIC_API_KEY foi adicionada na Vercel (confirmado por Luiz) e falta confirmar se houve redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-19T03:02:56-03:00
