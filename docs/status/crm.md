# Status — CRM

tarefa: 2º round de bugs do log real (Luiz) corrigido e publicado — (1) Tela de Atendimento embaralhada dentro do mesmo turno (enviado_em em lote sem desempate → agora incremental), (2) loop infinito no modo livre do ln_passo6 (interpretador sem memória entre tentativas → agora acumula valor parcial por documento). Merge com as 18 tasks do Vendas (Nova Oportunidade + Kanban) feito localmente, 389 testes verdes (repo inteiro), push em `main` (`8675c03`). Falta: frente do delay nativo da Zapster (`message_delay`, combinada com Luiz), ainda não iniciada.
desde: 2026-08-19T16:45:00-03:00
proxima: Aguardar novo teste real do Luiz; depois avaliar se parte pra frente do delay nativo da Zapster
bloqueio: nenhum — mas ANTHROPIC_API_KEY foi adicionada na Vercel (confirmado por Luiz) e falta confirmar se houve redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-19T15:03:41-03:00
