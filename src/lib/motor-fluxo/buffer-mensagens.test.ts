import { describe, expect, it } from "vitest";
import { concatenarMensagensLead } from "./buffer-mensagens";

describe("concatenarMensagensLead", () => {
  it("uma mensagem só: devolve o texto dela", () => {
    expect(concatenarMensagensLead([{ conteudo: "meu cpf e o cnpj da minha mulher", enviado_em: "2026-08-19T05:00:00Z" }])).toBe(
      "meu cpf e o cnpj da minha mulher",
    );
  });

  it("2 mensagens seguidas: junta com quebra de linha, na ordem recebida", () => {
    const r = concatenarMensagensLead([
      { conteudo: "só meu cpf e o cnpj dela", enviado_em: "2026-08-19T05:00:00Z" },
      { conteudo: "nome dela está limpo", enviado_em: "2026-08-19T05:00:01Z" },
    ]);
    expect(r).toBe("só meu cpf e o cnpj dela\nnome dela está limpo");
  });

  it("ignora mensagens sem texto (mídia sem legenda)", () => {
    const r = concatenarMensagensLead([
      { conteudo: "cpf + cnpj", enviado_em: "2026-08-19T05:00:00Z" },
      { conteudo: null, enviado_em: "2026-08-19T05:00:01Z" },
      { conteudo: "  ", enviado_em: "2026-08-19T05:00:02Z" },
    ]);
    expect(r).toBe("cpf + cnpj");
  });

  it("lista vazia: string vazia", () => {
    expect(concatenarMensagensLead([])).toBe("");
  });

  it("apara espaço em volta de cada mensagem antes de juntar", () => {
    const r = concatenarMensagensLead([
      { conteudo: "  oi  ", enviado_em: "2026-08-19T05:00:00Z" },
      { conteudo: " tudo bem? ", enviado_em: "2026-08-19T05:00:01Z" },
    ]);
    expect(r).toBe("oi\ntudo bem?");
  });
});
