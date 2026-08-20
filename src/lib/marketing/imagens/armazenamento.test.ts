// src/lib/marketing/imagens/armazenamento.test.ts
// Testes UNITÁRIOS — createAdminClient é mockado (vi.mock), nada bate no Storage real. Mesmo
// padrão de mock de createAdminClient usado em repositorio.test.ts (from/storage encadeáveis).
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarImagemStorage } from "./armazenamento";

vi.mock("@/lib/supabase/admin");

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function mockarStorage(resultadoUpload: { error: { message: string } | null }, publicUrl: string) {
  const upload = vi.fn().mockResolvedValue(resultadoUpload);
  const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl } });
  const from = vi.fn().mockReturnValue({ upload, getPublicUrl });
  vi.mocked(createAdminClient).mockReturnValue({ storage: { from } } as never);
  return { upload, getPublicUrl, from };
}

const DATA_URL_EXEMPLO = "data:image/png;base64,aGVsbG8tbXVuZG8="; // "hello-mundo" em base64

describe("enviarImagemStorage", () => {
  it("sucesso: sobe o buffer decodificado pro bucket marketing-imagens e devolve a URL pública", async () => {
    const { upload, getPublicUrl, from } = mockarStorage({ error: null }, "https://supabase.exemplo.com/storage/v1/object/public/marketing-imagens/prop-1/pauta-1/capa-exemplo.png");

    const resultado = await enviarImagemStorage(DATA_URL_EXEMPLO, "prop-1/pauta-1/capa-exemplo.png");

    expect(from).toHaveBeenCalledWith("marketing-imagens");
    expect(upload).toHaveBeenCalledWith(
      "prop-1/pauta-1/capa-exemplo.png",
      Buffer.from("aGVsbG8tbXVuZG8=", "base64"),
      { contentType: "image/png", upsert: true },
    );
    expect(getPublicUrl).toHaveBeenCalledWith("prop-1/pauta-1/capa-exemplo.png");
    expect(resultado).toEqual({ url: "https://supabase.exemplo.com/storage/v1/object/public/marketing-imagens/prop-1/pauta-1/capa-exemplo.png" });
  });

  it("erro no upload: lança (é responsabilidade do chamador decidir se isso bloqueia algo)", async () => {
    mockarStorage({ error: { message: "bucket não encontrado" } }, "");

    await expect(enviarImagemStorage(DATA_URL_EXEMPLO, "prop-1/pauta-1/capa-exemplo.png")).rejects.toThrow(
      /Falha ao enviar imagem ao Storage.*bucket não encontrado/,
    );
  });

  it("decodifica corretamente uma data URL de exemplo (media type e bytes exatos)", async () => {
    const { upload } = mockarStorage({ error: null }, "https://x.exemplo.com/y.jpg");

    await enviarImagemStorage("data:image/jpeg;base64,QUJDRA==", "prop-2/pauta-2/secundaria-exemplo.png");

    const bufferEnviado = upload.mock.calls[0][1] as Buffer;
    expect(bufferEnviado.toString("utf-8")).toBe("ABCD");
    expect(upload.mock.calls[0][2]).toEqual({ contentType: "image/jpeg", upsert: true });
  });

  it("rejeita um valor que não é uma data URL válida (não tenta fetch, não engole silenciosamente)", async () => {
    mockarStorage({ error: null }, "");

    await expect(enviarImagemStorage("https://algum-site.com/imagem.png", "prop-1/pauta-1/capa.png")).rejects.toThrow(
      /não é uma data URL de imagem válida/,
    );
  });
});
