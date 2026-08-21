import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { createAdminClient } from "@/lib/supabase/admin";
import * as processarPauta from "@/lib/marketing/processar-pauta";

// after() (Next.js) só funciona dentro de um request scope de verdade — fora disso, lança "after
// was called outside a request scope" (ver node_modules/next/dist/server/after/after.js). Nos
// testes, capturamos o callback em vez de deixar o after() real rodar, e o invocamos explicitamente
// depois de conferir a resposta — simula o "roda em background" sem depender de timing de
// microtask (o GET não espera o after() terminar, então só microtasks não garantiriam ordem).
let callbackCapturado: (() => Promise<void>) | null = null;
vi.mock("next/server", () => ({
  after: (fn: () => Promise<void>) => {
    callbackCapturado = fn;
  },
}));

vi.mock("@/lib/supabase/admin");

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  callbackCapturado = null;
});

function criarSupabaseFalso(matrizes: { id: string; propriedade_id: string }[]) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: matrizes }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: true }),
  };
}

describe("GET /api/cron/marketing-pipeline", () => {
  it("retorna 401 sem o CRON_SECRET correto", async () => {
    process.env.CRON_SECRET = "segredo-certo";
    const request = new Request("https://x.com/api/cron/marketing-pipeline", {
      headers: { authorization: "Bearer errado" },
    });

    const resposta = await GET(request);

    expect(resposta.status).toBe(401);
    expect(callbackCapturado).toBeNull();
  });

  it("responde na hora e processa uma tentativa por matriz ativa (em background), com lock por matriz", async () => {
    process.env.CRON_SECRET = "segredo-certo";
    const supabaseFalso = criarSupabaseFalso([
      { id: "matriz-1", propriedade_id: "prop-1" },
      { id: "matriz-2", propriedade_id: "prop-2" },
    ]);
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);
    vi.spyOn(processarPauta, "processarProximaPauta").mockResolvedValue({
      status: "publicado",
      url: "https://x.com/post",
    });

    const request = new Request("https://x.com/api/cron/marketing-pipeline", {
      headers: { authorization: "Bearer segredo-certo" },
    });

    const resposta = await GET(request);
    const corpo = await resposta.json();

    // A resposta em si não espera o processamento — só confirma que o disparo foi aceito.
    expect(corpo).toEqual({ disparado: true, matrizes: 2 });
    expect(processarPauta.processarProximaPauta).not.toHaveBeenCalled();

    // Processamento de verdade só roda quando o trabalho agendado via after() é executado.
    expect(callbackCapturado).not.toBeNull();
    await callbackCapturado!();

    expect(processarPauta.processarProximaPauta).toHaveBeenCalledTimes(2);
    expect(supabaseFalso.rpc).toHaveBeenCalledWith("fn_tentar_lock_cron", {
      p_id: "marketing-pipeline-matriz-1",
      p_duracao_segundos: 290,
    });
  });

  it("não processa matriz cujo lock já está em uso", async () => {
    process.env.CRON_SECRET = "segredo-certo";
    const supabaseFalso = criarSupabaseFalso([{ id: "matriz-1", propriedade_id: "prop-1" }]);
    supabaseFalso.rpc = vi.fn().mockResolvedValue({ data: false });
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);
    const processarSpy = vi.spyOn(processarPauta, "processarProximaPauta");

    const request = new Request("https://x.com/api/cron/marketing-pipeline", {
      headers: { authorization: "Bearer segredo-certo" },
    });

    await GET(request);
    await callbackCapturado!();

    expect(processarSpy).not.toHaveBeenCalled();
  });

  it("retorna 500 se a query de matrizes falhar (sem sequer agendar o processamento)", async () => {
    process.env.CRON_SECRET = "segredo-certo";
    const supabaseFalso = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: "erro de teste" } }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: true }),
    };
    vi.mocked(createAdminClient).mockReturnValue(supabaseFalso as never);

    const request = new Request("https://x.com/api/cron/marketing-pipeline", {
      headers: { authorization: "Bearer segredo-certo" },
    });

    const resposta = await GET(request);
    const corpo = await resposta.json();

    expect(resposta.status).toBe(500);
    expect(corpo.erro).toContain("Falha ao carregar matrizes de conteúdo");
    expect(corpo.erro).toContain("erro de teste");
    expect(callbackCapturado).toBeNull();
  });
});
