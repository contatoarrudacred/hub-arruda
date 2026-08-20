# Status — CRM

tarefa: Pastas de Fluxo em /admin/fluxos — concluída. Migration `20260819130000_fluxos_pastas.sql` confirmada pelo Luiz e verificada direto no banco; mesclei o `main` (trouxe o módulo de Produtos/Templates de Documentos do Vendas, resolvendo colisão de timestamp com a migration deles — mesmo prefixo `130000`, arquivos diferentes, registrado na coordenação pro Vendas renomear a deles) e empurrei — tsc/eslint/401 testes verdes pós-merge.
desde: 2026-08-20T00:05:00-03:00
proxima: Voltar pro reset-conversa (aguardando teste do Luiz), decisão sobre unique constraint em pessoas.whatsapp, e avaliar Evolution API como backup do Zapster
bloqueio: nenhum — ANTHROPIC_API_KEY foi adicionada na Vercel (confirmado por Luiz) e falta confirmar se houve redeploy; patch_abertura_email_justificativa_na_retomada.sql enviado, rodar não confirmado
turno_fim: 2026-08-19T23:45:57-03:00
