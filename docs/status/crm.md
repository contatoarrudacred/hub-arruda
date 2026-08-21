# Status — CRM

tarefa: Bateria de testes automatizados da conversa da Malala (spec 2026-08-21-testes-conversa-malala-e-nota-handoff.md) — migration rodada pelo Luiz, nota interna confirmada funcionando contra produção (sob_supervisor + nota + notificação, tudo certo). Smoke test de 3 cenários já achou 1 bug real sério: parcela cobrada não bate com a "Condição Especial" oferecida, e a Malala inventa desculpa em vez de admitir/escalar quando o lead reclama (promete "chamar o financeiro" mas nunca escala de verdade) — documentado com transcrição completa em docs/superpowers/specs/2026-08-21-achados-bateria-testes-malala.md. Rodando agora a bateria completa (16 cenários).
desde: 2026-08-21T16:30:00-03:00
proxima: Consolidar os achados dos 16 cenários → relatório final pro Luiz → decidir prioridade de correção (o bug de parcela é candidato a corrigir logo, pode estar afetando lead real hoje). Depois: mensagens fora de ordem no WhatsApp (aguardando teste do message_delay), reset-conversa (aguardando teste), unique constraint em pessoas.whatsapp, Evolution API como backup do Zapster
bloqueio: nenhum bloqueio novo; ANTHROPIC_API_KEY na Vercel — falta confirmar redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-21T16:50:00-03:00
