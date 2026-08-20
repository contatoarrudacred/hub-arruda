# Status — CRM

tarefa: Mensagens fora de ordem no WhatsApp real — Luiz pediu pra testar `message_delay` nativo da instância (Zapster) somado ao nosso delay simulado, em vez de mexer só no nosso lado. Ligado via PATCH (4-7s), mantendo o nosso como está. No caminho, achei e corrigi um reset de `call_rejection`/`read_confirmation` pros valores errados (atualização parcial da Zapster não se comportou como a doc promete — registrado na coordenação) — confirmado com GET fresco que os 3 campos estão certos agora. Aguardando Luiz testar com mensagem real.
desde: 2026-08-20T15:45:00-03:00
proxima: Aguardar Luiz testar a ordem das mensagens; se não resolver, próxima linha é atacar a causa direto (só avançar a próxima mensagem da sequência depois de confirmar entrega via webhook message.delivered, em vez de qualquer delay às cegas). Depois: reset-conversa (aguardando teste), decisão sobre unique constraint em pessoas.whatsapp, Evolution API como backup do Zapster
bloqueio: nenhum — ANTHROPIC_API_KEY foi adicionada na Vercel (confirmado por Luiz) e falta confirmar se houve redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-20T15:36:07-03:00
