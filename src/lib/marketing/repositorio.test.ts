// src/lib/marketing/repositorio.test.ts
// Testes UNITÁRIOS — createAdminClient é mockado (vi.mock), nada bate no banco real. Ver
// repositorio.integration.test.ts para os testes que batem no Supabase remoto de verdade.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  carregarPersona,
  carregarPropriedade,
  carregarResumoVisaoGeral,
  contarPostsPublicadosDesde,
  excluirItemChecklist,
  listarChecklistPorPropriedade,
  listarMatrizes,
  listarPautasPorStatus,
  listarPostsPublicados,
  listarPropriedades,
  reabrirPauta,
  registrarEtapa,
  salvarCredencialCanal,
  salvarItemChecklist,
  salvarMatriz,
  salvarPersona,
  salvarPropriedade,
} from "./repositorio";
import { decifrar } from "./criptografia";
import type { PersonaFormulario } from "./tipos";

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

  it("lança erro claro quando a propriedade não é encontrada", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: null }));

    await expect(carregarPropriedade("prop-x")).rejects.toThrow(/Falha ao carregar propriedade prop-x/);
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
  });

  it("lança erro claro quando a query falha", async () => {
    mockarFrom(criarQueryFalsa({ data: null, error: erro }));

    await expect(listarPropriedades()).rejects.toThrow(/Falha ao listar propriedades.*erro de teste/);
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
            eixos: { temas: ["limpar nome"], angulos: ["urgencia"], geografias: ["SP"] },
          },
        ],
        error: null,
      }),
    );

    const matrizes = await listarMatrizes("prop-1");

    expect(matrizes).toEqual([
      { id: "matriz-1", propriedadeId: "prop-1", nome: "Matriz Principal", ativo: true, temas: ["limpar nome"], angulos: ["urgencia"], geografias: ["SP"] },
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

describe("carregarPersona", () => {
  it("retorna null quando a matriz não tem persona ainda", async () => {
    mockarFrom(criarQueryFalsa({ data: { eixos: { temas: ["x"] } }, error: null }));

    expect(await carregarPersona("matriz-1")).toBeNull();
  });

  it("retorna a persona com defaults pros campos ausentes", async () => {
    mockarFrom(criarQueryFalsa({ data: { eixos: { persona: { nome: "Consumidor Endividado", tomDeVoz: "acolhedor" } } }, error: null }));

    const persona = await carregarPersona("matriz-1");

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

    await expect(carregarPersona("matriz-x")).rejects.toThrow(/Falha ao carregar persona da matriz matriz-x/);
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
