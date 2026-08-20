# Status — CRM

tarefa: Pastas de Fluxo em /admin/fluxos (spec conversada e aprovada por Luiz) — lápis pra renomear fluxo/pasta, botão "Criar Pasta", drag-and-drop entre pastas/raiz com @dnd-kit, seletor de 16 cores, pasta vazia mostra aviso e excluir pasta move fluxos pra raiz. Construído e verificado (tsc/eslint/389 testes verdes) — commitado localmente (`67662ec`), NÃO empurrado pra main ainda: depende da migration `20260819130000_fluxos_pastas.sql` rodar primeiro (testei local e confirmei que sem ela a página quebra — `/admin/fluxos` continua funcionando normal em produção enquanto isso).
desde: 2026-08-19T23:52:00-03:00
proxima: Aguardar Luiz rodar a migration 20260819130000, então empurrar pra main; depois voltar pro reset-conversa (aguardando teste), decisão sobre unique constraint em pessoas.whatsapp, e avaliar Evolution API como backup do Zapster
bloqueio: push de Pastas de Fluxo bloqueado até migration 20260819130000 rodar (pedido no inbox); ANTHROPIC_API_KEY foi adicionada na Vercel (confirmado por Luiz) e falta confirmar se houve redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-19T23:37:31-03:00
