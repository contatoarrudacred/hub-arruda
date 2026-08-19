# Status — CRM

tarefa: 2º round de bugs do log real (Luiz) corrigido — (1) Tela de Atendimento embaralhada dentro do mesmo turno (enviado_em em lote sem desempate → agora incremental), (2) loop infinito no modo livre do ln_passo6 (interpretador sem memória entre tentativas → agora acumula valor parcial por documento, semeado com o valor do menu ao cair nesse modo). Commitado (`055f48d`), 180 testes verdes. Falta: (a) push, (b) frente 3 combinada com Luiz — trocar delay simulado nosso pelo `message_delay` nativo da Zapster (`PATCH /wa/instances/{id}/settings`), ainda não iniciada.
desde: 2026-08-19T16:30:00-03:00
proxima: Push, aguardar novo teste real do Luiz; depois avaliar se parte pra frente do delay nativo da Zapster
bloqueio: nenhum — mas ANTHROPIC_API_KEY foi adicionada na Vercel (confirmado por Luiz) e falta confirmar se houve redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-19T15:03:41-03:00
