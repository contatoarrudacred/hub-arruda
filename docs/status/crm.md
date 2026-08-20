# Status — CRM

tarefa: Agendamento com consultor pra leads de alto valor/pacote caro (spec 2026-08-20-agendamento-consultor-alto-valor.md, conversada e aprovada por Luiz) — construído por completo: menu virtual "Acima de X mil" no ln_passo6, checkpoints ln_agendamento_oferta/horario/confirmado, cálculo puro de horários (TDD), tela de disponibilidade em /admin/atendentes, tela "Minha Agenda", modal global de lembrete (15min antes + na hora). tsc/eslint/563 testes verdes. Commitado localmente, NÃO empurrado — depende da migration 20260820130000 rodar E de eu atualizar o etapas_fluxo real DEPOIS do deploy (ordem importa aqui, ver coordenação).
desde: 2026-08-20T19:50:00-03:00
proxima: Aguardar Luiz rodar a migration 20260820130000 → empurrar código pra main → só então atualizar etapas_fluxo em produção. Depois: mensagens fora de ordem no WhatsApp (aguardando Luiz testar o message_delay 4-7s), reset-conversa (aguardando teste), decisão sobre unique constraint em pessoas.whatsapp, Evolution API como backup do Zapster
bloqueio: push do Agendamento com consultor bloqueado até migration 20260820130000 rodar (pedido no inbox); ANTHROPIC_API_KEY foi adicionada na Vercel (confirmado por Luiz) e falta confirmar se houve redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-20T15:39:06-03:00
