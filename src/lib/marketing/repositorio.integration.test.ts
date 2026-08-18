// src/lib/marketing/repositorio.integration.test.ts
// Testes de INTEGRAÇÃO — batem no Supabase remoto real (não há Docker/Supabase local neste
// ambiente). Por isso ficam fora do `pnpm test` padrão (ver exclude em vitest.config.mts) e só
// rodam via `pnpm test:integration`, sabendo que escrevem no banco de produção. Cada teste limpa
// o que criou no afterAll — ver `registrarParaLimpeza`/limpeza global abaixo.
import { afterAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { marcarPautaPublicada, selecionarProximaPautaPendente } from "./repositorio";

const pessoasParaLimpar: string[] = [];

async function criarPropriedadeDeTeste() {
  const supabase = createAdminClient();
  const { data: pessoa } = await supabase
    .from("pessoas")
    .insert({ tipo_pessoa: "pj", nome_razao_social: "Propriedade Teste", documento: `teste-${Date.now()}` })
    .select("id")
    .single();
  pessoasParaLimpar.push(pessoa!.id as string);
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

afterAll(async () => {
  // Apagar a propriedade cascateia matrizes_conteudo -> pautas (ambas com "on delete cascade" na
  // migration 20260817070000); a pessoa é apagada por último. ATENÇÃO: "posts" NÃO tem cascade em
  // pauta_id/propriedade_id (ver mesma migration, linhas ~62-63) — se algum teste futuro criar uma
  // linha em "posts", este delete de propriedades_digitais vai falhar por violação de FK. Nenhum
  // teste atual cria "posts", então isso não morde hoje, mas fica registrado pra quem for
  // adicionar um teste que crie post: seria preciso apagar o post primeiro.
  const supabase = createAdminClient();
  for (const pessoaId of pessoasParaLimpar) {
    const { error: erroPropriedade } = await supabase.from("propriedades_digitais").delete().eq("pessoa_id", pessoaId);
    if (erroPropriedade) {
      console.error(`Falha ao limpar propriedades_digitais da pessoa de teste ${pessoaId}:`, erroPropriedade.message);
    }
    const { error: erroPessoa } = await supabase.from("pessoas").delete().eq("id", pessoaId);
    if (erroPessoa) {
      console.error(`Falha ao limpar pessoa de teste ${pessoaId}:`, erroPessoa.message);
    }
  }
});

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

  it("faz reclaim de pauta em_producao travada (atualizado_em com mais de 10 minutos)", async () => {
    const { matrizId } = await criarPropriedadeDeTeste();
    const supabase = createAdminClient();
    const maisDe10MinAtras = new Date(Date.now() - 11 * 60 * 1000).toISOString();

    await supabase.from("pautas").insert({
      matriz_conteudo_id: matrizId,
      palavra_chave_principal: "pauta travada",
      angulo: "informacional_direto",
      funil: "topo",
      status: "em_producao",
      atualizado_em: maisDe10MinAtras,
    });

    const selecionada = await selecionarProximaPautaPendente(matrizId);

    expect(selecionada?.palavraChavePrincipal).toBe("pauta travada");
    expect(selecionada?.status).toBe("em_producao");
  });

  it("incrementa tentativas ao fazer reclaim, alimentando o circuit breaker de max_tentativas", async () => {
    // O circuit breaker do pipeline (propriedade.maxTentativas, checado em processar-pauta.ts)
    // só funciona se `tentativas` refletir de verdade quantas vezes a pauta foi tentada — incluindo
    // reclaims. Sem isto, uma pauta que sempre mata a função de cron seria reclaimed pra sempre,
    // sem nunca ser bloqueada. Aqui simulamos uma pauta já com 2 tentativas (maxTentativas padrão
    // é 3) travada há mais de 10min; após o reclaim, tentativas deve virar 3 — o que já seria
    // suficiente pra processar-pauta.ts bloqueá-la no próximo ciclo, em vez de reprocessar.
    const { matrizId } = await criarPropriedadeDeTeste();
    const supabase = createAdminClient();
    const maisDe10MinAtras = new Date(Date.now() - 11 * 60 * 1000).toISOString();

    const { data: pautaInserida } = await supabase
      .from("pautas")
      .insert({
        matriz_conteudo_id: matrizId,
        palavra_chave_principal: "pauta travada com tentativas",
        angulo: "informacional_direto",
        funil: "topo",
        status: "em_producao",
        tentativas: 2,
        atualizado_em: maisDe10MinAtras,
      })
      .select("id")
      .single();

    const selecionada = await selecionarProximaPautaPendente(matrizId);

    expect(selecionada?.id).toBe(pautaInserida!.id);
    expect(selecionada?.tentativas).toBe(3);

    const { data: atualizada } = await supabase.from("pautas").select("tentativas").eq("id", pautaInserida!.id).single();
    expect(atualizada?.tentativas).toBe(3);
  });

  it("não faz reclaim de pauta em_producao recente", async () => {
    const { matrizId } = await criarPropriedadeDeTeste();
    const supabase = createAdminClient();

    await supabase.from("pautas").insert({
      matriz_conteudo_id: matrizId,
      palavra_chave_principal: "pauta em produção recente",
      angulo: "informacional_direto",
      funil: "topo",
      status: "em_producao",
      atualizado_em: new Date().toISOString(),
    });

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
