# Status — CRM

tarefa: Pastas de Fluxo em /admin/fluxos — Luiz testou e reportou que arrastar fluxo sem pasta pra dentro de uma pasta não funcionava. Causa achada: faltava `onDragOver` no `DndContext` (sem ele o dnd-kit não reconcilia os `SortableContext` de origem/destino durante o arrasto — pegadinha conhecida da lib, mesma exigência do exemplo oficial de "multiple containers"). Corrigido, tsc/eslint/401 testes verdes, empurrado (`df34f37`).
desde: 2026-08-20T13:40:00-03:00
proxima: Aguardar Luiz testar de novo o drag-and-drop; depois voltar pro reset-conversa (aguardando teste), decisão sobre unique constraint em pessoas.whatsapp, e avaliar Evolution API como backup do Zapster
bloqueio: nenhum — ANTHROPIC_API_KEY foi adicionada na Vercel (confirmado por Luiz) e falta confirmar se houve redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-20T13:36:07-03:00
