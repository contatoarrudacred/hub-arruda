# Status — CRM

tarefa: Agendamento com consultor pra leads de alto valor/pacote caro (spec 2026-08-20-agendamento-consultor-alto-valor.md) — migration 20260820130000 confirmada rodada e verificada direto no banco (disponibilidade_atendente com seed correto, agendamentos_consultor, eh_consultor=true pro Luiz, notificacoes.agendamento_id). Código mesclado com origin/main (sem conflito) e empurrado pra main. Falta o passo 3: patchear o etapas_fluxo REAL em produção (renomear ln_passo15_alto_valor→ln_agendamento_oferta, trocar proximo_por_dado.campo de alto_valor pra escalar_agendamento em ln_passo15_router, inserir ln_agendamento_horario/ln_agendamento_confirmado) — só agora que o código já está no ar isso é seguro.
desde: 2026-08-20T22:00:00-03:00
proxima: Patchear etapas_fluxo em produção (passo 3, agora seguro pois código já está em main) → depois: mensagens fora de ordem no WhatsApp (aguardando Luiz testar o message_delay 4-7s), reset-conversa (aguardando teste), decisão sobre unique constraint em pessoas.whatsapp, Evolution API como backup do Zapster
bloqueio: ANTHROPIC_API_KEY foi adicionada na Vercel (confirmado por Luiz) e falta confirmar se houve redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-20T22:00:00-03:00
