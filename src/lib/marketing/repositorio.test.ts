// src/lib/marketing/repositorio.test.ts
// Testes UNITÁRIOS — createAdminClient é mockado (vi.mock), nada bate no banco real. Ver
// repositorio.integration.test.ts para os testes que batem no Supabase remoto de verdade.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  atualizarStatusPost,
  carregarAngulosUsadosPorPersona,
  carregarDuracaoMediaPorEtapa,
  carregarPersona,
  carregarPersonaFormulario,
  carregarPostsRecentes,
  carregarPropriedade,
  carregarResumoVisaoGeral,
  contarPostsPublicadosDesde,
  criarPautaDePersona,
  excluirItemChecklist,
  listarChecklistPorPropriedade,
  listarEtapasConcluidasRecentes,
  listarEtapasEmAndamento,
  listarMatrizes,
  listarPautasPorStatus,
  listarPersonasAtivasComAngulosDisponiveis,
  listarPostsPublicados,
  listarPropriedades,
  listarUnidadesNegocio,
  reabrirPauta,
  registrarEtapa,
  salvarCredencialCanal,
  salvarItemChecklist,
  salvarMatriz,
  salvarPersona,
  salvarPropriedade,
  salvarRascunho,
} from "./repositorio";
import { decifrar } from "./criptografia";
import type { ConteudoGerado, PersonaFormulario } from "./tipos";
import type { ImagemSecundaria } from "./imagens/secundarias";

vi.mock("@/lib/supabase/admin");

beforeAll(() => {
  process.env.MARKETING_CREDENCIAIS_CHAVE = "chave-de-teste-nao-usar-em-producao";
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

type ResultadoQuery = { data: unknown; error: { message: string } | null; count?: number | null };

/**
 * Fake mínimo do query builder do supabase-js: cada método de filtro/mutação retorna o próprio
 * builder (permitindo encadear qualquer sequência, como o SDK real faz), e tanto `.single()`/
 * `.maybeSingle()` quanto o `await` direto do builder (via `.then`, que o SDK real também
 * implementa — é "thenable") resolvem pro mesmo resultado configurado.
 */
function criarQueryFalsa(resultado: ResultadoQuery) {
  const metodosEncadeaveis = [
    "select",
    "eq",
    "neq",
    "order",
    "limit",
    "lt",
    "lte",
    "gte",
    "in",
    "not",
    "is",
    "update",
    "insert",
    "upsert",
    "delete",
  ] as const;

  const builder: Record<string, unknown> = {};
  for (const metodo of metodosEncadeaveis) {
    builder[metodo] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(resultado));
  builder.maybeSingle = vi.fn(() => Promise.resolve(resultado));
  builder.then = (resolve: (v: ResultadoQuery) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(resultado).then(resolve, reject);
  return builder;
}

function mockarFrom(...buildersEmOrdem: ReturnType<typeof criarQueryFalsa>[]) {
  const from = vi.fn();
  for (const builder of buildersEmOrdem) {
    from.mockReturnValueOnce(builder);
  }
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return from;
}

const erro = { message: "erro de teste" };

describe("carregarPropriedade", () => {
  it("mapeia posts_por_dia/janela_publicacao quando presentes no config_pipeline (Task 4)", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: {
          id: "prop-1",
          nome: "Site Teste",
          url_base: "https://teste.exemplo.com",
          tipo_cms: "wordpress",
          config_pipeline: { max_tentativas: 5, posts_por_dia: 3, janela_publicacao: { inicio: "08:00", fim: "20:00" } },
        },
        error: null,
      }),
    );

    const propriedade = await carregarPropriedade("prop-1");

    expect(propriedade).toEqual({
      id: "prop-1",
      nome: "Site Teste",
      urlBase: "https://teste.exemplo.com",
      tipoCms: "wordpress",
      maxTentativas: 5,
      postsPorDia: 3,
      janelaPublicacao: { inicio: "08:00", fim: "20:00" },
      autoria: null,
    });
  });

  // Regressão: propriedades já em produção, criadas antes da Fase 2, não têm essas chaves no
  // config_pipeline — carregarPropriedade não pode passar a exigi-las nem quebrar por causa disso.
  it("deixa postsPorDia/janelaPublicacao undefined quando config_pipeline não os tem (regressão Fase 1)", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: {
          id: "prop-1",
          nome: "Site Teste",
          url_base: "https://teste.exemplo.com",
          tipo_cms: "wordpress",
          config_pipeline: { max_tentativas: 3 },
        },
        error: null,
      }),
    );

    const propriedade = await carregarPropriedade("prop-1");

    expect(propriedade.postsPorDia).toBeUndefined();
    expect(propriedade.janelaPublicacao).toBeUndefined();
    expect(propriedade.maxTentativas).toBe(3);
  });

  // Gap real deixado pela Fase 2 (Task 5 desta sessão, spec seção 143 do design das telas):
  // carregarPropriedade nunca selecionava credenciais_canais, então processar-pauta.ts nunca
  // conseguia usar a credencial cifrada salva pela tela Propriedades Digitais — só o fallback de
  // env var funcionava, mesmo em produção. Corrigido junto com credenciaisWordPressDaPropriedade
  // (processar-pauta.ts) nesta mesma sessão.
  it("mapeia credenciais_canais.wordpress pra credenciaisCanais.wordpress (senha continua cifrada, não decifra aqui)", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: {
          id: "prop-1",
          nome: "Site Teste",
          url_base: "https://teste.exemplo.com",
          tipo_cms: "wordpress",
          config_pipeline: { max_tentativas: 3 },
          credenciais_canais: { wordpress: { usuario: "admin", senha_cifrada: "CIFRADO-XYZ" } },
        },
        error: null,
      }),
    );

    const propriedade = await carregarPropriedade("prop-1");

    expect(propriedade.credenciaisCanais).toEqual({ wordpress: { usuario: "admin", senhaCifrada: "CIFRADO-XYZ" } });
  });

  it("deixa credenciaisCanais undefined quando não há senha_cifrada salva pro canal wordpress", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: {
          id: "prop-1",
          nome: "Site Teste",
          url_base: "https://teste.exemplo.com",
          tipo_cms: "wordpress",
          config_pipeline: { max_tentativas: 3 },
          credenciais_canais: {},
        },
        error: null,
      }),
    );

    const propriedade = await carregarPropriedade("prop-1");

    expect(propriedade.credenciaisCanais).toBeUndefined();
  });

  it("lança erro claro quando a propriedade não é encontrada", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: null }));

    await expect(carregarPropriedade("prop-x")).rejects.toThrow(/Falha ao carregar propriedade prop-x/);
  });

  // Fase 4a, Task 3 (19/08/2026) — autoria vive em coluna própria (autoria jsonb), não em
  // config_pipeline. `null` quando a propriedade não tem autoria configurada, objeto completo
  // (snake_case do banco -> camelCase do tipo) quando presente.
  it("mapeia autoria quando presente no banco (snake_case -> camelCase)", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: {
          id: "prop-1",
          nome: "Site Teste",
          url_base: "https://teste.exemplo.com",
          tipo_cms: "wordpress",
          config_pipeline: { max_tentativas: 3 },
          autoria: {
            nome: "Fulano de Tal",
            foto_url: "https://exemplo.com/fulano.jpg",
            bio: "Especialista em recuperação de crédito.",
            especialidade: "Direito do Consumidor",
            empresa: "ArrudaCred",
            credenciais: ["OAB/SP 123456"],
            perfis_profissionais: ["https://linkedin.com/in/fulano"],
          },
        },
        error: null,
      }),
    );

    const propriedade = await carregarPropriedade("prop-1");

    expect(propriedade.autoria).toEqual({
      nome: "Fulano de Tal",
      fotoUrl: "https://exemplo.com/fulano.jpg",
      bio: "Especialista em recuperação de crédito.",
      especialidade: "Direito do Consumidor",
      empresa: "ArrudaCred",
      credenciais: ["OAB/SP 123456"],
      perfisProfissionais: ["https://linkedin.com/in/fulano"],
    });
  });

  it("mapeia autoria como null quando ausente no banco", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: {
          id: "prop-1",
          nome: "Site Teste",
          url_base: "https://teste.exemplo.com",
          tipo_cms: "wordpress",
          config_pipeline: { max_tentativas: 3 },
          autoria: null,
        },
        error: null,
      }),
    );

    const propriedade = await carregarPropriedade("prop-1");

    expect(propriedade.autoria).toBeNull();
  });

  // Fase 4a, Task 3 — os 5 campos de calibração do Revisor vivem em config_pipeline, mesmo padrão
  // de max_tentativas/posts_por_dia/janela_publicacao já mapeados acima.
  it("mapeia os 5 campos de calibração do Revisor quando presentes no config_pipeline", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: {
          id: "prop-1",
          nome: "Site Teste",
          url_base: "https://teste.exemplo.com",
          tipo_cms: "wordpress",
          config_pipeline: {
            max_tentativas: 3,
            score_minimo_aprovacao: 90,
            rigor_ymyl: "alto",
            checar_precisao_factual: false,
            checar_fontes_especificas: true,
            checar_originalidade: false,
          },
        },
        error: null,
      }),
    );

    const propriedade = await carregarPropriedade("prop-1");

    expect(propriedade.scoreMinimoAprovacao).toBe(90);
    expect(propriedade.rigorYmyl).toBe("alto");
    expect(propriedade.checarPrecisaoFactual).toBe(false);
    expect(propriedade.checarFontesEspecificas).toBe(true);
    expect(propriedade.checarOriginalidade).toBe(false);
  });

  // Regressão (Task 2 depende disto): propriedade sem NENHUM dos 5 campos de calibração no
  // config_pipeline precisa continuar produzindo `undefined` nesses 5 campos — NÃO um default
  // inventado aqui (o default é responsabilidade de revisor.ts, ver calcularAprovacao/montarPrompt).
  // Repetir o default nesta camada seria uma segunda fonte de verdade, o risco que o brief desta
  // task pediu pra evitar explicitamente.
  it("regressão: deixa os 5 campos de calibração undefined quando ausentes do config_pipeline (default é do revisor.ts, não daqui)", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: {
          id: "prop-1",
          nome: "Site Teste",
          url_base: "https://teste.exemplo.com",
          tipo_cms: "wordpress",
          config_pipeline: { max_tentativas: 3 },
        },
        error: null,
      }),
    );

    const propriedade = await carregarPropriedade("prop-1");

    expect(propriedade.scoreMinimoAprovacao).toBeUndefined();
    expect(propriedade.rigorYmyl).toBeUndefined();
    expect(propriedade.checarPrecisaoFactual).toBeUndefined();
    expect(propriedade.checarFontesEspecificas).toBeUndefined();
    expect(propriedade.checarOriginalidade).toBeUndefined();
  });
});

describe("contarPostsPublicadosDesde", () => {
  it("conta posts publicados da propriedade desde o instante informado", async () => {
    const builder = criarQueryFalsa({ data: null, error: null, count: 2 });
    mockarFrom(builder);

    const total = await contarPostsPublicadosDesde("prop-1", "2026-08-18T00:00:00-03:00");

    expect(total).toBe(2);
    expect(builder.eq).toHaveBeenCalledWith("propriedade_id", "prop-1");
    expect(builder.eq).toHaveBeenCalledWith("status", "publicado");
    expect(builder.gte).toHaveBeenCalledWith("publicado_em", "2026-08-18T00:00:00-03:00");
  });

  it("retorna 0 quando count vem null", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: null, count: null }));

    expect(await contarPostsPublicadosDesde("prop-1", "2026-08-18T00:00:00-03:00")).toBe(0);
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(contarPostsPublicadosDesde("prop-1", "2026-08-18T00:00:00-03:00")).rejects.toThrow(
      /Falha ao contar posts publicados da propriedade prop-1.*erro de teste/,
    );
  });
});

describe("listarPropriedades", () => {
  it("mapeia propriedade + credenciais sem nunca expor a senha", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: [
          {
            id: "prop-1",
            nome: "Site Teste",
            url_base: "https://teste.exemplo.com",
            tipo_cms: "wordpress",
            ativo: true,
            config_pipeline: { max_tentativas: 5, posts_por_dia: 3, janela_publicacao: { inicio: "08:00", fim: "20:00" } },
            credenciais_canais: { wordpress: { usuario: "admin", senha_cifrada: "abc123" } },
          },
        ],
        error: null,
      }),
    );

    const propriedades = await listarPropriedades();

    expect(propriedades).toEqual([
      {
        id: "prop-1",
        nome: "Site Teste",
        urlBase: "https://teste.exemplo.com",
        tipoCms: "wordpress",
        ativo: true,
        maxTentativas: 5,
        postsPorDia: 3,
        janelaPublicacao: { inicio: "08:00", fim: "20:00" },
        credenciais: { wordpress: { usuario: "admin", senhaConfigurada: true } },
        autoria: null,
      },
    ]);
  });

  it("aplica defaults quando config_pipeline/credenciais_canais estão vazios", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: [
          {
            id: "prop-2",
            nome: "Site Sem Config",
            url_base: "https://x.com",
            tipo_cms: "wordpress",
            ativo: true,
            config_pipeline: {},
            credenciais_canais: {},
          },
        ],
        error: null,
      }),
    );

    const [propriedade] = await listarPropriedades();

    expect(propriedade.maxTentativas).toBe(3);
    expect(propriedade.postsPorDia).toBeNull();
    expect(propriedade.janelaPublicacao).toBeNull();
    expect(propriedade.credenciais).toEqual({});
    expect(propriedade.autoria).toBeNull();
  });

  it("mapeia autoria quando presente (Fase 4a, Task 3)", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: [
          {
            id: "prop-3",
            nome: "Site Com Autoria",
            url_base: "https://y.com",
            tipo_cms: "wordpress",
            ativo: true,
            config_pipeline: {},
            credenciais_canais: {},
            autoria: {
              nome: "Fulano",
              foto_url: "https://y.com/fulano.jpg",
              bio: "Bio curta.",
              especialidade: "Crédito",
              empresa: "ArrudaCred",
              credenciais: [],
              perfis_profissionais: [],
            },
          },
        ],
        error: null,
      }),
    );

    const [propriedade] = await listarPropriedades();

    expect(propriedade.autoria).toEqual({
      nome: "Fulano",
      fotoUrl: "https://y.com/fulano.jpg",
      bio: "Bio curta.",
      especialidade: "Crédito",
      empresa: "ArrudaCred",
      credenciais: [],
      perfisProfissionais: [],
    });
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(listarPropriedades()).rejects.toThrow(/Falha ao listar propriedades.*erro de teste/);
  });
});

describe("listarUnidadesNegocio", () => {
  // Task 7: a tela de Propriedades Digitais precisa de um seletor de Unidade de Negócio (o "dono"
  // da propriedade, exigido pela constraint chk_propriedade_tem_dono do banco) — mesma tabela já
  // consultada por src/lib/vendas/fornecedores.ts, aqui só id+nome pro <select>.
  it("lista id e nome das unidades de negócio, ordenadas por nome", async () => {
    const builder = criarQueryFalsa({
      data: [
        { id: "un-2", nome: "Voz do Crédito" },
        { id: "un-1", nome: "ArrudaCred" },
      ],
      error: null,
    });
    mockarFrom(builder);

    const unidades = await listarUnidadesNegocio();

    expect(unidades).toEqual([
      { id: "un-2", nome: "Voz do Crédito" },
      { id: "un-1", nome: "ArrudaCred" },
    ]);
    expect(builder.select).toHaveBeenCalledWith("id, nome");
    expect(builder.order).toHaveBeenCalledWith("nome", { ascending: true });
  });

  it("retorna lista vazia quando não há unidades de negócio", async () => {
    mockarFrom(criarQueryFalsa({ data: [], error: null }));

    expect(await listarUnidadesNegocio()).toEqual([]);
  });

  it("retorna lista vazia quando data vem null", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: null }));

    expect(await listarUnidadesNegocio()).toEqual([]);
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(listarUnidadesNegocio()).rejects.toThrow(/Falha ao listar unidades de negócio.*erro de teste/);
  });
});

describe("salvarPropriedade", () => {
  it("cria uma propriedade nova (sem id) com config_pipeline default", async () => {
    const from = mockarFrom(
      criarQueryFalsa({
        data: {
          id: "prop-novo",
          nome: "Novo Site",
          url_base: "https://novo.com",
          tipo_cms: "wordpress",
          ativo: true,
          config_pipeline: { max_tentativas: 3, posts_por_dia: null, janela_publicacao: null },
          credenciais_canais: {},
        },
        error: null,
      }),
    );

    const propriedade = await salvarPropriedade({
      nome: "Novo Site",
      urlBase: "https://novo.com",
      tipoCms: "wordpress",
      maxTentativas: 3,
      pessoaId: "pessoa-1",
    });

    expect(propriedade.id).toBe("prop-novo");
    expect(from).toHaveBeenCalledTimes(1); // sem id -> não lê config existente, só insere
  });

  it("em atualização, mescla max_tentativas/posts_por_dia/janela_publicacao SEM apagar outras chaves do config_pipeline (ex.: canais_distribuicao)", async () => {
    mockarFrom(
      criarQueryFalsa({ data: { config_pipeline: { max_tentativas: 3, canais_distribuicao: ["gmb"] } }, error: null }),
      criarQueryFalsa({
        data: {
          id: "prop-1",
          nome: "Site Editado",
          url_base: "https://x.com",
          tipo_cms: "wordpress",
          ativo: true,
          config_pipeline: { max_tentativas: 5, canais_distribuicao: ["gmb"], posts_por_dia: 2, janela_publicacao: null },
          credenciais_canais: {},
        },
        error: null,
      }),
    );

    const linhaEscritaSpy = vi.fn();
    // Reconstrói o segundo builder pra capturar o payload de update — mais simples criar aqui.
    const supabaseFalso = {
      from: vi.fn(),
    };
    let chamada = 0;
    supabaseFalso.from.mockImplementation(() => {
      chamada += 1;
      if (chamada === 1) {
        return criarQueryFalsa({ data: { config_pipeline: { max_tentativas: 3, canais_distribuicao: ["gmb"] } }, error: null });
      }
      const builder = criarQueryFalsa({
        data: {
          id: "prop-1",
          nome: "Site Editado",
          url_base: "https://x.com",
          tipo_cms: "wordpress",
          ativo: true,
          config_pipeline: { max_tentativas: 5, canais_distribuicao: ["gmb"], posts_por_dia: 2, janela_publicacao: null },
          credenciais_canais: {},
        },
        error: null,
      });
      const updateOriginal = builder.update as unknown as (arg: unknown) => unknown;
      builder.update = vi.fn((arg: unknown) => {
        linhaEscritaSpy(arg);
        return updateOriginal(arg);
      });
      return builder;
    });
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);

    const propriedade = await salvarPropriedade({
      id: "prop-1",
      nome: "Site Editado",
      urlBase: "https://x.com",
      tipoCms: "wordpress",
      maxTentativas: 5,
      postsPorDia: 2,
    });

    expect(propriedade.maxTentativas).toBe(5);
    expect(linhaEscritaSpy).toHaveBeenCalledWith(
      expect.objectContaining({ config_pipeline: expect.objectContaining({ canais_distribuicao: ["gmb"], max_tentativas: 5 }) }),
    );
  });

  it("lança erro claro quando a propriedade a atualizar não é encontrada", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: null }));

    await expect(
      salvarPropriedade({ id: "prop-inexistente", nome: "X", urlBase: "https://x.com", tipoCms: "wordpress", maxTentativas: 3 }),
    ).rejects.toThrow(/Falha ao carregar propriedade prop-inexistente/);
  });

  it("lança erro claro quando a query de salvar falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(
      salvarPropriedade({ nome: "X", urlBase: "https://x.com", tipoCms: "wordpress", maxTentativas: 3, pessoaId: "p1" }),
    ).rejects.toThrow(/Falha ao salvar propriedade "X".*erro de teste/);
  });

  // Fase 4a, Task 3 (19/08/2026) — os 5 campos de calibração do Revisor gravam nas mesmas chaves
  // snake_case que carregarPropriedade lê de volta (score_minimo_aprovacao/rigor_ymyl/checar_*).
  it("grava os campos de calibração informados no config_pipeline", async () => {
    let linhaEscritaGravada: Record<string, unknown> | undefined;
    const supabaseFalso = { from: vi.fn() };
    let chamada = 0;
    supabaseFalso.from.mockImplementation(() => {
      chamada += 1;
      if (chamada === 1) return criarQueryFalsa({ data: { config_pipeline: { max_tentativas: 3 } }, error: null });
      const builder = criarQueryFalsa({
        data: { id: "prop-1", nome: "Site", url_base: "https://x.com", tipo_cms: "wordpress", ativo: true, config_pipeline: {}, credenciais_canais: {} },
        error: null,
      });
      const updateOriginal = builder.update as unknown as (arg: unknown) => unknown;
      builder.update = vi.fn((arg: Record<string, unknown>) => {
        linhaEscritaGravada = arg;
        return updateOriginal(arg);
      });
      return builder;
    });
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);

    await salvarPropriedade({
      id: "prop-1",
      nome: "Site",
      urlBase: "https://x.com",
      tipoCms: "wordpress",
      maxTentativas: 3,
      scoreMinimoAprovacao: 90,
      rigorYmyl: "alto",
      checarPrecisaoFactual: false,
      checarFontesEspecificas: true,
      checarOriginalidade: false,
    });

    expect(linhaEscritaGravada?.config_pipeline).toEqual(
      expect.objectContaining({
        score_minimo_aprovacao: 90,
        rigor_ymyl: "alto",
        checar_precisao_factual: false,
        checar_fontes_especificas: true,
        checar_originalidade: false,
      }),
    );
  });

  // Não-regressão (mesmo espírito do teste de canais_distribuicao acima): salvar a propriedade sem
  // informar os campos de calibração (chamador que ainda não conhece esses campos — caso de toda a
  // base de código hoje, a tela ainda não os expõe) não pode apagar um valor de calibração já salvo
  // numa sessão anterior. Diferente de max_tentativas/posts_por_dia (sempre reescritos com o que
  // vier em `dados`, `?? null` inclusive): calibração ausente em `dados` (undefined) precisa
  // PRESERVAR o que já estava no config_pipeline, não sobrescrever com undefined/apagar a chave.
  it("preserva score_minimo_aprovacao já salvo quando a chamada não informa esse campo (não força wipe)", async () => {
    let linhaEscritaGravada: Record<string, unknown> | undefined;
    const supabaseFalso = { from: vi.fn() };
    let chamada = 0;
    supabaseFalso.from.mockImplementation(() => {
      chamada += 1;
      if (chamada === 1) {
        return criarQueryFalsa({ data: { config_pipeline: { max_tentativas: 3, score_minimo_aprovacao: 90, rigor_ymyl: "alto" } }, error: null });
      }
      const builder = criarQueryFalsa({
        data: { id: "prop-1", nome: "Site", url_base: "https://x.com", tipo_cms: "wordpress", ativo: true, config_pipeline: {}, credenciais_canais: {} },
        error: null,
      });
      const updateOriginal = builder.update as unknown as (arg: unknown) => unknown;
      builder.update = vi.fn((arg: Record<string, unknown>) => {
        linhaEscritaGravada = arg;
        return updateOriginal(arg);
      });
      return builder;
    });
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);

    // Sem nenhum campo de calibração no payload — simula a tela atual, que ainda não os envia.
    await salvarPropriedade({ id: "prop-1", nome: "Site", urlBase: "https://x.com", tipoCms: "wordpress", maxTentativas: 5 });

    expect(linhaEscritaGravada?.config_pipeline).toEqual(
      expect.objectContaining({ score_minimo_aprovacao: 90, rigor_ymyl: "alto", max_tentativas: 5 }),
    );
  });

  // Fase 4a, Task 3 — autoria é coluna própria (não faz parte do config_pipeline).
  it("grava autoria como coluna própria (fora do config_pipeline) quando informada", async () => {
    let linhaEscritaGravada: Record<string, unknown> | undefined;
    const supabaseFalso = { from: vi.fn() };
    let chamada = 0;
    supabaseFalso.from.mockImplementation(() => {
      chamada += 1;
      if (chamada === 1) return criarQueryFalsa({ data: { config_pipeline: { max_tentativas: 3 } }, error: null });
      const builder = criarQueryFalsa({
        data: { id: "prop-1", nome: "Site", url_base: "https://x.com", tipo_cms: "wordpress", ativo: true, config_pipeline: {}, credenciais_canais: {} },
        error: null,
      });
      const updateOriginal = builder.update as unknown as (arg: unknown) => unknown;
      builder.update = vi.fn((arg: Record<string, unknown>) => {
        linhaEscritaGravada = arg;
        return updateOriginal(arg);
      });
      return builder;
    });
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);

    const autoria = {
      nome: "Fulano",
      fotoUrl: "https://x.com/f.jpg",
      bio: "Bio",
      especialidade: "Crédito",
      empresa: "ArrudaCred",
      credenciais: ["OAB 1"],
      perfisProfissionais: ["https://linkedin.com/in/fulano"],
    };

    await salvarPropriedade({ id: "prop-1", nome: "Site", urlBase: "https://x.com", tipoCms: "wordpress", maxTentativas: 3, autoria });

    expect(linhaEscritaGravada?.autoria).toEqual(autoria);
    expect(linhaEscritaGravada?.config_pipeline).not.toHaveProperty("autoria");
  });

  it("não mexe na coluna autoria quando não informada (undefined preserva o valor já salvo)", async () => {
    let linhaEscritaGravada: Record<string, unknown> | undefined;
    const supabaseFalso = { from: vi.fn() };
    let chamada = 0;
    supabaseFalso.from.mockImplementation(() => {
      chamada += 1;
      if (chamada === 1) return criarQueryFalsa({ data: { config_pipeline: { max_tentativas: 3 } }, error: null });
      const builder = criarQueryFalsa({
        data: { id: "prop-1", nome: "Site", url_base: "https://x.com", tipo_cms: "wordpress", ativo: true, config_pipeline: {}, credenciais_canais: {} },
        error: null,
      });
      const updateOriginal = builder.update as unknown as (arg: unknown) => unknown;
      builder.update = vi.fn((arg: Record<string, unknown>) => {
        linhaEscritaGravada = arg;
        return updateOriginal(arg);
      });
      return builder;
    });
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);

    await salvarPropriedade({ id: "prop-1", nome: "Site", urlBase: "https://x.com", tipoCms: "wordpress", maxTentativas: 3 });

    expect(linhaEscritaGravada).not.toHaveProperty("autoria");
  });
});

describe("salvarCredencialCanal", () => {
  it("cifra a senha e grava usuário + senha_cifrada quando não há credencial anterior", async () => {
    let payloadGravado: Record<string, unknown> | undefined;
    const supabaseFalso = { from: vi.fn() };
    let chamada = 0;
    supabaseFalso.from.mockImplementation(() => {
      chamada += 1;
      if (chamada === 1) return criarQueryFalsa({ data: { credenciais_canais: {} }, error: null });
      const builder = criarQueryFalsa({ data: null, error: null });
      const updateOriginal = builder.update as unknown as (arg: unknown) => unknown;
      builder.update = vi.fn((arg: Record<string, unknown>) => {
        payloadGravado = arg;
        return updateOriginal(arg);
      });
      return builder;
    });
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);

    await salvarCredencialCanal("prop-1", "wordpress", "admin", "minha-senha-secreta");

    const credenciais = payloadGravado?.credenciais_canais as Record<string, { usuario: string; senha_cifrada: string }>;
    expect(credenciais.wordpress.usuario).toBe("admin");
    expect(decifrar(credenciais.wordpress.senha_cifrada)).toBe("minha-senha-secreta");
  });

  // Step 2 do brief: não-regressão — senhaPlana vazia não pode sobrescrever a senha_cifrada já salva.
  it("com senhaPlana vazia, mantém a senha_cifrada já salva e só atualiza o usuário se enviado", async () => {
    let payloadGravado: Record<string, unknown> | undefined;
    const supabaseFalso = { from: vi.fn() };
    let chamada = 0;
    supabaseFalso.from.mockImplementation(() => {
      chamada += 1;
      if (chamada === 1) {
        return criarQueryFalsa({
          data: { credenciais_canais: { wordpress: { usuario: "admin-antigo", senha_cifrada: "CIFRADO-JA-SALVO" } } },
          error: null,
        });
      }
      const builder = criarQueryFalsa({ data: null, error: null });
      const updateOriginal = builder.update as unknown as (arg: unknown) => unknown;
      builder.update = vi.fn((arg: Record<string, unknown>) => {
        payloadGravado = arg;
        return updateOriginal(arg);
      });
      return builder;
    });
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);

    await salvarCredencialCanal("prop-1", "wordpress", "admin-novo", "");

    const credenciais = payloadGravado?.credenciais_canais as Record<string, { usuario: string; senha_cifrada: string }>;
    expect(credenciais.wordpress.senha_cifrada).toBe("CIFRADO-JA-SALVO");
    expect(credenciais.wordpress.usuario).toBe("admin-novo");
  });

  // Gêmeo do teste acima (não-regressão de senha), mas pro campo usuario: enviar usuario vazio
  // não pode apagar o usuario já salvo — só sobrescreve quando vier preenchido.
  it("com usuario vazio, mantém o usuario já salvo e só atualiza a senha se enviada", async () => {
    let payloadGravado: Record<string, unknown> | undefined;
    const supabaseFalso = { from: vi.fn() };
    let chamada = 0;
    supabaseFalso.from.mockImplementation(() => {
      chamada += 1;
      if (chamada === 1) {
        return criarQueryFalsa({
          data: { credenciais_canais: { wordpress: { usuario: "admin-antigo", senha_cifrada: "CIFRADO-ANTIGO" } } },
          error: null,
        });
      }
      const builder = criarQueryFalsa({ data: null, error: null });
      const updateOriginal = builder.update as unknown as (arg: unknown) => unknown;
      builder.update = vi.fn((arg: Record<string, unknown>) => {
        payloadGravado = arg;
        return updateOriginal(arg);
      });
      return builder;
    });
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);

    await salvarCredencialCanal("prop-1", "wordpress", "", "senha-nova");

    const credenciais = payloadGravado?.credenciais_canais as Record<string, { usuario: string; senha_cifrada: string }>;
    expect(credenciais.wordpress.usuario).toBe("admin-antigo");
    expect(decifrar(credenciais.wordpress.senha_cifrada)).toBe("senha-nova");
  });

  it("preserva credenciais de outros canais ao salvar uma", async () => {
    let payloadGravado: Record<string, unknown> | undefined;
    const supabaseFalso = { from: vi.fn() };
    let chamada = 0;
    supabaseFalso.from.mockImplementation(() => {
      chamada += 1;
      if (chamada === 1) {
        return criarQueryFalsa({
          data: { credenciais_canais: { gmb: { usuario: "conta-gmb", senha_cifrada: "CIFRADO-GMB" } } },
          error: null,
        });
      }
      const builder = criarQueryFalsa({ data: null, error: null });
      const updateOriginal = builder.update as unknown as (arg: unknown) => unknown;
      builder.update = vi.fn((arg: Record<string, unknown>) => {
        payloadGravado = arg;
        return updateOriginal(arg);
      });
      return builder;
    });
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);

    await salvarCredencialCanal("prop-1", "wordpress", "admin", "senha-nova");

    const credenciais = payloadGravado?.credenciais_canais as Record<string, { usuario: string; senha_cifrada: string }>;
    expect(credenciais.gmb).toEqual({ usuario: "conta-gmb", senha_cifrada: "CIFRADO-GMB" });
  });

  it("lança erro claro quando a propriedade não é encontrada", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: null }));

    await expect(salvarCredencialCanal("prop-x", "wordpress", "admin", "senha")).rejects.toThrow(/Falha ao carregar credenciais da propriedade prop-x/);
  });

  it("lança erro claro quando a query de update falha", async () => {
    mockarFrom(criarQueryFalsa({ data: { credenciais_canais: {} }, error: null }), criarQueryFalsa({ data: null, error: erro }));

    await expect(salvarCredencialCanal("prop-1", "wordpress", "admin", "senha")).rejects.toThrow(
      /Falha ao salvar credencial do canal wordpress.*erro de teste/,
    );
  });
});

describe("listarMatrizes", () => {
  it("mapeia temas/angulos/geografias a partir de eixos", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: [
          {
            id: "matriz-1",
            propriedade_id: "prop-1",
            nome: "Matriz Principal",
            ativo: true,
            eixos: { temas: ["limpar nome"], angulos: ["urgencia"], geografias: ["SP"], sazonalidade: ["dezembro"] },
          },
        ],
        error: null,
      }),
    );

    const matrizes = await listarMatrizes("prop-1");

    expect(matrizes).toEqual([
      {
        id: "matriz-1",
        propriedadeId: "prop-1",
        nome: "Matriz Principal",
        ativo: true,
        temas: ["limpar nome"],
        angulos: ["urgencia"],
        geografias: ["SP"],
        sazonalidade: ["dezembro"],
      },
    ]);
  });

  it("aplica defaults quando eixos está vazio", async () => {
    mockarFrom(
      criarQueryFalsa({ data: [{ id: "matriz-2", propriedade_id: "prop-1", nome: "Matriz Vazia", ativo: true, eixos: {} }], error: null }),
    );

    const [matriz] = await listarMatrizes("prop-1");

    expect(matriz.temas).toEqual([]);
    expect(matriz.angulos).toEqual([]);
    expect(matriz.geografias).toBeNull();
    expect(matriz.sazonalidade).toEqual([]);
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(listarMatrizes("prop-1")).rejects.toThrow(/Falha ao listar matrizes da propriedade prop-1.*erro de teste/);
  });
});

describe("salvarMatriz", () => {
  it("cria uma matriz nova", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: { id: "matriz-nova", propriedade_id: "prop-1", nome: "Nova Matriz", ativo: true, eixos: {} },
        error: null,
      }),
    );

    const matriz = await salvarMatriz({ propriedadeId: "prop-1", nome: "Nova Matriz" });

    expect(matriz.id).toBe("matriz-nova");
  });

  it("atualiza nome/ativo sem tocar em eixos", async () => {
    const builder = criarQueryFalsa({
      data: { id: "matriz-1", propriedade_id: "prop-1", nome: "Renomeada", ativo: false, eixos: { temas: ["já existia"] } },
      error: null,
    });
    mockarFrom(builder);

    const matriz = await salvarMatriz({ id: "matriz-1", propriedadeId: "prop-1", nome: "Renomeada", ativo: false });

    expect(builder.update).toHaveBeenCalledWith({ propriedade_id: "prop-1", nome: "Renomeada", ativo: false });
    expect(matriz.temas).toEqual(["já existia"]);
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(salvarMatriz({ propriedadeId: "prop-1", nome: "X" })).rejects.toThrow(/Falha ao salvar matriz "X".*erro de teste/);
  });
});

describe("carregarPersonaFormulario", () => {
  // Renomeada de carregarPersona (Fase 3, Task 2) — nome cedido pro carregarPersona novo da tabela
  // `personas` (modelo de persona rica). Ver comentário na função em repositorio.ts.
  it("retorna null quando a matriz não tem persona ainda", async () => {
    mockarFrom(criarQueryFalsa({ data: { eixos: { temas: ["x"] } }, error: null }));

    expect(await carregarPersonaFormulario("matriz-1")).toBeNull();
  });

  it("retorna a persona com defaults pros campos ausentes", async () => {
    mockarFrom(criarQueryFalsa({ data: { eixos: { persona: { nome: "Consumidor Endividado", tomDeVoz: "acolhedor" } } }, error: null }));

    const persona = await carregarPersonaFormulario("matriz-1");

    expect(persona).toEqual({
      nome: "Consumidor Endividado",
      perfilDemografico: "",
      tomDeVoz: "acolhedor",
      nivelConhecimento: "iniciante",
      doresNecessidades: "",
      objecoesTipicas: [],
      vocabularioPreferido: [],
      vocabularioEvitar: [],
    });
  });

  it("lança erro claro quando a matriz não é encontrada", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: null }));

    await expect(carregarPersonaFormulario("matriz-x")).rejects.toThrow(/Falha ao carregar persona da matriz matriz-x/);
  });
});

describe("salvarPersona", () => {
  const personaCompleta: PersonaFormulario = {
    nome: "Consumidor Endividado",
    perfilDemografico: "Classe C, 30-50 anos",
    tomDeVoz: "acolhedor, sem juridiquês",
    nivelConhecimento: "iniciante",
    doresNecessidades: "medo de ser enganado",
    objecoesTipicas: ["\"isso é golpe?\""],
    vocabularioPreferido: ["limpar o nome"],
    vocabularioEvitar: ["adimplência"],
  };

  // Step 3 do brief: merge, não substituição — eixos.temas/angulos preexistentes não podem sumir.
  it("mescla persona em eixos, preservando temas/angulos/geografias já existentes", async () => {
    let payloadGravado: Record<string, unknown> | undefined;
    const supabaseFalso = { from: vi.fn() };
    let chamada = 0;
    supabaseFalso.from.mockImplementation(() => {
      chamada += 1;
      if (chamada === 1) {
        return criarQueryFalsa({
          data: { eixos: { temas: ["limpar nome", "score de crédito"], angulos: ["urgencia_temporal"], geografias: ["SP", "RJ"] } },
          error: null,
        });
      }
      const builder = criarQueryFalsa({ data: null, error: null });
      const updateOriginal = builder.update as unknown as (arg: unknown) => unknown;
      builder.update = vi.fn((arg: Record<string, unknown>) => {
        payloadGravado = arg;
        return updateOriginal(arg);
      });
      return builder;
    });
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);

    await salvarPersona("matriz-1", personaCompleta);

    const eixosGravados = payloadGravado?.eixos as Record<string, unknown>;
    expect(eixosGravados.temas).toEqual(["limpar nome", "score de crédito"]);
    expect(eixosGravados.angulos).toEqual(["urgencia_temporal"]);
    expect(eixosGravados.geografias).toEqual(["SP", "RJ"]);
    expect(eixosGravados.persona).toEqual(personaCompleta);
  });

  it("lança erro claro quando a matriz não é encontrada", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: null }));

    await expect(salvarPersona("matriz-x", personaCompleta)).rejects.toThrow(/Falha ao carregar eixos da matriz matriz-x/);
  });

  it("lança erro claro quando a query de update falha", async () => {
    mockarFrom(criarQueryFalsa({ data: { eixos: {} }, error: null }), criarQueryFalsa({ data: null, error: erro }));

    await expect(salvarPersona("matriz-1", personaCompleta)).rejects.toThrow(/Falha ao salvar persona da matriz matriz-1.*erro de teste/);
  });
});

describe("listarChecklistPorPropriedade", () => {
  it("lista itens da propriedade", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: [{ id: "item-1", propriedade_id: "prop-1", item: "Tem CTA claro", peso: 3, ativo: true }],
        error: null,
      }),
    );

    const itens = await listarChecklistPorPropriedade("prop-1");

    expect(itens).toEqual([{ id: "item-1", propriedadeId: "prop-1", item: "Tem CTA claro", peso: 3, ativo: true }]);
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(listarChecklistPorPropriedade("prop-1")).rejects.toThrow(/Falha ao listar checklist da propriedade prop-1.*erro de teste/);
  });
});

describe("salvarItemChecklist", () => {
  it("cria um item novo", async () => {
    mockarFrom(criarQueryFalsa({ data: { id: "item-novo", propriedade_id: "prop-1", item: "Novo item", peso: 1, ativo: true }, error: null }));

    const item = await salvarItemChecklist({ propriedadeId: "prop-1", item: "Novo item", peso: 1 });

    expect(item.id).toBe("item-novo");
  });

  it("atualiza um item existente", async () => {
    const builder = criarQueryFalsa({ data: { id: "item-1", propriedade_id: "prop-1", item: "Editado", peso: 5, ativo: false }, error: null });
    mockarFrom(builder);

    const item = await salvarItemChecklist({ id: "item-1", propriedadeId: "prop-1", item: "Editado", peso: 5, ativo: false });

    expect(item.peso).toBe(5);
    expect(item.ativo).toBe(false);
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(salvarItemChecklist({ propriedadeId: "prop-1", item: "X", peso: 1 })).rejects.toThrow(
      /Falha ao salvar item de checklist "X".*erro de teste/,
    );
  });
});

describe("excluirItemChecklist", () => {
  it("exclui o item", async () => {
    const builder = criarQueryFalsa({ data: null, error: null });
    mockarFrom(builder);

    await excluirItemChecklist("item-1");

    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("id", "item-1");
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(excluirItemChecklist("item-1")).rejects.toThrow(/Falha ao excluir item de checklist item-1.*erro de teste/);
  });
});

describe("listarPautasPorStatus", () => {
  const pautaBruta = {
    id: "pauta-1",
    matriz_conteudo_id: "matriz-1",
    palavra_chave_principal: "limpar nome",
    palavras_secundarias: [],
    angulo: "urgencia_temporal",
    geografia: null,
    tipo_conteudo: "post_padrao",
    funil: "topo",
    status: "pendente",
    tentativas: 0,
    motivo_ultima_reprovacao: null,
  };

  it("lista sem filtros", async () => {
    mockarFrom(criarQueryFalsa({ data: [pautaBruta], error: null }));

    const pautas = await listarPautasPorStatus();

    expect(pautas[0].id).toBe("pauta-1");
  });

  it("filtra por status quando informado", async () => {
    const builder = criarQueryFalsa({ data: [pautaBruta], error: null });
    mockarFrom(builder);

    await listarPautasPorStatus("pendente");

    expect(builder.eq).toHaveBeenCalledWith("status", "pendente");
  });

  it("filtra por propriedade via join com matrizes_conteudo quando informado", async () => {
    const builder = criarQueryFalsa({ data: [pautaBruta], error: null });
    mockarFrom(builder);

    await listarPautasPorStatus(undefined, "prop-1");

    // As duas asserções são inseparáveis: filtrar por uma coluna de recurso embutido
    // (matrizes_conteudo.propriedade_id) só é válido no PostgREST se esse recurso também
    // tiver sido selecionado como inner join (matrizes_conteudo!inner(...)) na mesma query —
    // sem o embed no select, o filtro sozinho dá 400 em produção. Checar só o .eq() (como este
    // teste fazia antes) não protegeria contra alguém remover o embed do `campos` por engano.
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining("matrizes_conteudo!inner(propriedade_id)"));
    expect(builder.eq).toHaveBeenCalledWith("matrizes_conteudo.propriedade_id", "prop-1");
  });

  it("NÃO inclui o embed matrizes_conteudo no select quando propriedadeId não é informado", async () => {
    const builder = criarQueryFalsa({ data: [pautaBruta], error: null });
    mockarFrom(builder);

    await listarPautasPorStatus("pendente");

    expect(builder.select).not.toHaveBeenCalledWith(expect.stringContaining("matrizes_conteudo"));
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(listarPautasPorStatus()).rejects.toThrow(/Falha ao listar pautas por status.*erro de teste/);
  });

  // Fase 3, 19/08/2026 — mapearPauta (usado por listarPautasPorStatus e todo o resto que lê
  // pautas) ganhou o campo ultimo_rascunho. Testado aqui, no describe que já tem pautaBruta como
  // fixture central, em vez de duplicar a fixture num describe próprio.
  it("mapeia ultimo_rascunho pra ultimoRascunho, convertendo as chaves internas pra camelCase", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: [
          {
            ...pautaBruta,
            ultimo_rascunho: {
              titulo: "Título do rascunho",
              conteudo_html: "<p>Corpo</p>",
              meta_title: "Meta title",
              meta_description: "Meta description",
              slug: "titulo-do-rascunho",
            },
          },
        ],
        error: null,
      }),
    );

    const pautas = await listarPautasPorStatus();

    expect(pautas[0].ultimoRascunho).toEqual({
      titulo: "Título do rascunho",
      conteudoHtml: "<p>Corpo</p>",
      metaTitle: "Meta title",
      metaDescription: "Meta description",
      slug: "titulo-do-rascunho",
    });
  });

  it("deixa ultimoRascunho null quando ultimo_rascunho é null (pauta ainda sem geração, ou anterior a esta coluna existir)", async () => {
    mockarFrom(criarQueryFalsa({ data: [{ ...pautaBruta, ultimo_rascunho: null }], error: null }));

    const pautas = await listarPautasPorStatus();

    expect(pautas[0].ultimoRascunho).toBeNull();
  });
});

describe("salvarRascunho", () => {
  const rascunho: ConteudoGerado = {
    titulo: "Como Limpar o Nome no Serasa",
    conteudoHtml: "<article><h1>Como Limpar o Nome no Serasa</h1></article>",
    metaTitle: "Como Limpar Nome no Serasa | Passo a Passo",
    metaDescription: "Aprenda o passo a passo completo para limpar seu nome no Serasa.",
    slug: "como-limpar-nome-serasa",
  };

  it("grava o rascunho em ultimo_rascunho, convertendo as chaves pra snake_case", async () => {
    const builder = criarQueryFalsa({ data: null, error: null });
    mockarFrom(builder);

    await salvarRascunho("pauta-1", rascunho);

    expect(builder.update).toHaveBeenCalledWith({
      ultimo_rascunho: {
        titulo: "Como Limpar o Nome no Serasa",
        conteudo_html: "<article><h1>Como Limpar o Nome no Serasa</h1></article>",
        meta_title: "Como Limpar Nome no Serasa | Passo a Passo",
        meta_description: "Aprenda o passo a passo completo para limpar seu nome no Serasa.",
        slug: "como-limpar-nome-serasa",
      },
    });
    expect(builder.eq).toHaveBeenCalledWith("id", "pauta-1");
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(salvarRascunho("pauta-1", rascunho)).rejects.toThrow(/Falha ao salvar rascunho da pauta pauta-1.*erro de teste/);
  });
});

// Follow-up 19/08/2026 (arquivamento no Storage, "possível uso futuro") — cobre os dois campos
// novos: imagem_destaque_storage_url (extra.imagemDestaqueStorageUrl) e a chave storage_url dentro
// de cada item de imagens_secundarias (mapearImagemSecundariaBruta, função interna não exportada,
// exercitada aqui só através de atualizarStatusPost).
describe("atualizarStatusPost", () => {
  const imagemSecundariaBase: ImagemSecundaria = {
    url: "https://teste.exemplo.com/doc.png",
    alt: "Alt",
    slug: "doc",
    titulo: "Doc",
    legenda: "Legenda",
    posicaoAposSecao: "depois da introdução",
    storageUrl: null,
  };

  it("grava imagem_destaque_storage_url quando o campo vem preenchido", async () => {
    const builder = criarQueryFalsa({ data: null, error: null });
    mockarFrom(builder);

    await atualizarStatusPost("post-1", "publicado", {
      imagemDestaqueStorageUrl: "https://supabase.exemplo.com/storage/v1/object/public/marketing-imagens/prop-1/pauta-1/capa-x.png",
    });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        imagem_destaque_storage_url: "https://supabase.exemplo.com/storage/v1/object/public/marketing-imagens/prop-1/pauta-1/capa-x.png",
      }),
    );
  });

  it("NÃO grava a coluna quando o campo vem ausente (undefined) — preserva um arquivo de tentativa anterior", async () => {
    const builder = criarQueryFalsa({ data: null, error: null });
    mockarFrom(builder);

    await atualizarStatusPost("post-1", "publicado", {});

    const chamada = (builder.update as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Record<string, unknown>;
    expect(chamada).not.toHaveProperty("imagem_destaque_storage_url");
  });

  it("NÃO grava a coluna quando o campo vem null (mesmo tratamento que undefined, mesma filosofia dos outros 3 campos de imagem)", async () => {
    const builder = criarQueryFalsa({ data: null, error: null });
    mockarFrom(builder);

    await atualizarStatusPost("post-1", "publicado", { imagemDestaqueStorageUrl: null });

    const chamada = (builder.update as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Record<string, unknown>;
    expect(chamada).not.toHaveProperty("imagem_destaque_storage_url");
  });

  it("imagensSecundarias: cada item ganha a chave storage_url (snake_case), presente ou null", async () => {
    const builder = criarQueryFalsa({ data: null, error: null });
    mockarFrom(builder);

    await atualizarStatusPost("post-1", "publicado", {
      imagensSecundarias: [
        { ...imagemSecundariaBase, slug: "com-storage", storageUrl: "https://storage.exemplo.com/com-storage.png" },
        { ...imagemSecundariaBase, slug: "sem-storage", storageUrl: null },
      ],
    });

    const chamada = (builder.update as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { imagens_secundarias: Record<string, unknown>[] };
    expect(chamada.imagens_secundarias).toEqual([
      expect.objectContaining({ slug: "com-storage", storage_url: "https://storage.exemplo.com/com-storage.png" }),
      expect.objectContaining({ slug: "sem-storage", storage_url: null }),
    ]);
  });
});

describe("reabrirPauta", () => {
  it("volta status pra pendente, zera motivo_ultima_reprovacao, e NÃO mexe em tentativas", async () => {
    const builder = criarQueryFalsa({ data: null, error: null });
    mockarFrom(builder);

    await reabrirPauta("pauta-1");

    const payload = (builder.update as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Record<string, unknown>;
    expect(payload.status).toBe("pendente");
    expect(payload.motivo_ultima_reprovacao).toBeNull();
    expect(payload).not.toHaveProperty("tentativas");
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(reabrirPauta("pauta-1")).rejects.toThrow(/Falha ao reabrir pauta pauta-1.*erro de teste/);
  });
});

describe("listarPostsPublicados", () => {
  const postBruto = {
    id: "post-1",
    titulo: "Como Limpar o Nome",
    canais: { wordpress: { url: "https://x.com/limpar-nome" } },
    score_qa: 92,
    publicado_em: "2026-08-01T00:00:00Z",
    tentativas: 1,
  };

  it("mapeia título/url/score/data/tentativas", async () => {
    mockarFrom(criarQueryFalsa({ data: [postBruto], error: null }));

    const posts = await listarPostsPublicados();

    expect(posts).toEqual([
      { id: "post-1", titulo: "Como Limpar o Nome", url: "https://x.com/limpar-nome", scoreQa: 92, publicadoEm: "2026-08-01T00:00:00Z", tentativas: 1 },
    ]);
  });

  it("filtra por propriedade quando informado", async () => {
    const builder = criarQueryFalsa({ data: [postBruto], error: null });
    mockarFrom(builder);

    await listarPostsPublicados("prop-1");

    expect(builder.eq).toHaveBeenCalledWith("propriedade_id", "prop-1");
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(listarPostsPublicados()).rejects.toThrow(/Falha ao listar posts publicados.*erro de teste/);
  });
});

// Fase 4a, Task 3 (19/08/2026) — resolve o TODO deixado pela Task 2 (revisor.test.ts/
// processar-pauta.ts): título + ângulo dos posts publicados recentes desta propriedade, pro
// Revisor julgar originalidade_adequada (spec seção 3.1, "Contexto novo no prompt do Revisor").
// Função dedicada (não extensão de listarPostsPublicados, que serve a tela de admin e não carrega
// ângulo, campo que vive em `pautas`) — ver decisão registrada no relatório desta task.
describe("carregarPostsRecentes", () => {
  it("mapeia titulo/angulo via embed com pautas, mais recentes primeiro", async () => {
    const builder = criarQueryFalsa({
      data: [
        { titulo: "Como Limpar o Nome", pautas: { angulo: "passo_a_passo" } },
        { titulo: "Score de Crédito Explicado", pautas: { angulo: "mitos_e_verdades" } },
      ],
      error: null,
    });
    mockarFrom(builder);

    const posts = await carregarPostsRecentes("prop-1", 10);

    expect(posts).toEqual([
      { titulo: "Como Limpar o Nome", angulo: "passo_a_passo" },
      { titulo: "Score de Crédito Explicado", angulo: "mitos_e_verdades" },
    ]);
    expect(builder.eq).toHaveBeenCalledWith("propriedade_id", "prop-1");
    expect(builder.eq).toHaveBeenCalledWith("status", "publicado");
    expect(builder.order).toHaveBeenCalledWith("publicado_em", { ascending: false });
  });

  it("respeita o parâmetro limite", async () => {
    const builder = criarQueryFalsa({ data: [], error: null });
    mockarFrom(builder);

    await carregarPostsRecentes("prop-1", 5);

    expect(builder.limit).toHaveBeenCalledWith(5);
  });

  it("retorna array vazio quando a propriedade não tem posts publicados ainda (não lança)", async () => {
    mockarFrom(criarQueryFalsa({ data: [], error: null }));

    await expect(carregarPostsRecentes("prop-1", 10)).resolves.toEqual([]);
  });

  it("retorna array vazio quando data vem null", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: null }));

    await expect(carregarPostsRecentes("prop-1", 10)).resolves.toEqual([]);
  });

  it("é defensivo quando o embed de pauta vem vazio/nulo (angulo cai pra string vazia, não quebra)", async () => {
    mockarFrom(criarQueryFalsa({ data: [{ titulo: "Post Órfão", pautas: null }], error: null }));

    const [post] = await carregarPostsRecentes("prop-1", 10);

    expect(post).toEqual({ titulo: "Post Órfão", angulo: "" });
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(carregarPostsRecentes("prop-1", 10)).rejects.toThrow(/Falha ao carregar posts recentes da propriedade prop-1.*erro de teste/);
  });
});

describe("registrarEtapa", () => {
  it("grava início e conclusão de sucesso, retornando o resultado de fn", async () => {
    const builderInsercao = criarQueryFalsa({ data: { id: "log-1" }, error: null });
    const builderUpdate = criarQueryFalsa({ data: null, error: null });
    mockarFrom(builderInsercao, builderUpdate);

    const resultado = await registrarEtapa("pauta-1", "gerar_conteudo", async () => "conteudo-gerado");

    expect(resultado).toBe("conteudo-gerado");
    expect(builderInsercao.insert).toHaveBeenCalledWith({ pauta_id: "pauta-1", etapa: "gerar_conteudo" });
    expect(builderUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ sucesso: true }));
    expect(builderUpdate.eq).toHaveBeenCalledWith("id", "log-1");
  });

  it("grava falha com detalhes e repropaga o erro original de fn", async () => {
    const builderInsercao = criarQueryFalsa({ data: { id: "log-1" }, error: null });
    const builderUpdate = criarQueryFalsa({ data: null, error: null });
    mockarFrom(builderInsercao, builderUpdate);

    await expect(
      registrarEtapa("pauta-1", "gerar_conteudo", async () => {
        throw new Error("Falha da IA");
      }),
    ).rejects.toThrow("Falha da IA");

    expect(builderUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ sucesso: false, detalhes: "Falha da IA" }));
  });

  it("não deixa falha ao GRAVAR o log (insert) impedir fn de rodar (log é observabilidade, não bloqueio)", async () => {
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    const resultado = await registrarEtapa("pauta-1", "gerar_conteudo", async () => "conteudo-gerado");

    expect(resultado).toBe("conteudo-gerado");
    expect(erroSpy).toHaveBeenCalled();
    erroSpy.mockRestore();
  });

  // Task 5: gerarConteudo/revisarConteudo passam a retornar usage junto do resultado de negócio —
  // registrarEtapa precisa aceitar um extrator opcional pra persistir tokens_entrada/tokens_saida
  // na mesma linha de conclusão, sem quebrar chamadores que não passam esse 4º argumento.
  it("persiste tokens_entrada/tokens_saida na conclusão quando um extrator de tokens é passado", async () => {
    const builderInsercao = criarQueryFalsa({ data: { id: "log-1" }, error: null });
    const builderUpdate = criarQueryFalsa({ data: null, error: null });
    mockarFrom(builderInsercao, builderUpdate);

    const resultado = await registrarEtapa(
      "pauta-1",
      "gerar_conteudo",
      async () => ({ resultado: "conteudo-gerado", usage: { inputTokens: 100, outputTokens: 50 } }),
      (r) => ({ tokensEntrada: r.usage.inputTokens, tokensSaida: r.usage.outputTokens }),
    );

    expect(resultado.resultado).toBe("conteudo-gerado");
    expect(builderUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ sucesso: true, tokens_entrada: 100, tokens_saida: 50 }),
    );
  });

  it("continua funcionando sem o extrator de tokens (retrocompatível com chamadores que não o passam)", async () => {
    const builderInsercao = criarQueryFalsa({ data: { id: "log-1" }, error: null });
    const builderUpdate = criarQueryFalsa({ data: null, error: null });
    mockarFrom(builderInsercao, builderUpdate);

    await registrarEtapa("pauta-1", "buscar_checklist", async () => []);

    const payload = (builderUpdate.update as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("tokens_entrada");
    expect(payload).not.toHaveProperty("tokens_saida");
  });

  // Review do Task 5: sem isto, uma rejeição de NEGÓCIO que não lança exceção (revisar reprovando
  // por score baixo, publicar reprovando por verificacao.ok === false) gravava sucesso: true,
  // detalhes: null — indistinguível de uma etapa que realmente teve sucesso, pra quem lê o log
  // (ex.: o Monitor de execução).
  it("persiste detalhes na conclusão de SUCESSO quando um extrator de detalhes é passado (ex.: motivo de uma rejeição de negócio que não lança exceção)", async () => {
    const builderInsercao = criarQueryFalsa({ data: { id: "log-1" }, error: null });
    const builderUpdate = criarQueryFalsa({ data: null, error: null });
    mockarFrom(builderInsercao, builderUpdate);

    const resultado = await registrarEtapa(
      "pauta-1",
      "publicar",
      async () => ({ sucesso: false as const, detalhes: "Rascunho não conforme no WordPress." }),
      undefined,
      (r) => (r.sucesso ? undefined : r.detalhes),
    );

    expect(resultado.sucesso).toBe(false);
    expect(builderUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ sucesso: true, detalhes: "Rascunho não conforme no WordPress." }),
    );
  });

  it("não grava a coluna detalhes na conclusão de sucesso quando o extrator retorna undefined (ex.: etapa publicar realmente publicou)", async () => {
    const builderInsercao = criarQueryFalsa({ data: { id: "log-1" }, error: null });
    const builderUpdate = criarQueryFalsa({ data: null, error: null });
    mockarFrom(builderInsercao, builderUpdate);

    await registrarEtapa(
      "pauta-1",
      "publicar",
      async () => ({ sucesso: true as const }),
      undefined,
      (r) => (r.sucesso ? undefined : "não deveria chegar aqui"),
    );

    const payload = (builderUpdate.update as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("detalhes");
  });
});

describe("carregarResumoVisaoGeral", () => {
  it("agrega contagens por propriedade, publicados na semana, taxa de aprovação e tokens", async () => {
    mockarFrom(
      criarQueryFalsa({ data: [{ id: "prop-1", nome: "Site A" }], error: null }), // propriedades
      criarQueryFalsa({ data: [{ id: "matriz-1", propriedade_id: "prop-1" }], error: null }), // matrizes
      criarQueryFalsa({
        data: [
          { matriz_conteudo_id: "matriz-1", status: "pendente" },
          { matriz_conteudo_id: "matriz-1", status: "pendente" },
          { matriz_conteudo_id: "matriz-1", status: "em_producao" },
          { matriz_conteudo_id: "matriz-1", status: "bloqueada" },
        ],
        error: null,
      }), // pautas
      criarQueryFalsa({ data: null, error: null, count: 4 }), // posts publicados na semana
      criarQueryFalsa({ data: [{ sucesso: true }, { sucesso: true }, { sucesso: false }], error: null }), // revisões
      criarQueryFalsa({ data: [{ tokens_entrada: 100, tokens_saida: 50 }, { tokens_entrada: 200, tokens_saida: 80 }], error: null }), // tokens
    );

    const resumo = await carregarResumoVisaoGeral();

    expect(resumo.porPropriedade).toEqual([{ propriedadeId: "prop-1", propriedadeNome: "Site A", pendentes: 2, emProducao: 1, bloqueadas: 1 }]);
    expect(resumo.publicadosNaSemana).toBe(4);
    expect(resumo.taxaAprovacaoRevisor).toBeCloseTo(2 / 3);
    expect(resumo.tokensEntradaTotal).toBe(300);
    expect(resumo.tokensSaidaTotal).toBe(130);
  });

  it("retorna taxaAprovacaoRevisor null quando não há histórico de revisões", async () => {
    mockarFrom(
      criarQueryFalsa({ data: [], error: null }),
      criarQueryFalsa({ data: [], error: null }),
      criarQueryFalsa({ data: [], error: null }),
      criarQueryFalsa({ data: null, error: null, count: 0 }),
      criarQueryFalsa({ data: [], error: null }),
      criarQueryFalsa({ data: [], error: null }),
    );

    const resumo = await carregarResumoVisaoGeral();

    expect(resumo.taxaAprovacaoRevisor).toBeNull();
    expect(resumo.tokensEntradaTotal).toBe(0);
  });

  it("lança erro claro quando alguma query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(carregarResumoVisaoGeral()).rejects.toThrow(/Falha ao carregar propriedades para o resumo.*erro de teste/);
  });
});

// ---------------------------------------------------------------------------
// Task 13 (Monitor de execução, Realtime) — carga inicial dos 3 blocos + estimativa de progresso.
// ---------------------------------------------------------------------------

describe("listarEtapasEmAndamento", () => {
  it("mapeia etapas sem concluido_em, resolvendo o nome da pauta via embed", async () => {
    const builder = criarQueryFalsa({
      data: [
        {
          id: "log-1",
          pauta_id: "pauta-1",
          etapa: "gerar_conteudo",
          iniciado_em: "2026-08-18T10:00:00Z",
          pautas: { palavra_chave_principal: "limpar nome", status: "em_producao" },
        },
      ],
      error: null,
    });
    mockarFrom(builder);

    const etapas = await listarEtapasEmAndamento();

    expect(etapas).toEqual([
      {
        id: "log-1",
        pautaId: "pauta-1",
        palavraChavePrincipal: "limpar nome",
        etapa: "gerar_conteudo",
        iniciadoEm: "2026-08-18T10:00:00Z",
      },
    ]);
  });

  // As duas asserções protegem a mesma lógica indissociável do embed inner join (mesma lição do
  // Task 3 sobre listarPautasPorStatus): filtrar por `pautas.status` só é válido no PostgREST se
  // `pautas!inner(...)` também estiver no select — checar só o `.eq()` não pegaria alguém removendo
  // o embed do `select()` por engano.
  it("filtra por concluido_em nulo e pautas.status = em_producao via inner join", async () => {
    const builder = criarQueryFalsa({ data: [], error: null });
    mockarFrom(builder);

    await listarEtapasEmAndamento();

    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining("pautas!inner(palavra_chave_principal, status)"));
    expect(builder.is).toHaveBeenCalledWith("concluido_em", null);
    expect(builder.eq).toHaveBeenCalledWith("pautas.status", "em_producao");
  });

  it("usa um rótulo de fallback quando o embed de pauta vem vazio (defensivo)", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: [{ id: "log-1", pauta_id: "pauta-1", etapa: "revisar", iniciado_em: "2026-08-18T10:00:00Z", pautas: null }],
        error: null,
      }),
    );

    const [etapa] = await listarEtapasEmAndamento();

    expect(etapa.palavraChavePrincipal).toBe("(pauta desconhecida)");
  });

  it("retorna lista vazia quando não há etapas em andamento", async () => {
    mockarFrom(criarQueryFalsa({ data: [], error: null }));

    expect(await listarEtapasEmAndamento()).toEqual([]);
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(listarEtapasEmAndamento()).rejects.toThrow(/Falha ao listar etapas em andamento.*erro de teste/);
  });
});

describe("listarEtapasConcluidasRecentes", () => {
  const linhaBruta = {
    id: "log-2",
    pauta_id: "pauta-2",
    etapa: "publicar",
    iniciado_em: "2026-08-18T09:00:00Z",
    concluido_em: "2026-08-18T09:02:30Z",
    sucesso: true,
    detalhes: null,
    pautas: { palavra_chave_principal: "score de crédito" },
  };

  it("mapeia etapas concluídas com sucesso/detalhes/nome da pauta", async () => {
    mockarFrom(criarQueryFalsa({ data: [linhaBruta], error: null }));

    const etapas = await listarEtapasConcluidasRecentes();

    expect(etapas).toEqual([
      {
        id: "log-2",
        pautaId: "pauta-2",
        palavraChavePrincipal: "score de crédito",
        etapa: "publicar",
        iniciadoEm: "2026-08-18T09:00:00Z",
        concluidoEm: "2026-08-18T09:02:30Z",
        sucesso: true,
        detalhes: null,
      },
    ]);
  });

  it("filtra concluido_em não nulo, ordena desc e usa o limite default de 20", async () => {
    const builder = criarQueryFalsa({ data: [], error: null });
    mockarFrom(builder);

    await listarEtapasConcluidasRecentes();

    expect(builder.not).toHaveBeenCalledWith("concluido_em", "is", null);
    expect(builder.order).toHaveBeenCalledWith("concluido_em", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(20);
  });

  it("respeita um limite customizado", async () => {
    const builder = criarQueryFalsa({ data: [], error: null });
    mockarFrom(builder);

    await listarEtapasConcluidasRecentes(5);

    expect(builder.limit).toHaveBeenCalledWith(5);
  });

  it("mapeia sucesso false e detalhes preenchidos (etapa que falhou)", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: [{ ...linhaBruta, sucesso: false, detalhes: "Timeout ao publicar no WordPress." }],
        error: null,
      }),
    );

    const [etapa] = await listarEtapasConcluidasRecentes();

    expect(etapa.sucesso).toBe(false);
    expect(etapa.detalhes).toBe("Timeout ao publicar no WordPress.");
  });

  it("retorna lista vazia quando não há etapas concluídas (tabela ainda vazia, migration pendente)", async () => {
    mockarFrom(criarQueryFalsa({ data: [], error: null }));

    expect(await listarEtapasConcluidasRecentes()).toEqual([]);
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(listarEtapasConcluidasRecentes()).rejects.toThrow(/Falha ao listar etapas concluídas recentes.*erro de teste/);
  });
});

describe("carregarDuracaoMediaPorEtapa", () => {
  it("calcula a média de duração (segundos) por etapa a partir de iniciado_em/concluido_em", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: [
          { etapa: "gerar_conteudo", iniciado_em: "2026-08-18T10:00:00Z", concluido_em: "2026-08-18T10:01:00Z" }, // 60s
          { etapa: "gerar_conteudo", iniciado_em: "2026-08-18T10:00:00Z", concluido_em: "2026-08-18T10:02:00Z" }, // 120s
          { etapa: "revisar", iniciado_em: "2026-08-18T10:00:00Z", concluido_em: "2026-08-18T10:00:30Z" }, // 30s
        ],
        error: null,
      }),
    );

    const duracoes = await carregarDuracaoMediaPorEtapa();

    expect(duracoes.gerar_conteudo).toBe(90);
    expect(duracoes.revisar).toBe(30);
    expect(duracoes.publicar).toBeUndefined();
  });

  it("devolve objeto vazio (não 0, não NaN) quando não há histórico — degrade gracioso pré-migration", async () => {
    mockarFrom(criarQueryFalsa({ data: [], error: null }));

    expect(await carregarDuracaoMediaPorEtapa()).toEqual({});
  });

  it("ignora linhas com duração negativa/inconsistente sem quebrar a média das demais", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: [
          { etapa: "sanitizar", iniciado_em: "2026-08-18T10:00:10Z", concluido_em: "2026-08-18T10:00:00Z" }, // negativa — descartada
          { etapa: "sanitizar", iniciado_em: "2026-08-18T10:00:00Z", concluido_em: "2026-08-18T10:00:10Z" }, // 10s — válida
        ],
        error: null,
      }),
    );

    expect(await carregarDuracaoMediaPorEtapa()).toEqual({ sanitizar: 10 });
  });

  it("consulta com o limite/ordenação corretos e respeita um tamanho de amostra customizado", async () => {
    const builder = criarQueryFalsa({ data: [], error: null });
    mockarFrom(builder);

    await carregarDuracaoMediaPorEtapa(50);

    expect(builder.not).toHaveBeenCalledWith("concluido_em", "is", null);
    expect(builder.order).toHaveBeenCalledWith("concluido_em", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(50);
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(carregarDuracaoMediaPorEtapa()).rejects.toThrow(/Falha ao carregar duração média por etapa.*erro de teste/);
  });
});

// ---------------------------------------------------------------------------
// Fase 3 (personas ricas) — Task 2. Ver
// docs/superpowers/specs/2026-08-18-personas-ricas-geracao-por-persona-design.md seções 3 e 5.
// ---------------------------------------------------------------------------

describe("listarPersonasAtivasComAngulosDisponiveis", () => {
  // Caso exato do worked example da spec seção 5 / brief da Task 2, Step 2: persona com
  // angulos_prontos ["A","B","C"] e uma pauta já registrada com angulo "B" pra essa persona deve
  // devolver angulosProntos ["A","C"] — subtração de conjunto, não é uma query "distinct" simples.
  it("subtrai os ângulos já usados dos angulos_prontos da persona (worked example da spec)", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: [
          {
            id: "persona-1",
            nome: "Marcelo Andrade",
            dor_entrada: "Nome negativado no Serasa há meses, sem conseguir crédito.",
            angulos_prontos: ["A", "B", "C"],
          },
        ],
        error: null,
      }),
      criarQueryFalsa({
        data: [{ persona_id: "persona-1", angulo: "B", created_at: "2026-08-18T10:00:00Z" }],
        error: null,
      }),
    );

    const personas = await listarPersonasAtivasComAngulosDisponiveis("prop-1");

    expect(personas).toEqual([
      {
        id: "persona-1",
        nome: "Marcelo Andrade",
        dorEntrada: "Nome negativado no Serasa há meses, sem conseguir crédito.",
        angulosProntos: ["A", "C"],
        usadaPelaUltimaVezEm: "2026-08-18T10:00:00Z",
      },
    ]);
  });

  // Step 3 do brief: todos os ângulos prontos esgotados não é erro — é o sinal que a Task 4
  // (Estrategista) usa pra decidir ir pro fallback de IA (Gerador de Ângulo).
  it("retorna angulosProntos vazio quando todos os ângulos da persona já foram usados (sinal de esgotamento, não erro)", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: [{ id: "persona-1", nome: "Marcelo Andrade", angulos_prontos: ["A"] }],
        error: null,
      }),
      criarQueryFalsa({
        data: [{ persona_id: "persona-1", angulo: "A", created_at: "2026-08-18T10:00:00Z" }],
        error: null,
      }),
    );

    const [persona] = await listarPersonasAtivasComAngulosDisponiveis("prop-1");

    expect(persona.angulosProntos).toEqual([]);
  });

  it("usadaPelaUltimaVezEm é null quando a persona nunca foi usada em nenhuma pauta", async () => {
    mockarFrom(
      criarQueryFalsa({ data: [{ id: "persona-1", nome: "Marcelo Andrade", angulos_prontos: ["A", "B"] }], error: null }),
      criarQueryFalsa({ data: [], error: null }),
    );

    const [persona] = await listarPersonasAtivasComAngulosDisponiveis("prop-1");

    expect(persona.usadaPelaUltimaVezEm).toBeNull();
    expect(persona.angulosProntos).toEqual(["A", "B"]);
  });

  it("usadaPelaUltimaVezEm é o created_at MAIS RECENTE entre as pautas da persona", async () => {
    mockarFrom(
      criarQueryFalsa({ data: [{ id: "persona-1", nome: "Marcelo Andrade", angulos_prontos: [] }], error: null }),
      criarQueryFalsa({
        data: [
          { persona_id: "persona-1", angulo: "A", created_at: "2026-08-01T10:00:00Z" },
          { persona_id: "persona-1", angulo: "B", created_at: "2026-08-18T10:00:00Z" },
          { persona_id: "persona-1", angulo: "C", created_at: "2026-08-10T10:00:00Z" },
        ],
        error: null,
      }),
    );

    const [persona] = await listarPersonasAtivasComAngulosDisponiveis("prop-1");

    expect(persona.usadaPelaUltimaVezEm).toBe("2026-08-18T10:00:00Z");
  });

  it("filtra por propriedade_id e ativo = true", async () => {
    const builder = criarQueryFalsa({ data: [], error: null });
    mockarFrom(builder);

    await listarPersonasAtivasComAngulosDisponiveis("prop-1");

    expect(builder.eq).toHaveBeenCalledWith("propriedade_id", "prop-1");
    expect(builder.eq).toHaveBeenCalledWith("ativo", true);
  });

  it("retorna lista vazia sem consultar pautas quando a propriedade não tem persona ativa", async () => {
    const from = mockarFrom(criarQueryFalsa({ data: [], error: null }));

    const personas = await listarPersonasAtivasComAngulosDisponiveis("prop-1");

    expect(personas).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1); // não bate em "pautas" sem nenhuma persona pra buscar
  });

  it("lança erro claro quando a query de personas falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(listarPersonasAtivasComAngulosDisponiveis("prop-1")).rejects.toThrow(
      /Falha ao listar personas ativas da propriedade prop-1.*erro de teste/,
    );
  });

  it("lança erro claro quando a query de pautas (pra calcular ângulos usados) falha", async () => {
    mockarFrom(
      criarQueryFalsa({ data: [{ id: "persona-1", nome: "Marcelo Andrade", angulos_prontos: ["A"] }], error: null }),
      criarQueryFalsa({ data: null, error: erro }),
    );

    await expect(listarPersonasAtivasComAngulosDisponiveis("prop-1")).rejects.toThrow(
      /Falha ao carregar pautas das personas da propriedade prop-1.*erro de teste/,
    );
  });
});

describe("carregarPersona", () => {
  it("carrega a persona completa, com conteudoCompleto mapeado", async () => {
    mockarFrom(
      criarQueryFalsa({
        data: {
          id: "persona-1",
          nome: "Marcelo Andrade",
          dor_entrada: "Nome negativado no Serasa há meses, sem conseguir crédito.",
          angulos_prontos: ["A", "B"],
          conteudo_completo: "## Bloco 1 — Ficha rápida\n...",
        },
        error: null,
      }),
    );

    const persona = await carregarPersona("persona-1");

    expect(persona).toEqual({
      id: "persona-1",
      nome: "Marcelo Andrade",
      dorEntrada: "Nome negativado no Serasa há meses, sem conseguir crédito.",
      angulosProntos: ["A", "B"],
      usadaPelaUltimaVezEm: null,
      conteudoCompleto: "## Bloco 1 — Ficha rápida\n...",
    });
  });

  it("lança erro claro quando a persona não é encontrada", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: null }));

    await expect(carregarPersona("persona-x")).rejects.toThrow(/Falha ao carregar persona persona-x/);
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(carregarPersona("persona-1")).rejects.toThrow(/Falha ao carregar persona persona-1.*erro de teste/);
  });
});

describe("carregarAngulosUsadosPorPersona", () => {
  it("lista os ângulos distintos já registrados em pautas pra essa persona", async () => {
    const builder = criarQueryFalsa({
      data: [
        { angulo: "A citação de medo" },
        { angulo: "B citação de urgência" },
        { angulo: "A citação de medo" }, // repetido — dedup
      ],
      error: null,
    });
    mockarFrom(builder);

    const angulos = await carregarAngulosUsadosPorPersona("persona-1");

    expect(angulos).toEqual(["A citação de medo", "B citação de urgência"]);
    expect(builder.eq).toHaveBeenCalledWith("persona_id", "persona-1");
  });

  it("retorna lista vazia quando a persona nunca foi usada", async () => {
    mockarFrom(criarQueryFalsa({ data: [], error: null }));

    expect(await carregarAngulosUsadosPorPersona("persona-1")).toEqual([]);
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(carregarAngulosUsadosPorPersona("persona-1")).rejects.toThrow(
      /Falha ao carregar ângulos usados pela persona persona-1.*erro de teste/,
    );
  });
});

describe("criarPautaDePersona", () => {
  const paramsBase = {
    matrizConteudoId: "matriz-1",
    personaId: "persona-1",
    angulo: "\"Eles disseram que era golpe. Eu disse: 'vamos ver.'\"",
    palavraChavePrincipal: "limpar nome negativado",
    palavrasSecundarias: ["score de crédito", "SPC Serasa"],
    funil: "topo" as const,
    tipoConteudo: "post_storytelling" as const,
  };

  // Step 4 do brief: a pauta nasce DIRETO em em_producao, não pendente — não existe "esperar na
  // fila" neste caminho (o Estrategista já decidiu produzir agora).
  it("cria a pauta já com status em_producao (não pendente)", async () => {
    const builder = criarQueryFalsa({
      data: {
        id: "pauta-nova",
        matriz_conteudo_id: "matriz-1",
        palavra_chave_principal: "limpar nome negativado",
        palavras_secundarias: ["score de crédito", "SPC Serasa"],
        angulo: paramsBase.angulo,
        geografia: null,
        tipo_conteudo: "post_storytelling",
        funil: "topo",
        status: "em_producao",
        tentativas: 0,
        motivo_ultima_reprovacao: null,
      },
      error: null,
    });
    mockarFrom(builder);

    const pauta = await criarPautaDePersona(paramsBase);

    expect(pauta.status).toBe("em_producao");
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        matriz_conteudo_id: "matriz-1",
        persona_id: "persona-1",
        angulo: paramsBase.angulo,
        palavra_chave_principal: "limpar nome negativado",
        palavras_secundarias: ["score de crédito", "SPC Serasa"],
        funil: "topo",
        tipo_conteudo: "post_storytelling",
        geografia: null,
        status: "em_producao",
      }),
    );
  });

  // Spec seção 9, Pendências: personas não têm campo estruturado de geografia — geografia fica
  // sempre null nas pautas geradas por persona.
  it("grava geografia como null (decisão explícita da spec — personas não têm geografia estruturada)", async () => {
    const builder = criarQueryFalsa({
      data: {
        id: "pauta-nova",
        matriz_conteudo_id: "matriz-1",
        palavra_chave_principal: "limpar nome negativado",
        palavras_secundarias: [],
        angulo: paramsBase.angulo,
        geografia: null,
        tipo_conteudo: "post_storytelling",
        funil: "topo",
        status: "em_producao",
        tentativas: 0,
        motivo_ultima_reprovacao: null,
      },
      error: null,
    });
    mockarFrom(builder);

    await criarPautaDePersona(paramsBase);

    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ geografia: null }));
  });

  // prioridade_score não é passado no payload — usa o default da coluna (0), igual a toda pauta.
  it("não envia prioridade_score no payload de insert (usa o default da coluna)", async () => {
    const builder = criarQueryFalsa({
      data: {
        id: "pauta-nova",
        matriz_conteudo_id: "matriz-1",
        palavra_chave_principal: "limpar nome negativado",
        palavras_secundarias: [],
        angulo: paramsBase.angulo,
        geografia: null,
        tipo_conteudo: "post_storytelling",
        funil: "topo",
        status: "em_producao",
        tentativas: 0,
        motivo_ultima_reprovacao: null,
      },
      error: null,
    });
    mockarFrom(builder);

    await criarPautaDePersona(paramsBase);

    const payload = (builder.insert as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("prioridade_score");
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(criarPautaDePersona(paramsBase)).rejects.toThrow(/Falha ao criar pauta a partir da persona persona-1.*erro de teste/);
  });
});
