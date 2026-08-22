import { describe, expect, it, vi, afterEach } from "vitest";
import { verificarSegredoWebhook } from "./verificar-segredo-webhook";

function requestCom(secret: string | null): Request {
  const url = secret === null ? "https://x.com/webhook" : `https://x.com/webhook?secret=${encodeURIComponent(secret)}`;
  return new Request(url);
}

describe("verificarSegredoWebhook", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("segredo certo na query string: autoriza", () => {
    vi.stubEnv("TESTE_WEBHOOK_SECRET", "abc123");
    expect(verificarSegredoWebhook(requestCom("abc123"), "TESTE_WEBHOOK_SECRET")).toBe(true);
  });

  it("segredo errado: rejeita", () => {
    vi.stubEnv("TESTE_WEBHOOK_SECRET", "abc123");
    expect(verificarSegredoWebhook(requestCom("errado"), "TESTE_WEBHOOK_SECRET")).toBe(false);
  });

  it("sem segredo na query string: rejeita", () => {
    vi.stubEnv("TESTE_WEBHOOK_SECRET", "abc123");
    expect(verificarSegredoWebhook(requestCom(null), "TESTE_WEBHOOK_SECRET")).toBe(false);
  });

  it("env var não configurada e não é produção (sem VERCEL): autoriza (dev local)", () => {
    vi.stubEnv("TESTE_WEBHOOK_SECRET", undefined);
    vi.stubEnv("VERCEL", undefined);
    expect(verificarSegredoWebhook(requestCom(null), "TESTE_WEBHOOK_SECRET")).toBe(true);
  });

  it("env var não configurada EM PRODUÇÃO (VERCEL setado): rejeita (fail-closed)", () => {
    vi.stubEnv("TESTE_WEBHOOK_SECRET", undefined);
    vi.stubEnv("VERCEL", "1");
    expect(verificarSegredoWebhook(requestCom(null), "TESTE_WEBHOOK_SECRET")).toBe(false);
  });
});
