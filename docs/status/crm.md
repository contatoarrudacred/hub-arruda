# Status — CRM

tarefa: Bug reportado por Luiz — mensagens de abertura chegaram fora de ordem no WhatsApp real (não é do ln_passo6, que ficou concluído antes). Investigado com dados reais do banco + doc da Zapster, mitigação aplicada (buffer pós-mídia em enviarSequenciaWhatsapp), commitado. Detalhe completo no aviso da seção 3.
desde: 2026-08-19T02:45:00-03:00
proxima: Confirmar com Luiz se a mitigação resolveu (precisa de novo teste real no WhatsApp); voltar pro ciclo de bugs reportados ("vou passando um por um")
bloqueio: nenhum — mas ANTHROPIC_API_KEY foi adicionada na Vercel (confirmado por Luiz) e falta confirmar se houve redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-19T02:10:00-03:00
