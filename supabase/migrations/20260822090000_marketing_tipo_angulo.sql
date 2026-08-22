-- Sorteio de tipo de ângulo (22/08/2026, pedido do Luiz) — ver
-- docs/MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 5.1 (catálogo de 15 tipos de ângulo) e
-- estrategista.ts (algoritmo de sorteio ponderado por "tipo menos usado recentemente"). Achado
-- real: os ângulos prontos de cada persona seguiam quase sempre o mesmo tipo retórico
-- (reformulação/contraste), fazendo os posts saírem parecidos mesmo com ângulos de texto
-- diferentes — o catálogo de 15 tipos já existia na documentação, mas nunca tinha sido
-- implementado no código.
--
-- Escrita pelo agente Marketing, NÃO aplicada por ele (regra dura da seção 2 de
-- docs/COORDENACAO_AGENTES_ARRUDACRED.md) — aguarda o Luiz rodar no SQL Editor do Supabase.

alter table pautas add column tipo_angulo text
  check (tipo_angulo in (
    'informacional_direto', 'passo_a_passo_tutorial', 'mito_ou_verdade',
    'storytelling_virada_de_jogo', 'comparativo', 'urgencia_temporal',
    'duvida_ceticismo', 'consequencia_medo', 'perfil_segmento',
    'objecao_confianca', 'ranking_lista', 'antes_e_depois',
    'geografico_local', 'para_empresas_b2b', 'pergunta_direta'
  ));

comment on column pautas.tipo_angulo is
  'Tipo retórico do ângulo desta pauta, do catálogo de 15 tipos (MODULO_MARKETING_CONTEUDO_ARRUDACRED.md seção 5.1) — sorteado pelo Estrategista ANTES de escolher/gerar o ângulo em si (ponderado por "tipo menos usado recentemente" nesta matriz, mesmo princípio de escolherPersonaMenosUsadaRecentemente). NULL em pautas anteriores a esta coluna e em pautas manuais que não passaram pelo sorteio — decisão deliberada de escopo, sem backfill retroativo das pautas históricas.';

-- personas.angulos_prontos passa a ter shape {texto, tipo}[] em vez de string[] (reclassificação
-- via script one-off scripts/reclassificar-angulos-prontos.ts, não uma migration de dado). jsonb
-- não muda de tipo de coluna — só o comentário é atualizado para refletir o novo shape.
comment on column personas.angulos_prontos is
  'jsonb: {texto: string, tipo: TipoAngulo}[] (22/08/2026) — os ângulos de ataque para anúncio (Bloco 11) já escritos pelo Luiz, prontos pra virar pauta sem custo de IA, cada um com o tipo retórico do catálogo de 15 (seção 5.1) já classificado. Formato anterior a 22/08/2026 era string[] sem tipo; reclassificado em lote por scripts/reclassificar-angulos-prontos.ts (script one-off, ver histórico do repositório). Ver seção 5 (lógica de seleção) — esvaziam com o uso, e o Estrategista passa a gerar ângulo novo via IA (do tipo sorteado) quando os de um tipo acabam.';
