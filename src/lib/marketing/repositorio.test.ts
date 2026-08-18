// src/lib/marketing/repositorio.test.ts
import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { marcarPautaPublicada, selecionarProximaPautaPendente } from "./repositorio";

async function criarPropriedadeDeTeste() {
  const supabase = createAdminClient();
  const { data: pessoa } = await supabase
    .from("pessoas")
    .insert({ tipo_pessoa: "pj", nome_razao_social: "Propriedade Teste", documento: `teste-${Date.now()}` })
    .select("id")
    .single();
  const { data: propriedade } = await supabase
    .from("propriedades_digitais")
    .insert({ pessoa_id: pessoa!.id, nome: "Site Teste", url_base: "https://teste.exemplo.com" })
    .select("id")
    .single();
  const { data: matriz } = await supabase
    .from("matrizes_conteudo")
    .insert({ propriedade_id: propriedade!.id, nome: "Matriz Teste" })
    .select("id")
    .single();
  return { propriedadeId: propriedade!.id as string, matrizId: matriz!.id as string };
}

describe("selecionarProximaPautaPendente", () => {
  it("retorna a pauta pendente de maior prioridade, ignorando as em produção/publicadas", async () => {
    const { matrizId } = await criarPropriedadeDeTeste();
    const supabase = createAdminClient();

    await supabase.from("pautas").insert([
      {
        matriz_conteudo_id: matrizId,
        palavra_chave_principal: "pauta baixa prioridade",
        angulo: "informacional_direto",
        funil: "topo",
        status: "pendente",
        prioridade_score: 10,
      },
      {
        matriz_conteudo_id: matrizId,
        palavra_chave_principal: "pauta alta prioridade",
        angulo: "urgencia_temporal",
        funil: "fundo",
        status: "pendente",
        prioridade_score: 90,
      },
      {
        matriz_conteudo_id: matrizId,
        palavra_chave_principal: "pauta já em produção",
        angulo: "mito_ou_verdade",
        funil: "meio",
        status: "em_producao",
        prioridade_score: 100,
      },
    ]);

    const selecionada = await selecionarProximaPautaPendente(matrizId);

    expect(selecionada?.palavraChavePrincipal).toBe("pauta alta prioridade");
  });

  it("retorna null quando não há pauta pendente", async () => {
    const { matrizId } = await criarPropriedadeDeTeste();
    const selecionada = await selecionarProximaPautaPendente(matrizId);
    expect(selecionada).toBeNull();
  });
});

describe("marcarPautaPublicada", () => {
  it("marca a pauta como publicada", async () => {
    const { matrizId } = await criarPropriedadeDeTeste();
    const supabase = createAdminClient();
    const { data: pauta } = await supabase
      .from("pautas")
      .insert({
        matriz_conteudo_id: matrizId,
        palavra_chave_principal: "teste publicacao",
        angulo: "informacional_direto",
        funil: "topo",
        status: "em_producao",
      })
      .select("id")
      .single();

    await marcarPautaPublicada(pauta!.id);

    const { data: atualizada } = await supabase.from("pautas").select("status").eq("id", pauta!.id).single();
    expect(atualizada?.status).toBe("publicado");
  });
});
