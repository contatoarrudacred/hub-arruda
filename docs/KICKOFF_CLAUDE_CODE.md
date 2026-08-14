Estou iniciando a construção do "Hub Arruda" — sistema de gestão da ArrudaCred (e futuramente Aetria e outras unidades do grupo). Todo o planejamento já foi feito em conversas anteriores com o Claude (claude.ai) e está documentado nos arquivos abaixo, que vou anexar/colar nesta conversa.

## Contexto rápido
- Negócio: ArrudaCred é uma assessoria de recuperação de crédito (limpeza de nome) em transição para produtos financeiros mais amplos (crédito, consórcio, investimento)
- Este é o MVP1: um agente de atendimento via WhatsApp (IA), ligado a um CRM e a um módulo de administração/configuração
- Produto piloto: Limpeza de Nome Serasa/SPC — script de vendas completo já documentado

## Infraestrutura já criada
- **Supabase** (banco de dados): projeto `hub-arruda`, região sa-east-1 (São Paulo), URL `https://mzvaqjhalynaceecnayt.supabase.co`
- **Schema já deployado**: `migrations/001_nucleo.sql` e `migrations/002_comercial.sql` já rodados com sucesso — as tabelas já existem no banco, com RLS ativado (backend deve acessar via service_role)
- **GitHub**: `https://github.com/contatoarrudacred/hub-arruda` (repositório vazio, pronto para receber código)
- **Vercel**: projeto `hub-arruda` conectado ao repositório acima (sem deployment ainda)
- **WhatsApp**: BSP escolhido é a Zapster API (ainda não integrado)

## Documentos (todos já salvos em docs/ dentro deste repositório — leia todos antes de começar)
1. `docs/PLANO_MESTRE_SISTEMA_ARRUDACRED.md` — visão geral, arquitetura, decisões, prioridades
2. `docs/MODELAGEM_DADOS_ARRUDACRED.md` — o desenho completo do schema (já deployado)
3. `docs/SCRIPT_LIMPANOME_SERASA_SPC.md` — o script de vendas completo do produto piloto
4. `docs/FAQ_LIMPANOME_SERASA_SPC.md` — base de conhecimento
5. `docs/KANBAN_COMERCIAL_LIMPANOME.md` — funil/CRM
6. `docs/REGUA_COBRANCA_ARRUDACRED.md` — régua de cobrança pós-contrato (uso futuro, não é MVP1)
7. `docs/MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` — pipeline de conteúdo multi-site (não é MVP1)
8. `docs/PARCEIROS_AFILIADOS_ARRUDACRED.md` — parceiros/afiliados (não é MVP1)
9. `migrations/001_nucleo.sql` e `migrations/002_comercial.sql` — schema já aplicado, para referência exata dos nomes de tabela/coluna

## O que preciso que você faça primeiro
Não escreva código ainda. Primeiro:
1. Leia todos os documentos acima
2. Me diga se alguma coisa ficou ambígua ou incompleta pra você começar a construir
3. Proponha a stack de frontend/backend (framework) mais adequada para este projeto, considerando: Supabase + Vercel já decididos, time pequeno (só o Luiz + você), e que o admin deve conseguir editar o "script de atendimento" (tabela etapas_fluxo) sem depender de deploy
4. Proponha uma ordem de construção do MVP1 em etapas pequenas e testáveis (ex.: primeiro o motor de fluxo sem WhatsApp real, depois a integração de verdade, depois o painel admin)

Depois que eu validar o plano, começamos a construir por etapas.
