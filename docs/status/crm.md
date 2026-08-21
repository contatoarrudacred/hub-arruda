# Status — CRM

tarefa: Agendamento com consultor pra leads de alto valor/pacote caro (spec 2026-08-20-agendamento-consultor-alto-valor.md) — **CONCLUÍDO E NO AR.** Migration aplicada, código em main (deploy Vercel confirmado via GitHub check), e o etapas_fluxo real de produção patcheado (Luiz rodou o SQL, verificado por leitura direta: ln_passo15_router→escalar_agendamento→ln_agendamento_oferta→ln_agendamento_horario→ln_agendamento_confirmado, tudo encadeado certo, ordens 19-25 sem colisão).
desde: 2026-08-20T22:00:00-03:00
proxima: Mensagens fora de ordem no WhatsApp (aguardando Luiz testar o message_delay 4-7s somado ao nosso), reset-conversa (aguardando teste do fix de FK), decisão sobre unique constraint em pessoas.whatsapp, Evolution API como backup do Zapster
bloqueio: ANTHROPIC_API_KEY foi adicionada na Vercel (confirmado por Luiz) e falta confirmar se houve redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-20T23:20:00-03:00
