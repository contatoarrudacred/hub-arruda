-- ============================================================================
-- MIGRATION 007 — Captura confiável de "quem fez" na auditoria
-- Sistema de Gestão ArrudaCred
--
-- A migration anterior (006) deixou "usuario_id" sempre nulo de propósito —
-- capturar isso de forma confiável exigia ou reescrever as escritas como
-- funções RPC, ou passar o admin a escrever com o cliente autenticado (RLS)
-- em vez do service_role. Luiz decidiu (14/08/2026) que vale fazer isso agora,
-- enquanto o projeto está no início — é mais barato que fazer depois com mais
-- gente/tabela/dado. Este migration faz a segunda opção.
--
-- Descoberta ao testar (14/08/2026): o Supabase já habilita Row Level Security
-- automaticamente em toda tabela nova do schema public, mesmo sem o SQL da
-- migration pedir isso — testei direto contra a API REST com a anon key e
-- ela já vinha bloqueada (retornando lista vazia) mesmo sem nenhuma política
-- configurada. Isto corrige uma afirmação errada no
-- SEGURANCA_E_AUDITORIA_ARRUDACRED.md ("RLS hoje inexistente no projeto
-- inteiro") — RLS já estava ligado, só não tinha NENHUMA política, então
-- também bloqueava o usuário autenticado (não só o público). É exatamente
-- por isso que esta migration é necessária: sem uma política pra
-- "authenticated", trocar o service_role pelo cliente autenticado quebraria
-- toda leitura/escrita do admin.
-- ============================================================================

-- Política preserva o comportamento de hoje: qualquer usuário autenticado tem
-- acesso total (nível único ADMIN/MASTER, MODELAGEM_DADOS_ARRUDACRED.md — não
-- existe ainda granularidade de papel). Quando níveis de acesso mais
-- granulares existirem (financeiro/operacional/relatórios, já previsto no
-- PLANO_MESTRE seção 1.6), a política aqui é o lugar certo pra refinar —
-- troca "using (true)" por uma checagem de papel, sem mudar mais nada.
create policy admin_acesso_total on etapas_fluxo for all to authenticated using (true) with check (true);
create policy admin_acesso_total on fluxos for all to authenticated using (true) with check (true);
create policy admin_acesso_total on usuarios_sistema for all to authenticated using (true) with check (true);
create policy admin_acesso_total on pessoas for all to authenticated using (true) with check (true);
create policy admin_acesso_total on conversas for all to authenticated using (true) with check (true);
create policy admin_acesso_total on oportunidades for all to authenticated using (true) with check (true);

-- O motor de fluxo em produção (WhatsApp real, simulador) continua usando
-- service_role pra ler etapas_fluxo/precos_por_faixa/configuracoes — isso
-- sempre ignora RLS, então as políticas acima não afetam o atendimento
-- automatizado, só o painel admin (agora autenticado de verdade).

-- Trigger de auditoria passa a usar auth.uid() — id do usuário autenticado
-- na própria requisição, fornecido nativamente pelo PostgREST — em vez da
-- variável de sessão manual (que não sobrevivia de forma confiável entre
-- chamadas separadas do cliente Supabase, ver nota na migration 006).
-- auth.uid() retorna null quando quem escreve é o service_role (motor de
-- fluxo) — correto, porque não existe "usuário" humano por trás daquela
-- escrita.
create or replace function fn_auditoria_log() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    insert into auditoria_log (tabela, operacao, registro_id, dados_antes, usuario_id)
    values (tg_table_name, tg_op, old.id, to_jsonb(old), auth.uid());
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into auditoria_log (tabela, operacao, registro_id, dados_antes, dados_depois, usuario_id)
    values (tg_table_name, tg_op, new.id, to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  else
    insert into auditoria_log (tabela, operacao, registro_id, dados_depois, usuario_id)
    values (tg_table_name, tg_op, new.id, to_jsonb(new), auth.uid());
    return new;
  end if;
end;
$$;

-- ============================================================================
-- Fim da migration 007.
-- ============================================================================
