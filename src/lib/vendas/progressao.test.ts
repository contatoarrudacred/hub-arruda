import { describe, expect, it } from "vitest";
import { podeTentarAutomaticamente } from "./progressao";

describe("podeTentarAutomaticamente", () => {
  it("permite tentar de novo com 0, 1 ou 2 tentativas já feitas", () => {
    expect(podeTentarAutomaticamente(0)).toBe(true);
    expect(podeTentarAutomaticamente(1)).toBe(true);
    expect(podeTentarAutomaticamente(2)).toBe(true);
  });

  it("para de tentar sozinho a partir de 3 tentativas", () => {
    expect(podeTentarAutomaticamente(3)).toBe(false);
    expect(podeTentarAutomaticamente(10)).toBe(false);
  });
});
