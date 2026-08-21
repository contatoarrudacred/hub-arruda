# Status — CRM

tarefa: Bateria de testes automatizados da conversa da Malala (spec 2026-08-21-testes-conversa-malala-e-nota-handoff.md, pedido do Luiz). 2 achados reais já corrigidos localmente (582/582 testes verdes): (1) nenhum handoff pra humano gravava nota interna — corrigido, migration 20260821140000 aguardando Luiz; (2) ln_passo15_selfservice tinha ficado órfã (recusa sempre ia pro handoff, mesmo em pacote caro) — corrigido, dívida alta agora insiste 1x antes de aceitar a recusa, pacote caro cai no self-service. Construindo agora o harness (scripts/testes-malala/): lead fictício "Testando da Silva", sem Zapster real, cenários roteirizados + adversariais, juiz de IA, relatório final.
desde: 2026-08-21T13:00:00-03:00
proxima: Terminar o harness → rodar a bateria contra produção (após migration) → relatório final pro Luiz. Depois: mensagens fora de ordem no WhatsApp (aguardando teste do message_delay), reset-conversa (aguardando teste), unique constraint em pessoas.whatsapp, Evolution API como backup do Zapster
bloqueio: migration 20260821140000 aguardando Luiz (bloqueia rodar o harness contra produção, não bloqueia construir o harness); ANTHROPIC_API_KEY na Vercel — falta confirmar redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-21T13:00:00-03:00
