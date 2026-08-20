import { describe, expect, it } from "vitest";
import { formatarEventoAuditoria, type LinhaAuditoriaBruta } from "./timeline";

function linha(overrides: Partial<LinhaAuditoriaBruta>): LinhaAuditoriaBruta {
  return {
    tabela: "contratos",
    operacao: "UPDATE",
    dados_antes: null,
    dados_depois: null,
    criado_em: "2026-08-19T10:00:00Z",
    ...overrides,
  };
}

describe("formatarEventoAuditoria", () => {
  it("formata a criação do contrato (INSERT)", () => {
    const evento = formatarEventoAuditoria(
      linha({ tabela: "contratos", operacao: "INSERT", dados_depois: { status: "nova_oportunidade" } }),
    );
    expect(evento).toEqual({ data: "2026-08-19T10:00:00Z", texto: "Venda registrada — Nova Oportunidade" });
  });

  it("formata avanço de estágio (status mudou)", () => {
    const evento = formatarEventoAuditoria(
      linha({
        tabela: "contratos",
        operacao: "UPDATE",
        dados_antes: { status: "nova_oportunidade" },
        dados_depois: { status: "emitindo_contrato" },
      }),
    );
    expect(evento).toEqual({ data: "2026-08-19T10:00:00Z", texto: 'Avançou para "Emitindo Contrato"' });
  });

  it("inclui o motivo quando cancela", () => {
    const evento = formatarEventoAuditoria(
      linha({
        tabela: "contratos",
        operacao: "UPDATE",
        dados_antes: { status: "aguardando_assinaturas" },
        dados_depois: { status: "cancelada", motivo_cancelamento: "Cliente desistiu" },
      }),
    );
    expect(evento).toEqual({ data: "2026-08-19T10:00:00Z", texto: 'Avançou para "Cancelada" — Cliente desistiu' });
  });

  it("ignora UPDATE de contrato sem mudança de status (ruído)", () => {
    const evento = formatarEventoAuditoria(
      linha({
        tabela: "contratos",
        operacao: "UPDATE",
        dados_antes: { status: "aguardando_assinaturas" },
        dados_depois: { status: "aguardando_assinaturas", assinafy_document_status: "pending_signature" },
      }),
    );
    expect(evento).toBeNull();
  });

  it("formata parcela paga", () => {
    const evento = formatarEventoAuditoria(
      linha({
        tabela: "contrato_parcelas",
        operacao: "UPDATE",
        dados_antes: { status: "gerado", numero: 1 },
        dados_depois: { status: "pago", numero: 1 },
      }),
    );
    expect(evento).toEqual({ data: "2026-08-19T10:00:00Z", texto: "Parcela 1 paga" });
  });

  it("ignora UPDATE de parcela que não virou pago", () => {
    const evento = formatarEventoAuditoria(
      linha({
        tabela: "contrato_parcelas",
        operacao: "UPDATE",
        dados_antes: { status: "previsto", numero: 1 },
        dados_depois: { status: "gerado", numero: 1 },
      }),
    );
    expect(evento).toBeNull();
  });

  it("formata comissão de fornecedor recebida", () => {
    const evento = formatarEventoAuditoria(
      linha({
        tabela: "comissoes_fornecedor_receber",
        operacao: "UPDATE",
        dados_antes: { status: "previsto", numero: 2 },
        dados_depois: { status: "recebido", numero: 2 },
      }),
    );
    expect(evento).toEqual({ data: "2026-08-19T10:00:00Z", texto: "Comissão do fornecedor — parcela 2 recebida" });
  });

  it("ignora tabela desconhecida", () => {
    const evento = formatarEventoAuditoria(linha({ tabela: "pessoas", operacao: "UPDATE" }));
    expect(evento).toBeNull();
  });

  it("ignora DELETE", () => {
    const evento = formatarEventoAuditoria(linha({ tabela: "contratos", operacao: "DELETE", dados_antes: { status: "concluida" } }));
    expect(evento).toBeNull();
  });
});
