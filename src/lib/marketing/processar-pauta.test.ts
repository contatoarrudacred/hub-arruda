// src/lib/marketing/processar-pauta.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cotaDiariaAtingida, credenciaisWordPressDaPropriedade, dentroDaJanela, processarProximaPauta } from "./processar-pauta";
import * as estrategista from "./estrategista";
import * as escritor from "./escritor";
import * as revisor from "./revisor";
import * as repositorio from "./repositorio";
import { criarAdaptadorWordPress } from "./canais/wordpress";
import { cifrar } from "./criptografia";
import { enviarImagemStorage } from "./imagens/armazenamento";
import { gerarCapa } from "./imagens/capa";
import { gerarImagensSecundarias } from "./imagens/secundarias";
import { inserirLinksInternos } from "./links";

vi.mock("./canais/wordpress");
vi.mock("./links");
// Task 10 (Fase 4a+4b) — mesmo padrão de auto-mock já usado acima pra canais/wordpress e links:
// capa.ts/secundarias.ts fazem chamadas reais à Anthropic/OpenAI ("server-only", cliente próprio)
// que não devem rodar em teste unitário. schema-estruturado.ts NÃO é mockado de propósito — são
// funções puras (sem I/O), a suíte roda a implementação real e verifica o HTML/JSON-LD produzido
// de verdade, cobertura mais forte do que mockar o schema também.
vi.mock("./imagens/capa");
vi.mock("./imagens/secundarias");
// Follow-up 19/08/2026 (arquivamento no Storage) — armazenamento.ts usa createAdminClient
// ("server-only"), mesma razão de mockar capa/secundarias acima: sem isto, todo teste desta
// suíte que passa pela etapa gerar_imagens tentaria bater no Supabase de verdade.
vi.mock("./imagens/armazenamento");

const pautaFalsa = {
  id: "pauta-1",
  matrizConteudoId: "matriz-1",
  personaId: null,
  palavraChavePrincipal: "limpar nome serasa",
  palavrasSecundarias: [],
  angulo: "passo_a_passo",
  geografia: null,
  tipoConteudo: "post_padrao" as const,
  funil: "topo" as const,
  status: "em_producao" as const,
  tentativas: 0,
  motivoUltimaReprovacao: null,
  ultimoRascunho: null,
};

const propriedadeFalsa = {
  id: "prop-1",
  nome: "Site Teste",
  urlBase: "https://teste.exemplo.com",
  tipoCms: "wordpress" as const,
  maxTentativas: 3,
  autoria: null,
};

/**
 * Espiona registrarEtapa (Task 3, estendida em Task 5 pra também aceitar extrairTokens/
 * extrairDetalhes — ver repositorio.ts) sem bater no banco: repassa direto pra fn() e grava (a) a
 * ordem das etapas chamadas e (b) o que os extratores de tokens/detalhes de processar-pauta.ts
 * REALMENTE produzem a partir do resultado de fn() — sem isto, um bug de transposição
 * (tokensEntrada/tokensSaida trocados, ou um extrairDetalhes que nunca captura o motivo de uma
 * rejeição de negócio) compilaria e passaria a suíte inteira em silêncio, porque o mecanismo
 * genérico de registrarEtapa já é testado à parte em repositorio.test.ts com dados forjados à mão
 * — isto aqui testa as lambdas específicas que processar-pauta.ts passa pra ele.
 *
 * `etapa` é empilhada ANTES de aguardar fn() (mesma ordem do registrarEtapa real, que insere a
 * linha de log antes de rodar a etapa de negócio) — por isso etapasChamadas continua incluindo uma
 * etapa mesmo quando fn() lança. Os extratores só são invocados quando fn() resolve (replicando o
 * branch de sucesso do registrarEtapa real, onde eles de fato são chamados).
 */
function espiarRegistrarEtapa() {
  const etapasChamadas: string[] = [];
  const tokensExtraidos: Record<string, { tokensEntrada: number; tokensSaida: number } | undefined> = {};
  const detalhesExtraidos: Record<string, string | undefined> = {};
  const spy = vi
    .spyOn(repositorio, "registrarEtapa")
    .mockImplementation(async (_pautaId, etapa, fn, extrairTokens, extrairDetalhes) => {
      etapasChamadas.push(etapa);
      const resultado = await fn();
      if (extrairTokens) tokensExtraidos[etapa] = extrairTokens(resultado);
      if (extrairDetalhes) detalhesExtraidos[etapa] = extrairDetalhes(resultado);
      return resultado;
    });
  return { spy, etapasChamadas, tokensExtraidos, detalhesExtraidos };
}

describe("dentroDaJanela", () => {
  it("retorna true quando nenhuma janela está configurada", () => {
    expect(dentroDaJanela(undefined)).toBe(true);
  });

  it("retorna true quando o horário atual (convertido pra Brasília) está dentro da janela", () => {
    // 2026-08-18T13:00:00Z = 10:00 em America/Sao_Paulo (UTC-3, sem horário de verão desde 2019).
    const agora = new Date("2026-08-18T13:00:00Z");
    expect(dentroDaJanela({ inicio: "08:00", fim: "20:00" }, agora)).toBe(true);
  });

  it("retorna false quando o horário atual (convertido pra Brasília) está depois do fim da janela", () => {
    // 2026-08-18T23:30:00Z = 20:30 em America/Sao_Paulo.
    const agora = new Date("2026-08-18T23:30:00Z");
    expect(dentroDaJanela({ inicio: "08:00", fim: "20:00" }, agora)).toBe(false);
  });

  it("retorna false quando o horário atual (convertido pra Brasília) está antes do início da janela", () => {
    // 2026-08-18T10:59:00Z = 07:59 em America/Sao_Paulo.
    const agora = new Date("2026-08-18T10:59:00Z");
    expect(dentroDaJanela({ inicio: "08:00", fim: "20:00" }, agora)).toBe(false);
  });

  it("trata início e fim como inclusivos", () => {
    // 11:00Z = 08:00 BRT (início exato); 23:00Z = 20:00 BRT (fim exato).
    expect(dentroDaJanela({ inicio: "08:00", fim: "20:00" }, new Date("2026-08-18T11:00:00Z"))).toBe(true);
    expect(dentroDaJanela({ inicio: "08:00", fim: "20:00" }, new Date("2026-08-18T23:00:00Z"))).toBe(true);
  });
});

describe("cotaDiariaAtingida", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retorna false sem consultar o banco quando não há limite configurado", async () => {
    const contarSpy = vi.spyOn(repositorio, "contarPostsPublicadosDesde");

    expect(await cotaDiariaAtingida("prop-1", undefined)).toBe(false);
    expect(contarSpy).not.toHaveBeenCalled();
  });

  it("retorna true quando a contagem de publicados hoje já atingiu o limite", async () => {
    vi.spyOn(repositorio, "contarPostsPublicadosDesde").mockResolvedValue(3);

    expect(await cotaDiariaAtingida("prop-1", 3)).toBe(true);
  });

  it("retorna false quando a contagem ainda está abaixo do limite", async () => {
    vi.spyOn(repositorio, "contarPostsPublicadosDesde").mockResolvedValue(2);

    expect(await cotaDiariaAtingida("prop-1", 3)).toBe(false);
  });

  it("conta a partir da meia-noite do dia civil em Brasília (não do fuso do servidor)", async () => {
    const contarSpy = vi.spyOn(repositorio, "contarPostsPublicadosDesde").mockResolvedValue(0);
    // 2026-08-19T01:30:00Z = 2026-08-18T22:30 em America/Sao_Paulo — ainda dia 18 em Brasília,
    // mesmo já sendo dia 19 em UTC. Início do dia esperado: 2026-08-18T00:00:00-03:00.
    const agora = new Date("2026-08-19T01:30:00Z");

    await cotaDiariaAtingida("prop-1", 3, agora);

    expect(contarSpy).toHaveBeenCalledWith("prop-1", "2026-08-18T00:00:00-03:00");
  });
});

describe("credenciaisWordPressDaPropriedade", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // Nome de env var não aceita hífen — o código troca por underscore (propriedadeFalsa.id é
  // "prop-1"); os testes stubam o nome já convertido, igual credenciaisWordPressDaPropriedade faz.
  const SUFIXO_ENV = propriedadeFalsa.id.replace(/-/g, "_");

  it("usa a credencial cifrada do banco quando a propriedade tem uma salva (ordem: banco primeiro)", () => {
    vi.stubEnv(`WORDPRESS_USUARIO_${SUFIXO_ENV}`, "usuario-env-nao-deveria-ser-usado");
    vi.stubEnv(`WORDPRESS_SENHA_APP_${SUFIXO_ENV}`, "senha-env-nao-deveria-ser-usada");
    const propriedadeComCredencial = {
      ...propriedadeFalsa,
      credenciaisCanais: { wordpress: { usuario: "admin-banco", senhaCifrada: cifrar("senha-secreta-do-banco") } },
    };

    const credenciais = credenciaisWordPressDaPropriedade(propriedadeComCredencial);

    expect(credenciais).toEqual({ usuario: "admin-banco", senhaApp: "senha-secreta-do-banco" });
  });

  // Achado da revisão desta correção: a tela de Propriedades Digitais permite salvar só a senha
  // sem usuário (campo write-only) — sem checar `usuario` explicitamente, esse caso silenciosamente
  // publicaria com usuário vazio e a senha real, pulando os dois fallbacks.
  it("ignora a credencial do banco e cai pro fallback quando ela tem senha mas usuário vazio", () => {
    vi.stubEnv(`WORDPRESS_USUARIO_${SUFIXO_ENV}`, "usuario-env-proprio");
    vi.stubEnv(`WORDPRESS_SENHA_APP_${SUFIXO_ENV}`, "senha-env-propria");
    const propriedadeComUsuarioVazio = {
      ...propriedadeFalsa,
      credenciaisCanais: { wordpress: { usuario: "", senhaCifrada: cifrar("senha-real-mas-sem-usuario") } },
    };

    const credenciais = credenciaisWordPressDaPropriedade(propriedadeComUsuarioVazio);

    expect(credenciais).toEqual({ usuario: "usuario-env-proprio", senhaApp: "senha-env-propria" });
  });

  it("cai pra env própria da propriedade quando não há credencial no banco", () => {
    vi.stubEnv(`WORDPRESS_USUARIO_${SUFIXO_ENV}`, "usuario-env-proprio");
    vi.stubEnv(`WORDPRESS_SENHA_APP_${SUFIXO_ENV}`, "senha-env-propria");

    const credenciais = credenciaisWordPressDaPropriedade(propriedadeFalsa);

    expect(credenciais).toEqual({ usuario: "usuario-env-proprio", senhaApp: "senha-env-propria" });
  });

  it("cai pro par genérico WORDPRESS_USUARIO/WORDPRESS_SENHA_APP quando não há credencial no banco nem env própria (comportamento original da Fase 1)", () => {
    vi.stubEnv("WORDPRESS_USUARIO", "usuario-generico");
    vi.stubEnv("WORDPRESS_SENHA_APP", "senha-generica");
    const avisoSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const credenciais = credenciaisWordPressDaPropriedade(propriedadeFalsa);

    expect(credenciais).toEqual({ usuario: "usuario-generico", senhaApp: "senha-generica" });
    expect(avisoSpy).toHaveBeenCalledOnce();
  });
});

describe("processarProximaPauta", () => {
  // salvarRascunho (Fase 3, 19/08/2026) e carregarPostsRecentes (Fase 4a, Task 3, 19/08/2026)
  // rodam em toda tentativa que chega em gerar_conteudo/revisar — mock padrão aqui em vez de em
  // cada teste individualmente (mesmo raciocínio do resto do arquivo: sem mock explícito, a
  // chamada cairia na implementação real de repositorio.ts e bateria de verdade no Supabase).
  // Testes que querem verificar a chamada sobrescrevem com seu próprio spy.
  beforeEach(() => {
    vi.spyOn(repositorio, "salvarRascunho").mockResolvedValue(undefined);
    vi.spyOn(repositorio, "carregarPostsRecentes").mockResolvedValue([]);
    // Reaproveitamento entre tentativas (19/08/2026) — default "nenhum post pronto ainda" / "sem
    // imagens de tentativa anterior", mesmo comportamento de antes desta mudança existir (sempre
    // gera do zero). Testes dedicados de reaproveitamento sobrescrevem.
    vi.spyOn(repositorio, "carregarPostProntoParaPublicar").mockResolvedValue(null);
    vi.spyOn(repositorio, "carregarImagensPostAnterior").mockResolvedValue(null);
    // Task 10 — default "sem imagem nenhuma" (mesmo comportamento de antes desta task existir):
    // capa reprovada/sem resultado, zero secundárias aprovadas. Testes dedicados de imagem
    // (describe "gerar_imagens (Task 10)" abaixo) sobrescrevem com seus próprios resultados.
    vi.mocked(gerarCapa).mockResolvedValue({ resultado: null, usage: { inputTokens: 0, outputTokens: 0 } });
    vi.mocked(gerarImagensSecundarias).mockResolvedValue({ resultado: [], usage: { inputTokens: 0, outputTokens: 0 } });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("retorna fora_da_janela sem selecionar pauta quando o horário atual está fora da janela de publicação", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T23:30:00Z")); // 20:30 BRT, fora de 08:00-20:00
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue({
      ...propriedadeFalsa,
      janelaPublicacao: { inicio: "08:00", fim: "20:00" },
    });
    const selecionarSpy = vi.spyOn(estrategista, "selecionarPauta");

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "fora_da_janela" });
    expect(selecionarSpy).not.toHaveBeenCalled();
  });

  it("retorna fora_da_janela sem selecionar pauta quando a cota diária de posts já foi atingida", async () => {
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue({
      ...propriedadeFalsa,
      postsPorDia: 2,
    });
    vi.spyOn(repositorio, "contarPostsPublicadosDesde").mockResolvedValue(2);
    const selecionarSpy = vi.spyOn(estrategista, "selecionarPauta");

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "fora_da_janela" });
    expect(selecionarSpy).not.toHaveBeenCalled();
  });

  it("regressão: sem posts_por_dia nem janela_publicacao configurados, processa normalmente (comportamento da Fase 1)", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue({
      ...pautaFalsa,
      tentativas: 3,
      motivoUltimaReprovacao: "Muito curto.",
    });
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa); // sem os dois campos
    const bloquearSpy = vi.spyOn(repositorio, "marcarPautaBloqueada").mockResolvedValue(undefined);
    const contarSpy = vi.spyOn(repositorio, "contarPostsPublicadosDesde");

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "bloqueada", pautaId: "pauta-1" });
    expect(bloquearSpy).toHaveBeenCalledWith("pauta-1", "Muito curto.");
    expect(contarSpy).not.toHaveBeenCalled(); // sem posts_por_dia, nem consulta o banco pra cota
  });

  it("publica quando a revisão aprova de primeira", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Como Limpar o Nome no Serasa",
        conteudoHtml: "<h1>...</h1>",
        metaTitle: "Como Limpar Nome no Serasa",
        metaDescription: "Guia completo.",
        slug: "como-limpar-nome-serasa",
      },
      usage: { inputTokens: 1000, outputTokens: 2000 },
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: {
        aprovado: true,
        score: 92,
        motivo: null,
        precisaoFactualAdequada: true,
        fontesEspecificas: true,
        originalidadeAdequada: true,
      },
      usage: { inputTokens: 500, outputTokens: 50 },
    });
    vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-1", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
    vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
    vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);
    vi.mocked(inserirLinksInternos).mockResolvedValue("<h1>...</h1>");
    const { etapasChamadas, tokensExtraidos, detalhesExtraidos } = espiarRegistrarEtapa();

    const adaptadorFalso = {
      criarRascunho: vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" }),
      // Task 10: enviarMidia é chamado quando gerarCapa/gerarImagensSecundarias produzem
      // resultado (default do beforeEach acima é "sem imagem nenhuma", então não é chamado nos
      // testes que não sobrescrevem esses mocks) — vi.fn() sem implementação basta aqui.
      enviarMidia: vi.fn(),
      verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
      aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    };
    vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
    expect(adaptadorFalso.aprovarPublicar).toHaveBeenCalledWith("123");
    expect(inserirLinksInternos).toHaveBeenCalledWith("<h1>...</h1>", "prop-1", "post-1");
    expect(etapasChamadas).toEqual([
      "buscar_checklist",
      "gerar_conteudo",
      "revisar",
      "inserir_links",
      "sanitizar",
      "gerar_imagens",
      "publicar",
      "registrar_resultado",
    ]);
    // Prova que a lambda de extração de tokens de gerar_conteudo/revisar (processar-pauta.ts)
    // mapeia usage.inputTokens/outputTokens pra tokensEntrada/tokensSaida SEM trocar os dois —
    // um bug de transposição compilaria e passaria o resto da suíte em silêncio sem este assert.
    expect(tokensExtraidos.gerar_conteudo).toEqual({ tokensEntrada: 1000, tokensSaida: 2000 });
    expect(tokensExtraidos.revisar).toEqual({ tokensEntrada: 500, tokensSaida: 50 });
    // Revisão aprovada e publicação bem-sucedida: nenhum motivo de rejeição de negócio pra gravar.
    expect(detalhesExtraidos.revisar).toBeUndefined();
    expect(detalhesExtraidos.publicar).toBeUndefined();
    // Fase 3, 19/08/2026: o rascunho é salvo mesmo quando aprova de primeira (salvarRascunho não
    // é condicional ao resultado da revisão) — próxima seção verifica o caso em que isso importa
    // de verdade (reprovação).
    expect(repositorio.salvarRascunho).toHaveBeenCalledWith("pauta-1", {
      titulo: "Como Limpar o Nome no Serasa",
      conteudoHtml: "<h1>...</h1>",
      metaTitle: "Como Limpar Nome no Serasa",
      metaDescription: "Guia completo.",
      slug: "como-limpar-nome-serasa",
    });
  });

  // Fase 4a, Task 3 (19/08/2026): resolve o TODO(Task 3) que a Task 2 deixou — postsRecentes
  // precisa vir de carregarPostsRecentes(propriedade.id, 10) de verdade, e o resultado precisa
  // chegar intocado em revisarConteudo (4º argumento) — sem isto o gate de originalidade do
  // Revisor julgaria sempre sem contexto de comparação, mesmo com posts publicados existindo.
  it("carrega os posts recentes da propriedade e repassa pro Revisor (originalidade_adequada)", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Como Limpar o Nome no Serasa",
        conteudoHtml: "<h1>...</h1>",
        metaTitle: "Como Limpar Nome no Serasa",
        metaDescription: "Guia completo.",
        slug: "como-limpar-nome-serasa",
      },
      usage: { inputTokens: 1000, outputTokens: 2000 },
    });
    const postsRecentesFalsos = [{ titulo: "Post Anterior", angulo: "passo_a_passo" }];
    const carregarPostsRecentesSpy = vi.spyOn(repositorio, "carregarPostsRecentes").mockResolvedValue(postsRecentesFalsos);
    const revisarConteudoSpy = vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: {
        aprovado: true,
        score: 92,
        motivo: null,
        precisaoFactualAdequada: true,
        fontesEspecificas: true,
        originalidadeAdequada: true,
      },
      usage: { inputTokens: 500, outputTokens: 50 },
    });
    vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-1", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
    vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
    vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);
    vi.mocked(inserirLinksInternos).mockResolvedValue("<h1>...</h1>");
    espiarRegistrarEtapa();
    const adaptadorFalso = {
      criarRascunho: vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" }),
      // Task 10: enviarMidia é chamado quando gerarCapa/gerarImagensSecundarias produzem
      // resultado (default do beforeEach acima é "sem imagem nenhuma", então não é chamado nos
      // testes que não sobrescrevem esses mocks) — vi.fn() sem implementação basta aqui.
      enviarMidia: vi.fn(),
      verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
      aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    };
    vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);

    await processarProximaPauta("matriz-1", "prop-1");

    expect(carregarPostsRecentesSpy).toHaveBeenCalledWith("prop-1", 10);
    expect(revisarConteudoSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), postsRecentesFalsos);
  });

  it("mantém o resultado publicado sem reprovar quando só o registro de metadados do post falha", async () => {
    // Regressão do bug de janela de publicação duplicada: se aprovarPublicar já teve sucesso
    // (post no ar) mas atualizarStatusPost falhar depois, NÃO pode cair em registrarReprovacaoPauta
    // — isso devolveria a pauta pra fila e geraria um segundo artigo publicado no próximo ciclo.
    // marcarPautaPublicada roda ANTES e com sucesso aqui (é o que tira a pauta do pool de reclaim),
    // então uma falha isolada em atualizarStatusPost (metadados secundários) não deve bloquear nada.
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Como Limpar o Nome no Serasa",
        conteudoHtml: "<h1>...</h1>",
        metaTitle: "Como Limpar Nome no Serasa",
        metaDescription: "Guia completo.",
        slug: "como-limpar-nome-serasa",
      },
      usage: { inputTokens: 1000, outputTokens: 2000 },
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: {
        aprovado: true,
        score: 92,
        motivo: null,
        precisaoFactualAdequada: true,
        fontesEspecificas: true,
        originalidadeAdequada: true,
      },
      usage: { inputTokens: 500, outputTokens: 50 },
    });
    vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-1", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
    const atualizarStatusPostSpy = vi.spyOn(repositorio, "atualizarStatusPost").mockRejectedValue(new Error("Falha ao gravar no banco"));
    const marcarPublicadaSpy = vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);
    const bloquearSpy = vi.spyOn(repositorio, "marcarPautaBloqueada").mockResolvedValue(undefined);
    const reprovarSpy = vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(inserirLinksInternos).mockResolvedValue("<h1>...</h1>");
    const { etapasChamadas } = espiarRegistrarEtapa();

    const adaptadorFalso = {
      criarRascunho: vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" }),
      // Task 10: enviarMidia é chamado quando gerarCapa/gerarImagensSecundarias produzem
      // resultado (default do beforeEach acima é "sem imagem nenhuma", então não é chamado nos
      // testes que não sobrescrevem esses mocks) — vi.fn() sem implementação basta aqui.
      enviarMidia: vi.fn(),
      verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
      aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    };
    vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
    expect(reprovarSpy).not.toHaveBeenCalled();
    expect(marcarPublicadaSpy).toHaveBeenCalledWith("pauta-1");
    expect(bloquearSpy).not.toHaveBeenCalled();
    expect(atualizarStatusPostSpy).toHaveBeenCalledWith(
      "post-1",
      "publicado",
      expect.objectContaining({ conteudoHtml: expect.any(String) }),
    );
    expect(erroSpy).toHaveBeenCalled();
    expect(etapasChamadas).toEqual([
      "buscar_checklist",
      "gerar_conteudo",
      "revisar",
      "inserir_links",
      "sanitizar",
      "gerar_imagens",
      "publicar",
      "registrar_resultado",
    ]);

    erroSpy.mockRestore();
  });

  it("bloqueia a pauta pra revisão manual quando marcarPautaPublicada falha (não deixa recuperável via reclaim)", async () => {
    // Se marcarPautaPublicada falhar, a pauta ficaria em em_producao e o reclaim (item 3) a
    // re-selecionaria e republicaria dali a 10 minutos — a mesma duplicidade que este bloco existe
    // pra evitar. Por isso o fallback força "bloqueada" em vez de deixar recuperável via reclaim.
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Como Limpar o Nome no Serasa",
        conteudoHtml: "<h1>...</h1>",
        metaTitle: "Como Limpar Nome no Serasa",
        metaDescription: "Guia completo.",
        slug: "como-limpar-nome-serasa",
      },
      usage: { inputTokens: 1000, outputTokens: 2000 },
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: {
        aprovado: true,
        score: 92,
        motivo: null,
        precisaoFactualAdequada: true,
        fontesEspecificas: true,
        originalidadeAdequada: true,
      },
      usage: { inputTokens: 500, outputTokens: 50 },
    });
    vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-1", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
    const atualizarStatusPostSpy = vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
    const marcarPublicadaSpy = vi.spyOn(repositorio, "marcarPautaPublicada").mockRejectedValue(new Error("Falha ao gravar no banco"));
    const bloquearSpy = vi.spyOn(repositorio, "marcarPautaBloqueada").mockResolvedValue(undefined);
    const reprovarSpy = vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(inserirLinksInternos).mockResolvedValue("<h1>...</h1>");
    const { etapasChamadas } = espiarRegistrarEtapa();

    const adaptadorFalso = {
      criarRascunho: vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" }),
      // Task 10: enviarMidia é chamado quando gerarCapa/gerarImagensSecundarias produzem
      // resultado (default do beforeEach acima é "sem imagem nenhuma", então não é chamado nos
      // testes que não sobrescrevem esses mocks) — vi.fn() sem implementação basta aqui.
      enviarMidia: vi.fn(),
      verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
      aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
    };
    vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
    expect(reprovarSpy).not.toHaveBeenCalled();
    expect(marcarPublicadaSpy).toHaveBeenCalledWith("pauta-1");
    expect(bloquearSpy).toHaveBeenCalledWith(
      "pauta-1",
      expect.stringContaining("https://teste.exemplo.com/como-limpar-nome-serasa/"),
    );
    // atualizarStatusPost roda 1x (persistência das imagens, logo após "gerar_imagens", ANTES de
    // publicar — mudança de 19/08/2026) mas NÃO uma 2ª vez com os campos de publicação: a pauta já
    // foi resolvida (bloqueada) antes de chegar nesse ponto do bloco "registrar_resultado".
    expect(atualizarStatusPostSpy).toHaveBeenCalledTimes(1);
    expect(atualizarStatusPostSpy).toHaveBeenCalledWith("post-1", "rascunho", expect.objectContaining({ imagensSecundarias: [] }));
    expect(erroSpy).toHaveBeenCalled();
    expect(etapasChamadas).toEqual([
      "buscar_checklist",
      "gerar_conteudo",
      "revisar",
      "inserir_links",
      "sanitizar",
      "gerar_imagens",
      "publicar",
      "registrar_resultado",
    ]);

    erroSpy.mockRestore();
  });

  it("reprova sem publicar quando o WordPress rejeita o rascunho na verificação", async () => {
    // Cenário de "publicar falhou" que já existia na lógica de negócio (verificacao.ok === false),
    // mas ganhou uma forma nova de fluir pela etapa "publicar" (Task 5): não lança exceção — a
    // etapa "publicar" é registrada como concluída (sucesso: true, é a decisão de negócio de
    // reprovar, não uma exceção técnica). Essa mesma escolha de design foi aplicada à etapa
    // "revisar" nesta mesma task (nenhuma das duas era instrumentada antes) — extrairDetalhes grava
    // o motivo da rejeição na coluna detalhes mesmo sem exceção, pra não ficar indistinguível de
    // uma publicação real no log (ver assert de detalhesExtraidos.publicar abaixo).
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Como Limpar o Nome no Serasa",
        conteudoHtml: "<h1>...</h1>",
        metaTitle: "Como Limpar Nome no Serasa",
        metaDescription: "Guia completo.",
        slug: "como-limpar-nome-serasa",
      },
      usage: { inputTokens: 1000, outputTokens: 2000 },
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: {
        aprovado: true,
        score: 92,
        motivo: null,
        precisaoFactualAdequada: true,
        fontesEspecificas: true,
        originalidadeAdequada: true,
      },
      usage: { inputTokens: 500, outputTokens: 50 },
    });
    vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-1", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
    const atualizarStatusPostSpy = vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
    const marcarPublicadaSpy = vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);
    const reprovarSpy = vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);
    vi.mocked(inserirLinksInternos).mockResolvedValue("<h1>...</h1>");
    const { etapasChamadas, detalhesExtraidos } = espiarRegistrarEtapa();

    const adaptadorFalso = {
      criarRascunho: vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" }),
      // Task 10: enviarMidia é chamado quando gerarCapa/gerarImagensSecundarias produzem
      // resultado (default do beforeEach acima é "sem imagem nenhuma", então não é chamado nos
      // testes que não sobrescrevem esses mocks) — vi.fn() sem implementação basta aqui.
      enviarMidia: vi.fn(),
      verificarRascunho: vi.fn().mockResolvedValue({ ok: false, detalhes: "Rascunho sem conteúdo renderizado." }),
      aprovarPublicar: vi.fn(),
    };
    vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "reprovado", pautaId: "pauta-1" });
    expect(adaptadorFalso.aprovarPublicar).not.toHaveBeenCalled();
    expect(atualizarStatusPostSpy).toHaveBeenCalledWith("post-1", "falhou");
    expect(reprovarSpy).toHaveBeenCalledWith("pauta-1", "Rascunho sem conteúdo renderizado.");
    expect(marcarPublicadaSpy).not.toHaveBeenCalled();
    expect(etapasChamadas).toEqual([
      "buscar_checklist",
      "gerar_conteudo",
      "revisar",
      "inserir_links",
      "sanitizar",
      "gerar_imagens",
      "publicar",
    ]);
    // Important #1 da revisão: a linha de log da etapa "publicar" precisa carregar o motivo da
    // rejeição em `detalhes`, mesmo sucesso: true (rejeição de negócio, não exceção técnica) —
    // senão fica indistinguível de uma publicação real pra quem lê pautas_execucao_log.
    expect(detalhesExtraidos.publicar).toBe("Rascunho sem conteúdo renderizado.");
  });

  it("reprova sem publicar quando o score da revisão é baixo", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Rascunho fraco",
        conteudoHtml: "<p>curto</p>",
        metaTitle: "x",
        metaDescription: "y",
        slug: "rascunho-fraco",
      },
      usage: { inputTokens: 300, outputTokens: 100 },
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: {
        aprovado: false,
        score: 40,
        motivo: "Muito curto.",
        precisaoFactualAdequada: true,
        fontesEspecificas: true,
        originalidadeAdequada: true,
      },
      usage: { inputTokens: 200, outputTokens: 20 },
    });
    const reprovarSpy = vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);
    const { etapasChamadas, tokensExtraidos, detalhesExtraidos } = espiarRegistrarEtapa();

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "reprovado", pautaId: "pauta-1" });
    expect(reprovarSpy).toHaveBeenCalledWith("pauta-1", "Muito curto.");
    expect(etapasChamadas).toEqual(["buscar_checklist", "gerar_conteudo", "revisar"]);
    // Important #1 da revisão: o motivo da reprovação por score baixo precisa ir pra pautas_execucao_log
    // (coluna detalhes da etapa "revisar"), mesmo a linha sendo sucesso: true (não é exceção técnica).
    expect(detalhesExtraidos.revisar).toBe("Muito curto.");
    // Important #2 da revisão: confirma que a lambda de tokens de gerar_conteudo/revisar não troca
    // inputTokens/outputTokens também neste cenário (score baixo), não só no de sucesso.
    expect(tokensExtraidos.gerar_conteudo).toEqual({ tokensEntrada: 300, tokensSaida: 100 });
    expect(tokensExtraidos.revisar).toEqual({ tokensEntrada: 200, tokensSaida: 20 });
  });

  // Fase 3 (personas ricas), Task 5, spec seção 7 — o call-site novo em processar-pauta.ts: quando
  // a pauta selecionada tem personaId (nasceu do terceiro caminho do Estrategista, Task 4),
  // carregarPersona é chamado e o resultado passado pro Escritor.
  it("carrega a persona e passa pro Escritor quando a pauta tem personaId", async () => {
    const pautaComPersona = { ...pautaFalsa, personaId: "persona-1" };
    const personaFalsa = {
      id: "persona-1",
      nome: "Marcelo Andrade",
      dorEntrada: "Nome negativado no Serasa há meses.",
      angulosProntos: [],
      usadaPelaUltimaVezEm: null,
      conteudoCompleto: "## Bloco 1 — Ficha rápida\n...",
    };
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaComPersona);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    const carregarPersonaSpy = vi.spyOn(repositorio, "carregarPersona").mockResolvedValue(personaFalsa);
    const gerarConteudoSpy = vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Rascunho",
        conteudoHtml: "<p>...</p>",
        metaTitle: "x",
        metaDescription: "y",
        slug: "rascunho",
      },
      usage: { inputTokens: 300, outputTokens: 100 },
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: {
        aprovado: false,
        score: 40,
        motivo: "Muito curto.",
        precisaoFactualAdequada: true,
        fontesEspecificas: true,
        originalidadeAdequada: true,
      },
      usage: { inputTokens: 200, outputTokens: 20 },
    });
    vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "reprovado", pautaId: "pauta-1" });
    expect(carregarPersonaSpy).toHaveBeenCalledWith("persona-1");
    expect(gerarConteudoSpy).toHaveBeenCalledWith(pautaComPersona, [], personaFalsa, propriedadeFalsa);
  });

  // Regressão: pauta antiga/manual (personaId null) não deve pagar o custo de carregarPersona nem
  // quebrar o Escritor — persona chega como null, exatamente como fluía antes desta task.
  it("não carrega persona quando pauta.personaId é null (regressão)", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    const carregarPersonaSpy = vi.spyOn(repositorio, "carregarPersona");
    const gerarConteudoSpy = vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
      resultado: {
        titulo: "Rascunho",
        conteudoHtml: "<p>...</p>",
        metaTitle: "x",
        metaDescription: "y",
        slug: "rascunho",
      },
      usage: { inputTokens: 300, outputTokens: 100 },
    });
    vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
      resultado: {
        aprovado: false,
        score: 40,
        motivo: "Muito curto.",
        precisaoFactualAdequada: true,
        fontesEspecificas: true,
        originalidadeAdequada: true,
      },
      usage: { inputTokens: 200, outputTokens: 20 },
    });
    vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "reprovado", pautaId: "pauta-1" });
    expect(carregarPersonaSpy).not.toHaveBeenCalled();
    expect(gerarConteudoSpy).toHaveBeenCalledWith(pautaFalsa, [], null, propriedadeFalsa);
  });

  it("bloqueia sem gerar quando o limite de tentativas já foi esgotado", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue({
      ...pautaFalsa,
      tentativas: 3,
      motivoUltimaReprovacao: "Muito curto.",
    });
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    const bloquearSpy = vi.spyOn(repositorio, "marcarPautaBloqueada").mockResolvedValue(undefined);
    const gerarSpy = vi.spyOn(escritor, "gerarConteudo");

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "bloqueada", pautaId: "pauta-1" });
    expect(bloquearSpy).toHaveBeenCalledWith("pauta-1", "Muito curto.");
    expect(gerarSpy).not.toHaveBeenCalled();
  });

  it("reprova e não deixa a pauta presa quando uma etapa lança exceção inesperada", async () => {
    vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
    vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
    vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
    vi.spyOn(escritor, "gerarConteudo").mockRejectedValue(new Error("Falha de rede"));
    const reprovarSpy = vi.spyOn(repositorio, "registrarReprovacaoPauta").mockResolvedValue(undefined);
    const { etapasChamadas } = espiarRegistrarEtapa();

    const resultado = await processarProximaPauta("matriz-1", "prop-1");

    expect(resultado).toEqual({ status: "reprovado", pautaId: "pauta-1" });
    expect(reprovarSpy).toHaveBeenCalledWith("pauta-1", "Falha de rede");
    // A etapa gerar_conteudo é registrada (linha de log com iniciado_em) mesmo lançando exceção —
    // registrarEtapa (real) marcaria sucesso: false; aqui só confirmamos que ela foi de fato
    // invocada antes de propagar o erro pro catch externo.
    expect(etapasChamadas).toEqual(["buscar_checklist", "gerar_conteudo"]);
  });

  // Reaproveitamento entre tentativas (19/08/2026, pedido do Luiz) — achado real de teste em
  // produção: uma falha técnica na publicação (credencial de WordPress inválida) descartava um
  // texto já aprovado e imagens já geradas, forçando a próxima tentativa a recomeçar do zero e
  // gastando tokens/dinheiro de novo à toa. Quando já existe um post "pronto_para_publicar" pra
  // esta pauta, o pipeline deve pular INTEIRAMENTE gerar_conteudo/revisar/inserir_links/
  // sanitizar/gerar_imagens — nenhuma chamada de IA nova, direto pra "publicar".
  describe("reaproveitamento de post pronto entre tentativas", () => {
    it("quando já existe um post pronto pra publicar, pula toda a geração (nenhuma chamada de IA) e publica direto com o material reaproveitado", async () => {
      vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
      vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
      vi.spyOn(repositorio, "carregarPostProntoParaPublicar").mockResolvedValue({
        id: "post-1",
        titulo: "Como Limpar o Nome no Serasa",
        conteudoHtml: "<h1>Como Limpar o Nome no Serasa</h1><p>Conteúdo já pronto de uma tentativa anterior.</p>",
        metaTitle: "Como Limpar Nome no Serasa",
        metaDescription: "Guia completo.",
        slug: "como-limpar-nome-serasa",
        imagemDestaqueMediaId: "media-capa-reaproveitada",
      });
      const gerarConteudoSpy = vi.spyOn(escritor, "gerarConteudo");
      const revisarConteudoSpy = vi.spyOn(revisor, "revisarConteudo");
      const criarPostSpy = vi.spyOn(repositorio, "criarPost");
      const atualizarStatusPostSpy = vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
      vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);
      const criarRascunho = vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" });
      const adaptadorFalso = {
        criarRascunho,
        enviarMidia: vi.fn(),
        verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
        aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
      };
      vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);
      const { etapasChamadas } = espiarRegistrarEtapa();

      const resultado = await processarProximaPauta("matriz-1", "prop-1");

      expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
      // A prova real de que não gastou tokens à toa: nenhuma dessas funções foi chamada.
      expect(gerarConteudoSpy).not.toHaveBeenCalled();
      expect(revisarConteudoSpy).not.toHaveBeenCalled();
      expect(gerarCapa).not.toHaveBeenCalled();
      expect(gerarImagensSecundarias).not.toHaveBeenCalled();
      expect(inserirLinksInternos).not.toHaveBeenCalled();
      expect(criarPostSpy).not.toHaveBeenCalled();
      expect(etapasChamadas).toEqual(["publicar", "registrar_resultado"]);
      // Dados do post reaproveitado chegam intactos em criarRascunho, incluindo o media id da capa
      // (reaproveitado sem repetir o upload).
      expect(criarRascunho).toHaveBeenCalledWith(
        {
          titulo: "Como Limpar o Nome no Serasa",
          corpoHtml: "<h1>Como Limpar o Nome no Serasa</h1><p>Conteúdo já pronto de uma tentativa anterior.</p>",
          slug: "como-limpar-nome-serasa",
          metaTitle: "Como Limpar Nome no Serasa",
          metaDescription: "Guia completo.",
        },
        "media-capa-reaproveitada",
      );
      // atualizarStatusPost só roda 1x aqui (bloco final de sucesso) — sem a chamada extra de
      // persistência de imagens, que só existe no caminho de geração do zero.
      expect(atualizarStatusPostSpy).toHaveBeenCalledTimes(1);
      expect(atualizarStatusPostSpy).toHaveBeenCalledWith(
        "post-1",
        "publicado",
        expect.objectContaining({ conteudoHtml: "<h1>Como Limpar o Nome no Serasa</h1><p>Conteúdo já pronto de uma tentativa anterior.</p>" }),
      );
    });

    // Cenário mais sutil que o anterior: o TEXTO precisa mudar (reprovação de conteúdo, motivo
    // pontual — não existe post "pronto_para_publicar" ainda), mas uma tentativa anterior desta
    // pauta já gerou imagens. O Escritor/Revisor rodam de novo (o texto muda), mas gerarCapa/
    // gerarImagensSecundarias/enviarMidia NÃO devem ser chamados — as imagens são reaproveitadas.
    it("quando o texto precisa de correção cirúrgica mas já existem imagens de uma tentativa anterior, reaproveita as imagens sem gerar de novo", async () => {
      vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
      vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
      vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
      vi.spyOn(repositorio, "carregarPostProntoParaPublicar").mockResolvedValue(null); // texto ainda não aprovado
      vi.spyOn(repositorio, "carregarImagensPostAnterior").mockResolvedValue({
        imagemDestaqueUrl: "https://teste.exemplo.com/wp-content/uploads/capa-serasa.png",
        imagemDestaqueAlt: "Pessoa aliviada olhando boletos organizados",
        imagemDestaqueSlug: "capa-serasa",
        imagemDestaqueStorageUrl: "https://storage.exemplo.com/prop-1/pauta-1/capa-capa-serasa.png",
        imagemDestaqueMediaId: "media-capa-existente",
        imagensSecundarias: [],
      });
      vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
        resultado: {
          titulo: "Como Limpar o Nome no Serasa (corrigido)",
          conteudoHtml: "<h1>Como Limpar o Nome no Serasa</h1><p>Texto corrigido cirurgicamente.</p>",
          metaTitle: "Como Limpar Nome no Serasa",
          metaDescription: "Guia completo.",
          slug: "como-limpar-nome-serasa",
        },
        usage: { inputTokens: 500, outputTokens: 300 },
      });
      vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
        resultado: { aprovado: true, score: 92, motivo: null, precisaoFactualAdequada: true, fontesEspecificas: true, originalidadeAdequada: true },
        usage: { inputTokens: 500, outputTokens: 50 },
      });
      vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-2", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
      const atualizarStatusPostSpy = vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
      vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);
      vi.mocked(inserirLinksInternos).mockResolvedValue("<h1>Como Limpar o Nome no Serasa</h1><p>Texto corrigido cirurgicamente.</p>");
      const criarRascunho = vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" });
      const enviarMidia = vi.fn();
      const adaptadorFalso = {
        criarRascunho,
        enviarMidia,
        verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
        aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
      };
      vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);
      const { etapasChamadas } = espiarRegistrarEtapa();

      const resultado = await processarProximaPauta("matriz-1", "prop-1");

      expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
      // O texto RODA de novo (a correção é dele) — todas as etapas normais aparecem.
      expect(etapasChamadas).toEqual(["buscar_checklist", "gerar_conteudo", "revisar", "inserir_links", "sanitizar", "gerar_imagens", "publicar", "registrar_resultado"]);
      // Mas nenhuma chamada de geração/upload de imagem acontece — reaproveitadas da tentativa anterior.
      expect(gerarCapa).not.toHaveBeenCalled();
      expect(gerarImagensSecundarias).not.toHaveBeenCalled();
      expect(enviarMidia).not.toHaveBeenCalled();
      // featured_media reaproveitado sem novo upload.
      expect(criarRascunho).toHaveBeenCalledWith(expect.anything(), "media-capa-existente");
      const corpoHtmlPublicado = criarRascunho.mock.calls[0][0].corpoHtml as string;
      expect(corpoHtmlPublicado).toContain('"image":"https://teste.exemplo.com/wp-content/uploads/capa-serasa.png"');
      expect(atualizarStatusPostSpy).toHaveBeenCalledWith(
        "post-2",
        "rascunho",
        expect.objectContaining({ imagemDestaqueUrl: "https://teste.exemplo.com/wp-content/uploads/capa-serasa.png", imagemDestaqueMediaId: "media-capa-existente" }),
      );
    });
  });

  // Task 10 (Fase 4a+4b, 19/08/2026) — conecta gerarCapa (Task 7), gerarImagensSecundarias (Task
  // 8), enviarMidia (Task 9) e montarSchemaArticle/montarSchemaOrganization (Task 5) na sequência
  // real do pipeline. Sequência exercitada aqui: capa/secundárias geradas (data URLs) → upload de
  // cada uma que teve sucesso (URL pública) → schema montado com a URL pública da capa → HTML
  // final com secundárias embutidas + schema, publicado com featured_media = id da capa enviada.
  describe("gerar_imagens (Task 10) — sequenciamento de capa, secundárias, upload e schema", () => {
    const CONTEUDO_COM_H2 = {
      titulo: "Como Limpar o Nome no Serasa",
      conteudoHtml:
        "<h1>Como Limpar o Nome no Serasa</h1><h2>Documentos necessários</h2><p>Leve RG e CPF.</p><h2>Passo a passo</h2><p>Ligue para a central.</p>",
      metaTitle: "Como Limpar Nome no Serasa",
      metaDescription: "Guia completo.",
      slug: "como-limpar-nome-serasa",
    };

    // Sem tipo explícito no parâmetro (mesmo padrão dos `adaptadorFalso` inline já usados no resto
    // deste arquivo, ver "publica quando a revisão aprova de primeira" acima) — uma anotação
    // nomeada baseada em `ReturnType<typeof vi.fn>` perde a tipagem contextual que faz os mocks
    // (sem generics próprios) baterem estruturalmente com a assinatura real de
    // criarAdaptadorWordPress (achado desta task: a versão anotada não compilava).
    // Base comum aos 4 cenários desta seção — mesmos mocks de "publica quando a revisão aprova de
    // primeira" acima, parametrizado só pelo adaptador (cada teste tem seu próprio enviarMidia).
    function configurarCenarioBase(adaptadorFalso: ReturnType<typeof criarAdaptadorWordPress>) {
      vi.spyOn(estrategista, "selecionarPauta").mockResolvedValue(pautaFalsa);
      vi.spyOn(repositorio, "carregarPropriedade").mockResolvedValue(propriedadeFalsa);
      vi.spyOn(repositorio, "carregarChecklistAtivo").mockResolvedValue([]);
      vi.spyOn(escritor, "gerarConteudo").mockResolvedValue({
        resultado: CONTEUDO_COM_H2,
        usage: { inputTokens: 1000, outputTokens: 2000 },
      });
      vi.spyOn(revisor, "revisarConteudo").mockResolvedValue({
        resultado: {
          aprovado: true,
          score: 92,
          motivo: null,
          precisaoFactualAdequada: true,
          fontesEspecificas: true,
          originalidadeAdequada: true,
        },
        usage: { inputTokens: 500, outputTokens: 50 },
      });
      vi.spyOn(repositorio, "criarPost").mockResolvedValue({ id: "post-1", pautaId: "pauta-1", propriedadeId: "prop-1", status: "rascunho" });
      vi.spyOn(repositorio, "atualizarStatusPost").mockResolvedValue(undefined);
      vi.spyOn(repositorio, "marcarPautaPublicada").mockResolvedValue(undefined);
      vi.mocked(inserirLinksInternos).mockResolvedValue(CONTEUDO_COM_H2.conteudoHtml);
      vi.mocked(criarAdaptadorWordPress).mockReturnValue(adaptadorFalso);
      // Storage: sucesso por padrão (URL determinística a partir do caminho recebido) — os testes
      // desta seção que não são sobre Storage especificamente não precisam se preocupar com isso;
      // os testes dedicados de Storage abaixo sobrescrevem este mock quando precisam de uma falha.
      vi.mocked(enviarImagemStorage).mockImplementation(async (_dataUrl, caminho) => ({ url: `https://storage.exemplo.com/${caminho}` }));
    }

    it("capa e imagem secundária aprovadas: schema com image, HTML com figure, imagemDestacadaId chega em criarRascunho, posts row com todos os campos de imagem", async () => {
      const enviarMidia = vi.fn().mockImplementation(async (_imagemUrl: string, nomeArquivo: string) => {
        if (nomeArquivo.startsWith("capa-serasa")) {
          return { idRemoto: "media-capa", url: "https://teste.exemplo.com/wp-content/uploads/capa-serasa.png" };
        }
        return { idRemoto: "media-sec-1", url: "https://teste.exemplo.com/wp-content/uploads/doc-necessarios.png" };
      });
      const criarRascunho = vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" });
      const adaptadorFalso = {
        criarRascunho,
        enviarMidia,
        verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
        aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
      };
      configurarCenarioBase(adaptadorFalso);
      vi.mocked(gerarCapa).mockResolvedValue({
        resultado: {
          url: "data:image/png;base64,AAAA",
          alt: "Pessoa aliviada olhando boletos organizados",
          slug: "capa-serasa",
          titulo: "Capa Serasa",
        },
        usage: { inputTokens: 800, outputTokens: 400 },
      });
      vi.mocked(gerarImagensSecundarias).mockResolvedValue({
        resultado: [
          {
            url: "data:image/png;base64,BBBB",
            alt: "Lista dos documentos necessários",
            slug: "doc-necessarios",
            titulo: "Documentos necessários",
            legenda: "RG e CPF em mãos antes de ligar.",
            posicaoAposSecao: "depois da seção sobre documentos necessários",
            storageUrl: null,
          },
        ],
        usage: { inputTokens: 600, outputTokens: 300 },
      });
      const { etapasChamadas, tokensExtraidos } = espiarRegistrarEtapa();

      const resultado = await processarProximaPauta("matriz-1", "prop-1");

      expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
      expect(etapasChamadas).toContain("gerar_imagens");
      expect(enviarMidia).toHaveBeenCalledWith("data:image/png;base64,AAAA", "capa-serasa.png", "Pessoa aliviada olhando boletos organizados");
      expect(enviarMidia).toHaveBeenCalledWith("data:image/png;base64,BBBB", "doc-necessarios.png", "Lista dos documentos necessários");
      expect(criarRascunho).toHaveBeenCalledWith(expect.objectContaining({ slug: "como-limpar-nome-serasa" }), "media-capa");

      // Storage (follow-up 19/08/2026): mesma data URL original enviada ao WordPress, caminho
      // namespaced por propriedade+pauta (prop-1/pauta-1, ver pautaFalsa/propriedadeFalsa).
      expect(enviarImagemStorage).toHaveBeenCalledWith("data:image/png;base64,AAAA", "prop-1/pauta-1/capa-capa-serasa.png");
      expect(enviarImagemStorage).toHaveBeenCalledWith("data:image/png;base64,BBBB", "prop-1/pauta-1/secundaria-doc-necessarios.png");

      const corpoHtmlPublicado = criarRascunho.mock.calls[0][0].corpoHtml as string;
      // Imagem secundária embutida como <figure> com a URL PÚBLICA (pós-upload), não a data URL.
      expect(corpoHtmlPublicado).toContain('<img src="https://teste.exemplo.com/wp-content/uploads/doc-necessarios.png"');
      expect(corpoHtmlPublicado).toContain("<figcaption>RG e CPF em mãos antes de ligar.</figcaption>");
      // Schema Article usa a URL pública da capa (não a data URL); Organization avulso também
      // presente (subtlety #1 do brief da Task 10: decisão deliberada de emitir os dois blocos).
      expect(corpoHtmlPublicado).toContain('"image":"https://teste.exemplo.com/wp-content/uploads/capa-serasa.png"');
      expect(corpoHtmlPublicado).toContain('"@type":"Article"');
      expect(corpoHtmlPublicado).toContain('"@type":"Organization"');

      expect(repositorio.atualizarStatusPost).toHaveBeenCalledWith(
        "post-1",
        "rascunho",
        expect.objectContaining({
          imagemDestaqueUrl: "https://teste.exemplo.com/wp-content/uploads/capa-serasa.png",
          imagemDestaqueAlt: "Pessoa aliviada olhando boletos organizados",
          imagemDestaqueSlug: "capa-serasa",
          imagemDestaqueStorageUrl: "https://storage.exemplo.com/prop-1/pauta-1/capa-capa-serasa.png",
          imagensSecundarias: [
            {
              url: "https://teste.exemplo.com/wp-content/uploads/doc-necessarios.png",
              alt: "Lista dos documentos necessários",
              slug: "doc-necessarios",
              titulo: "Documentos necessários",
              legenda: "RG e CPF em mãos antes de ligar.",
              posicaoAposSecao: "depois da seção sobre documentos necessários",
              storageUrl: "https://storage.exemplo.com/prop-1/pauta-1/secundaria-doc-necessarios.png",
            },
          ],
        }),
      );
      // Painel de custo (spec seção 6): usage de capa+secundárias soma na etapa gerar_imagens.
      expect(tokensExtraidos.gerar_imagens).toEqual({ tokensEntrada: 1400, tokensSaida: 700 });
    });

    it("capa não gerada (null): publica sem imagem destacada, schema sem campo image, nada lança", async () => {
      const criarRascunho = vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" });
      const adaptadorFalso = {
        criarRascunho,
        enviarMidia: vi.fn(),
        verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
        aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
      };
      configurarCenarioBase(adaptadorFalso);
      vi.mocked(gerarCapa).mockResolvedValue({ resultado: null, usage: { inputTokens: 100, outputTokens: 50 } });
      vi.mocked(gerarImagensSecundarias).mockResolvedValue({ resultado: [], usage: { inputTokens: 0, outputTokens: 0 } });

      const resultado = await processarProximaPauta("matriz-1", "prop-1");

      expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
      expect(adaptadorFalso.enviarMidia).not.toHaveBeenCalled();
      expect(criarRascunho).toHaveBeenCalledWith(expect.anything(), undefined);
      const corpoHtmlPublicado = criarRascunho.mock.calls[0][0].corpoHtml as string;
      expect(corpoHtmlPublicado).not.toContain('"image":');
      // Sem capa gerada, o upload ao Storage nem é tentado (nested dentro do try de sucesso do
      // WordPress, ver gerarEEmbutirImagens) — sem candidatas secundárias, idem.
      expect(enviarImagemStorage).not.toHaveBeenCalled();
      expect(repositorio.atualizarStatusPost).toHaveBeenCalledWith(
        "post-1",
        "rascunho",
        expect.objectContaining({
          imagemDestaqueUrl: undefined,
          imagemDestaqueAlt: undefined,
          imagemDestaqueSlug: undefined,
          imagemDestaqueStorageUrl: undefined,
          imagensSecundarias: [],
        }),
      );
    });

    it("uma imagem secundária falha no upload: a que teve sucesso aparece no HTML final, a que falhou é descartada silenciosamente, nada lança", async () => {
      const enviarMidia = vi.fn().mockImplementation(async (_imagemUrl: string, nomeArquivo: string) => {
        if (nomeArquivo.startsWith("doc-necessarios")) {
          return { idRemoto: "media-sec-1", url: "https://teste.exemplo.com/wp-content/uploads/doc-necessarios.png" };
        }
        throw new Error("WordPress REST API respondeu 500 em /media");
      });
      const criarRascunho = vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" });
      const adaptadorFalso = {
        criarRascunho,
        enviarMidia,
        verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
        aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
      };
      configurarCenarioBase(adaptadorFalso);
      vi.mocked(gerarCapa).mockResolvedValue({ resultado: null, usage: { inputTokens: 0, outputTokens: 0 } });
      vi.mocked(gerarImagensSecundarias).mockResolvedValue({
        resultado: [
          {
            url: "data:image/png;base64,BBBB",
            alt: "Lista dos documentos necessários",
            slug: "doc-necessarios",
            titulo: "Documentos necessários",
            legenda: "RG e CPF em mãos antes de ligar.",
            posicaoAposSecao: "depois da seção sobre documentos necessários",
            storageUrl: null,
          },
          {
            url: "data:image/png;base64,CCCC",
            alt: "Fluxo do passo a passo",
            slug: "passo-a-passo",
            titulo: "Passo a passo",
            legenda: "Ligue e siga as instruções.",
            posicaoAposSecao: "depois da seção passo a passo",
            storageUrl: null,
          },
        ],
        usage: { inputTokens: 0, outputTokens: 0 },
      });
      const { detalhesExtraidos } = espiarRegistrarEtapa();

      const resultado = await processarProximaPauta("matriz-1", "prop-1");

      expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
      const corpoHtmlPublicado = criarRascunho.mock.calls[0][0].corpoHtml as string;
      expect(corpoHtmlPublicado).toContain("<figcaption>RG e CPF em mãos antes de ligar.</figcaption>");
      expect(corpoHtmlPublicado).not.toContain("<figcaption>Ligue e siga as instruções.</figcaption>");
      // A imagem que falhou no WordPress nem chega a tentar o Storage (nested dentro do try de
      // sucesso do WordPress) — só a que teve sucesso (doc-necessarios) é tentada.
      expect(enviarImagemStorage).toHaveBeenCalledTimes(1);
      expect(enviarImagemStorage).toHaveBeenCalledWith("data:image/png;base64,BBBB", "prop-1/pauta-1/secundaria-doc-necessarios.png");
      expect(repositorio.atualizarStatusPost).toHaveBeenCalledWith(
        "post-1",
        "rascunho",
        expect.objectContaining({
          imagensSecundarias: [
            expect.objectContaining({
              slug: "doc-necessarios",
              storageUrl: "https://storage.exemplo.com/prop-1/pauta-1/secundaria-doc-necessarios.png",
            }),
          ],
        }),
      );
      // Falha real precisa ficar distinguível no log, não só "sucesso perfeito" (brief da Task 10).
      expect(detalhesExtraidos.gerar_imagens).toContain("passo-a-passo");
    });

    // "Armadilha real" (brief do follow-up de Storage): `imagem` (e a variável de storageUrl) são
    // reatribuídas a cada iteração do loop de secundárias em gerarEEmbutirImagens — sem uma
    // variável NOVA por iteração, a URL de Storage de uma imagem vazaria pra outra. Duas
    // secundárias aprovadas, uma com sucesso no Storage e outra com falha, ambas com sucesso no
    // WordPress (senão a falha de Storage nem seria tentada).
    it("duas imagens secundárias, uma com sucesso e outra com falha no upload ao Storage: cada uma mantém seu próprio storageUrl, sem vazamento entre iterações", async () => {
      const enviarMidia = vi.fn().mockImplementation(async (_imagemUrl: string, nomeArquivo: string) => ({
        idRemoto: `media-${nomeArquivo}`,
        url: `https://teste.exemplo.com/wp-content/uploads/${nomeArquivo}`,
      }));
      const criarRascunho = vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" });
      const adaptadorFalso = {
        criarRascunho,
        enviarMidia,
        verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
        aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
      };
      configurarCenarioBase(adaptadorFalso);
      vi.mocked(gerarCapa).mockResolvedValue({ resultado: null, usage: { inputTokens: 0, outputTokens: 0 } });
      vi.mocked(gerarImagensSecundarias).mockResolvedValue({
        resultado: [
          {
            url: "data:image/png;base64,BBBB",
            alt: "Documentos necessários",
            slug: "doc-necessarios",
            titulo: "Documentos necessários",
            legenda: "RG e CPF em mãos antes de ligar.",
            posicaoAposSecao: "depois da seção sobre documentos necessários",
            storageUrl: null,
          },
          {
            url: "data:image/png;base64,CCCC",
            alt: "Passo a passo",
            slug: "passo-a-passo",
            titulo: "Passo a passo",
            legenda: "Ligue e siga as instruções.",
            posicaoAposSecao: "depois da seção passo a passo",
            storageUrl: null,
          },
        ],
        usage: { inputTokens: 0, outputTokens: 0 },
      });
      // Sobrescreve o stub padrão de sucesso: a primeira candidata (doc-necessarios) sobe com
      // sucesso, a segunda (passo-a-passo) falha — exatamente o cenário que exercita a armadilha.
      vi.mocked(enviarImagemStorage).mockImplementation(async (_dataUrl, caminho) => {
        if (caminho.includes("passo-a-passo")) throw new Error("Storage indisponível");
        return { url: `https://storage.exemplo.com/${caminho}` };
      });

      const resultado = await processarProximaPauta("matriz-1", "prop-1");

      expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
      expect(repositorio.atualizarStatusPost).toHaveBeenCalledWith(
        "post-1",
        "rascunho",
        expect.objectContaining({
          imagensSecundarias: [
            expect.objectContaining({
              slug: "doc-necessarios",
              storageUrl: "https://storage.exemplo.com/prop-1/pauta-1/secundaria-doc-necessarios.png",
            }),
            // A falha da segunda NÃO vaza pra primeira (nem o inverso): cada item carrega só o seu
            // próprio resultado de Storage.
            expect.objectContaining({ slug: "passo-a-passo", storageUrl: null }),
          ],
        }),
      );
    });

    it("upload da capa ao Storage falha: a capa continua publicada normalmente no WordPress, storage fica null, detalhe registrado", async () => {
      const enviarMidia = vi.fn().mockResolvedValue({ idRemoto: "media-capa", url: "https://teste.exemplo.com/wp-content/uploads/capa-serasa.png" });
      const criarRascunho = vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" });
      const adaptadorFalso = {
        criarRascunho,
        enviarMidia,
        verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
        aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
      };
      configurarCenarioBase(adaptadorFalso);
      vi.mocked(gerarCapa).mockResolvedValue({
        resultado: { url: "data:image/png;base64,AAAA", alt: "Alt capa", slug: "capa-serasa", titulo: "Capa Serasa" },
        usage: { inputTokens: 0, outputTokens: 0 },
      });
      vi.mocked(gerarImagensSecundarias).mockResolvedValue({ resultado: [], usage: { inputTokens: 0, outputTokens: 0 } });
      vi.mocked(enviarImagemStorage).mockRejectedValue(new Error("Storage indisponível"));
      const { detalhesExtraidos } = espiarRegistrarEtapa();

      const resultado = await processarProximaPauta("matriz-1", "prop-1");

      expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
      // A falha é só do Storage — a capa continua indo pro ar no WordPress normalmente.
      expect(repositorio.atualizarStatusPost).toHaveBeenCalledWith(
        "post-1",
        "rascunho",
        expect.objectContaining({
          imagemDestaqueUrl: "https://teste.exemplo.com/wp-content/uploads/capa-serasa.png",
          imagemDestaqueStorageUrl: undefined,
        }),
      );
      expect(detalhesExtraidos.gerar_imagens).toContain("capa: upload ao Storage falhou");
    });

    it("upload da capa (enviarMidia) lança: tratado como 'sem capa', publica normalmente sem lançar", async () => {
      const enviarMidia = vi.fn().mockRejectedValue(new Error("WordPress REST API respondeu 500 em /media"));
      const criarRascunho = vi.fn().mockResolvedValue({ idRemoto: "123", status: "rascunho" });
      const adaptadorFalso = {
        criarRascunho,
        enviarMidia,
        verificarRascunho: vi.fn().mockResolvedValue({ ok: true }),
        aprovarPublicar: vi.fn().mockResolvedValue({ urlPublicada: "https://teste.exemplo.com/como-limpar-nome-serasa/" }),
      };
      configurarCenarioBase(adaptadorFalso);
      vi.mocked(gerarCapa).mockResolvedValue({
        resultado: { url: "data:image/png;base64,AAAA", alt: "Alt capa", slug: "capa-serasa", titulo: "Capa Serasa" },
        usage: { inputTokens: 0, outputTokens: 0 },
      });
      vi.mocked(gerarImagensSecundarias).mockResolvedValue({ resultado: [], usage: { inputTokens: 0, outputTokens: 0 } });
      const { detalhesExtraidos } = espiarRegistrarEtapa();

      const resultado = await processarProximaPauta("matriz-1", "prop-1");

      expect(resultado).toEqual({ status: "publicado", url: "https://teste.exemplo.com/como-limpar-nome-serasa/" });
      expect(criarRascunho).toHaveBeenCalledWith(expect.anything(), undefined);
      const corpoHtmlPublicado = criarRascunho.mock.calls[0][0].corpoHtml as string;
      expect(corpoHtmlPublicado).not.toContain('"image":');
      // Upload ao WordPress falhou — o Storage nem chega a ser tentado (nested dentro do try de
      // sucesso do WordPress, ver gerarEEmbutirImagens).
      expect(enviarImagemStorage).not.toHaveBeenCalled();
      expect(repositorio.atualizarStatusPost).toHaveBeenCalledWith(
        "post-1",
        "rascunho",
        expect.objectContaining({
          imagemDestaqueUrl: undefined,
          imagemDestaqueAlt: undefined,
          imagemDestaqueSlug: undefined,
          imagemDestaqueStorageUrl: undefined,
        }),
      );
      expect(detalhesExtraidos.gerar_imagens).toContain("upload ao WordPress falhou");
    });
  });
});
