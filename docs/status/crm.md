# Status — CRM

tarefa: Revisão geral do módulo — plano mestre (seção 11) atualizado com tudo que ficou pra trás desde 17/08 (negociação de pagamento, ln_passo6 menu 2 rodadas, buffer/memória entre turnos, 2 rounds de bug real em produção, reset-conversa 3 correções, pessoas.whatsapp sem unique, loading.tsx, incidente Zapster + pesquisa de provedor backup, tela /admin/pessoas avaliada e adiada por Luiz). Nenhum código novo nesta rodada, só documentação.
desde: 2026-08-19T23:20:00-03:00
proxima: Aguardar Luiz testar reset de novo; decisão sobre unique constraint em pessoas.whatsapp; decidir se testa a Evolution API como backup do Zapster antes de desenhar o adapter; depois avaliar se parte pra frente do delay nativo da Zapster
bloqueio: nenhum — mas ANTHROPIC_API_KEY foi adicionada na Vercel (confirmado por Luiz) e falta confirmar se houve redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-19T23:37:31-03:00
