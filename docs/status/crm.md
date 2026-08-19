# Status — CRM

tarefa: Achado real ao testar o reset — pessoas.whatsapp sem unique, número de teste do Luiz ligado a 2 cadastros. Corrigido pra não travar mais (reset-conversa aceita N pessoas e bloqueia decisão perigosa; carregarOuCriarConversaWhatsapp do webhook real também, senão a Malala parava de responder). Duplicidade em si não resolvida — registrado na coordenação + inbox do Vendas, decisão pendente do Luiz (unique constraint ou não). Publicado (`b90f42b`). tsc/eslint limpos, 389 testes.
desde: 2026-08-19T21:15:00-03:00
proxima: Aguardar Luiz testar reset de novo; decisão sobre unique constraint em pessoas.whatsapp; depois avaliar se parte pra frente do delay nativo da Zapster
bloqueio: nenhum — mas ANTHROPIC_API_KEY foi adicionada na Vercel (confirmado por Luiz) e falta confirmar se houve redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-19T18:06:06-03:00
