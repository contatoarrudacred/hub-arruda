// Script one-off (22/08/2026) — reclassifica os ~347 ângulos prontos (Bloco 11) já escritos pelo
// Luiz em todas as personas, atribuindo a cada um o tipo retórico do catálogo de 15
// (TipoAngulo/CATALOGO_TIPOS_ANGULO/NOME_TIPO_ANGULO em src/lib/marketing/tipos.ts). Sem isso, o
// sorteio de tipo do Estrategista (estrategista.ts) não tem nada pra sortear no estoque já
// existente — só nos ângulos novos gerados por IA daqui pra frente.
//
// Uso: pnpm exec tsx scripts/reclassificar-angulos-prontos.ts
//
// Pré-requisito de ordem: só roda depois da migration
// supabase/migrations/20260822090000_marketing_tipo_angulo.sql ter sido aplicada pelo Luiz — a
// coluna pautas.tipo_angulo em si não é tocada aqui, mas o comentário atualizado de
// personas.angulos_prontos (novo shape {texto,tipo}[]) descreve o resultado deste script.
//
// Não importa repositorio.ts/admin.ts: ambos trazem `import "server-only"`, que fora do bundler
// do Next (sem a export condition "react-server") lança incondicionalmente — confirmado lendo
// node_modules/server-only/index.js. Este script monta seu próprio cliente Supabase (mesmas env
// vars que createAdminClient usa) e sua própria chamada Anthropic — só importa os tipos/catálogo
// de tipos.ts, que não tem "server-only".

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { carregarEnvLocal } from "../vitest.shared";
import { CATALOGO_TIPOS_ANGULO, NOME_TIPO_ANGULO, type TipoAngulo } from "../src/lib/marketing/tipos";

const env = { ...process.env, ...carregarEnvLocal() };

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const MODELO_CLASSIFICACAO = "claude-sonnet-5";

type PersonaRow = { id: string; nome: string; angulos_prontos: unknown };
/** Shape bruto devolvido pela ferramenta (chaves em snake_case, igual ao schema da tool). */
type ClassificacaoBruta = { angulo_texto: string; tipo: TipoAngulo };
/** Shape final gravado em personas.angulos_prontos — mesmo formato que PersonaAtiva/PersonaCarregada esperam. */
type AnguloClassificado = { texto: string; tipo: TipoAngulo };

const FERRAMENTA_CLASSIFICACAO = {
  name: "classificar_angulos_prontos",
  description: "Registra a classificação de cada ângulo pronto no catálogo de 15 tipos retóricos.",
  input_schema: {
    type: "object" as const,
    properties: {
      classificacoes: {
        type: "array",
        description:
          "Uma entrada para CADA ângulo recebido, na mesma ordem — nenhum pode ficar de fora, nenhum pode ser inventado.",
        items: {
          type: "object",
          properties: {
            angulo_texto: {
              type: "string",
              description: "O texto do ângulo EXATAMENTE como recebido (cópia literal, sem parafrasear).",
            },
            tipo: { type: "string", enum: CATALOGO_TIPOS_ANGULO, description: "O tipo retórico deste ângulo." },
          },
          required: ["angulo_texto", "tipo"],
        },
      },
    },
    required: ["classificacoes"],
  },
};

function montarPrompt(nomePersona: string, angulos: string[]): string {
  const catalogo = CATALOGO_TIPOS_ANGULO.map((tipo) => `- ${tipo}: ${NOME_TIPO_ANGULO[tipo].label} — ${NOME_TIPO_ANGULO[tipo].descricao}`).join(
    "\n",
  );
  const lista = angulos.map((a, i) => `${i + 1}. ${a}`).join("\n");
  return [
    `Classifique cada um dos ângulos de conteúdo abaixo (persona: ${nomePersona}) em UM dos 15 tipos retóricos do catálogo.`,
    "",
    "Catálogo de tipos:",
    catalogo,
    "",
    "Ângulos a classificar:",
    lista,
    "",
    "Para CADA ângulo, devolva o texto EXATAMENTE como recebido (cópia literal, sem parafrasear, sem corrigir typos) junto com o tipo escolhido. Nenhum ângulo pode ficar de fora da resposta. Use a ferramenta para registrar o resultado.",
  ].join("\n");
}

/**
 * Casa a lista classificada devolvida pela IA com a lista original, por igualdade exata de texto
 * — multiset, não índice (a IA pode reordenar). Consome cada classificação usada (splice) pra
 * lidar corretamente com ângulos duplicados na mesma persona. Devolve `null` se sobrar ângulo sem
 * classificação correspondente ou se a IA inventou/alterou algum texto — nesse caso a persona é
 * pulada inteira, sem gravar nada, pra revisão manual do Luiz.
 */
function casarClassificacoes(original: string[], classificadas: ClassificacaoBruta[]): AnguloClassificado[] | null {
  if (classificadas.length !== original.length) return null;
  const restantes = [...classificadas];
  const resultado: AnguloClassificado[] = [];
  for (const texto of original) {
    const idx = restantes.findIndex((c) => c.angulo_texto === texto);
    if (idx === -1) return null;
    const [encontrada] = restantes.splice(idx, 1);
    resultado.push({ texto: encontrada.angulo_texto, tipo: encontrada.tipo });
  }
  return resultado;
}

async function classificarPersona(persona: PersonaRow): Promise<{ status: "classificada" | "pulada"; motivo?: string }> {
  const bruto = persona.angulos_prontos;
  if (!Array.isArray(bruto) || bruto.length === 0) {
    return { status: "pulada", motivo: "angulos_prontos vazio" };
  }
  // Já migrada (shape novo, {texto,tipo}) — script seguro de rodar de novo por engano.
  if (typeof bruto[0] !== "string") {
    return { status: "pulada", motivo: "já está no shape {texto,tipo} — não reclassificado de novo" };
  }
  const angulosOriginais = bruto as string[];

  const resposta = await anthropic.messages.create({
    model: MODELO_CLASSIFICACAO,
    max_tokens: 4000,
    tools: [FERRAMENTA_CLASSIFICACAO],
    tool_choice: { type: "tool", name: "classificar_angulos_prontos" },
    messages: [{ role: "user", content: montarPrompt(persona.nome, angulosOriginais) }],
  });

  if (resposta.stop_reason === "max_tokens") {
    return { status: "pulada", motivo: "resposta truncada por limite de tokens" };
  }
  const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use");
  if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") {
    return { status: "pulada", motivo: "IA não retornou resultado estruturado" };
  }

  const bruta = blocoFerramenta.input as { classificacoes: ClassificacaoBruta[] };
  if (!Array.isArray(bruta.classificacoes)) {
    return { status: "pulada", motivo: "campo classificacoes ausente ou inválido" };
  }

  const casadas = casarClassificacoes(angulosOriginais, bruta.classificacoes);
  if (!casadas) {
    return { status: "pulada", motivo: "classificação não bate exatamente com os ângulos originais (multiset)" };
  }
  for (const c of casadas) {
    if (!CATALOGO_TIPOS_ANGULO.includes(c.tipo)) {
      return { status: "pulada", motivo: `tipo fora do catálogo: "${c.tipo}"` };
    }
  }

  const { error } = await supabase
    .from("personas")
    .update({ angulos_prontos: casadas })
    .eq("id", persona.id);
  if (error) return { status: "pulada", motivo: `falha ao gravar: ${error.message}` };

  return { status: "classificada" };
}

async function main() {
  const { data: personas, error } = await supabase.from("personas").select("id, nome, angulos_prontos").returns<PersonaRow[]>();
  if (error) throw new Error(`Falha ao listar personas: ${error.message}`);
  if (!personas || personas.length === 0) {
    console.log("Nenhuma persona encontrada.");
    return;
  }

  console.log(`${personas.length} personas encontradas. Processando sequencialmente...\n`);

  let classificadas = 0;
  let puladas = 0;
  // Sequencial (não Promise.all) — evita rate limit da API e mantém o log legível linha a linha.
  for (const [i, persona] of personas.entries()) {
    const resultado = await classificarPersona(persona);
    if (resultado.status === "classificada") {
      classificadas++;
      console.log(`[${i + 1}/${personas.length}] ${persona.nome}: classificada.`);
    } else {
      puladas++;
      console.log(`[${i + 1}/${personas.length}] ${persona.nome}: pulada (${resultado.motivo}).`);
    }
  }

  console.log(`\nConcluído: ${classificadas} classificadas, ${puladas} puladas.`);
  if (puladas > 0) {
    console.log("Revise manualmente as personas puladas acima — nenhuma delas teve angulos_prontos alterado.");
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
