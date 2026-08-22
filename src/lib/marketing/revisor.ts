// src/lib/marketing/revisor.ts
// Estágio 2 do pipeline — valida o rascunho contra o checklist da propriedade + checagem de
// alucinação factual, score mínimo 80/100 por padrão (mesmo padrão do plano original da QMARKA,
// agora calibrável por propriedade — ver spec Fase 4a, seção 3.1.1).
//
// Fase 4a (19/08/2026, spec docs/superpowers/specs/2026-08-19-fase4-precisao-imagens-distribuicao-design.md
// seções 3.1/3.1.1) estende a decisão de aprovação de "só score" pra "score E três gates
// multiplicativos" (precisão factual, fontes específicas, originalidade) — um score alto não
// compensa mais um `false` em nenhum dos três, decisão deliberada pra não deixar a média do
// checklist "engolir" um problema factual/legal sério (ver calcularAprovacao abaixo).

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ConteudoGerado, ItemChecklistCarregado, PropriedadeCarregada, ResultadoRevisao, UsageTokens } from "./tipos";

const MODELO_REVISOR = "claude-sonnet-5";

/** Default aplicado quando a propriedade não configura `scoreMinimoAprovacao` em `config_pipeline`
 * — mesmo valor hardcoded de antes da Fase 4a, preservado como default pra propriedade nenhuma
 * mudar de comportamento só por existir esta feature (regressão coberta em revisor.test.ts). */
const SCORE_MINIMO_APROVACAO_PADRAO = 80;

/** Post recente da mesma propriedade, pro Revisor julgar `originalidade_adequada` (spec seção
 * 3.1, "Contexto novo no prompt do Revisor") — título + ângulo, não o conteúdo inteiro. Quem monta
 * esta lista (join posts/pautas publicados) é responsabilidade de processar-pauta.ts / Task 3, não
 * deste módulo. */
type PostRecenteResumo = { titulo: string; angulo: string };

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

const FERRAMENTA_REVISOR = {
  name: "registrar_revisao",
  description: "Registra o resultado da revisão de qualidade do rascunho.",
  input_schema: {
    type: "object" as const,
    properties: {
      score: { type: "number", description: "Score de 0 a 100, ponderado pelo peso de cada item do checklist." },
      precisao_factual_adequada: {
        type: "boolean",
        description:
          "false se alguma afirmação jurídica/financeira sensível carece de sustentação ou está tecnicamente incorreta.",
      },
      fontes_especificas: {
        type: "boolean",
        description: "false se alguma fonte citada aponta pra homepage genérica em vez de página/documento específico.",
      },
      originalidade_adequada: {
        type: "boolean",
        description:
          "false se, removendo a persona e a palavra-chave, o rascunho for essencialmente igual a um post já publicado desta propriedade.",
      },
      motivo: {
        type: "string",
        description:
          "Obrigatório quando reprovado (score abaixo do mínimo OU qualquer um dos três campos booleanos acima for false): contém o diagnóstico específico do que falhou E uma sugestão concreta do que corrigir, pro Escritor (ou um humano) usar na próxima tentativa. Null quando aprovado.",
      },
    },
    required: ["score", "precisao_factual_adequada", "fontes_especificas", "originalidade_adequada"],
  },
};

// Ferramenta de busca na internet nativa da Anthropic (19/08/2026, pedido do Luiz) — mesma
// ferramenta já disponível pro Escritor (escritor.ts): o Revisor tem sido pego de surpresa
// julgando precisão factual/fontes sem poder checar nada de verdade (achado real: aprovou uma
// citação inventada da "Súmula 548 do STJ" numa rodada por não ter como confirmar o que a súmula
// realmente diz). Deixa a ferramenta à disposição pra quando o Revisor tiver dúvida real — não é
// obrigatório usar em toda revisão, só quando uma afirmação específica precisa de confirmação.
const FERRAMENTA_BUSCA_WEB = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  max_uses: 6,
};

/** Texto de instrução interpolado no prompt a partir de `propriedade.rigorYmyl` — spec seção
 * 3.1.1: "alto" pesa nichos YMYL (financeiro/jurídico/saúde, caso da ArrudaCred), "baixo" é pra
 * nicho de baixo risco, "desativado" mantém o campo preenchido honestamente mas sinaliza que o
 * critério não é prioritário (o gate correspondente pode estar desligado via `checarPrecisaoFactual`
 * — são dois parâmetros independentes: um calibra o TEXTO da instrução, o outro liga/desliga o
 * GATE na decisão de aprovação). "medio" é a redação-base, equivalente à instrução única que
 * existia antes da Fase 4a. */
const TEXTOS_RIGOR_YMYL: Record<NonNullable<PropriedadeCarregada["rigorYmyl"]>, string> = {
  alto: "Rigor YMYL ALTO para esta propriedade (nicho sensível — financeiro, jurídico ou saúde): qualquer afirmação jurídica ou financeira sensível sem lastro claro reprova precisao_factual_adequada, mesmo que pareça plausível. Aqui o custo de deixar passar um erro é muito maior que o de ser conservador demais.",
  medio: "Rigor YMYL padrão para esta propriedade: reprove precisao_factual_adequada quando alguma afirmação sensível parecer inventada, desatualizada ou tecnicamente incorreta.",
  baixo: "Rigor YMYL BAIXO para esta propriedade (nicho de baixo risco): reprove precisao_factual_adequada só diante de erro factual claro e grave — não penalize incerteza menor ou simplificação razoável de um tema não sensível.",
  desativado: "Rigor YMYL DESATIVADO para esta propriedade: ainda preencha precisao_factual_adequada com uma avaliação honesta, mas este não é o critério prioritário aqui — a calibração desta propriedade pode inclusive não usar este campo na decisão final de aprovação.",
};

/**
 * Contagem real de palavras do corpo do artigo — achado do teste de ponta a ponta em produção
 * (19/08/2026): pedir pro próprio Revisor "estimar" a extensão olhando o HTML produz estimativas
 * muito abaixo da realidade em textos longos (visto na prática: modelo estimou "~1.400-1.500
 * palavras" para um texto com 2.595 palavras reais — quase o dobro), reprovando por extensão um
 * rascunho que já atendia ao mínimo. Contar programaticamente e entregar o número pronto no prompt
 * elimina essa fonte de erro por inteiro — mesmo princípio de secundarias.ts (Task 8): número que o
 * código consegue calcular com exatidão não deve ser deixado pro modelo estimar de cabeça. Remove o
 * bloco `<script>` (JSON-LD do FAQPage/Article, que não é prosa) antes de contar.
 */
function contarPalavrasCorpo(html: string): number {
  const semScript = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const semTags = semScript.replace(/<[^>]+>/g, " ");
  return semTags.split(/\s+/).filter(Boolean).length;
}

function montarPrompt(
  conteudo: ConteudoGerado,
  checklist: ItemChecklistCarregado[],
  propriedade: PropriedadeCarregada,
  postsRecentes: PostRecenteResumo[],
  numeroTentativa: number,
): string {
  // Calibração dupla Escritor/Revisor (Fase 4b, 19/08/2026, pedido do Luiz) — itemParaRevisor,
  // quando preenchido, substitui o texto que o Revisor vê pra este item (ex.: Escritor mira
  // "40-60 palavras", Revisor aceita "20-80 palavras"); ausente/null usa o mesmo `item` do
  // Escritor (comportamento padrão, idêntico a antes desta calibração existir).
  const linhasChecklist = checklist.map((c) => `- (peso ${c.peso}) ${c.itemParaRevisor ?? c.item}`).join("\n");
  const contagemPalavras = contarPalavrasCorpo(conteudo.conteudoHtml);
  // Data atual REAL (achado real de teste em produção, 19/08/2026, apontado pelo Luiz): sem isto,
  // o modelo não tem como saber com segurança "que dia é hoje" e pode julgar uma data válida (ex.:
  // "fevereiro de 2026", já passada) como "data futura" e reprovar precisao_factual_adequada por
  // um motivo que não existe — visto na prática. Mesmo princípio de contarPalavrasCorpo: um fato
  // que o código sabe com exatidão não deve ser deixado pro modelo "lembrar" ou inferir sozinho.
  const dataAtual = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  const scoreMinimo = propriedade.scoreMinimoAprovacao ?? SCORE_MINIMO_APROVACAO_PADRAO;
  const textoRigor = TEXTOS_RIGOR_YMYL[propriedade.rigorYmyl ?? "medio"];
  const linhasPostsRecentes = postsRecentes.length
    ? postsRecentes.map((p) => `- "${p.titulo}" (ângulo: ${p.angulo})`).join("\n")
    : "(nenhum post publicado recente registrado pra esta propriedade)";

  return [
    "Você é o Agente QA/Revisor de um pipeline de geração de conteúdo. Avalie o rascunho abaixo contra o checklist, incluindo checagem de alucinação factual (dados numéricos citados precisam ser plausíveis, não inventados).",
    "",
    // Achado real de teste em produção (19/08/2026, pedido do Luiz): sem esta instrução, o
    // Revisor tendia a reportar só 2-3 problemas por rodada — o Escritor corrigia exatamente
    // esses, e a rodada seguinte reprovava por OUTROS problemas que já existiam desde o início,
    // mas nunca tinham sido mencionados. Isso multiplicava o número de tentativas necessárias (e
    // o custo de cada uma) sem motivo — o texto já tinha o segundo problema na 1ª versão, só
    // ninguém tinha avisado. Instrução explícita pra evitar reprovação "em fatias".
    "Revisão sistemática obrigatória: percorra o CHECKLIST INTEIRO, item por item, contra o TEXTO COMPLETO do rascunho (do título ao final do FAQ) antes de decidir o resultado — não pare no primeiro problema encontrado nem generalize a partir de uma amostra. Se o rascunho for reprovado, o motivo precisa listar TODOS os problemas reais encontrados nesta passada completa, não só os 1-2 primeiros — o objetivo é que o Escritor consiga corrigir tudo de uma vez na próxima tentativa, em vez de descobrir um problema novo a cada rodada.",
    "",
    // Regra dura pedida pelo Luiz (19/08/2026), achado real de teste em produção: o Revisor
    // convergia bem nos problemas grandes, mas a cada rodada de correção passava a reprovar por um
    // detalhe cada vez menor (1 link a mais do que o número exato pedido, um link repetido que
    // ainda assim é específico, uma seção de CTA que tecnicamente não é uma pergunta) — nenhum
    // desses é um defeito de verdade, mas cada reprovação consome uma tentativa inteira (e o custo
    // real de tokens de uma rodada completa Escritor+Revisor). Regra explícita de triagem entre
    // "defeito real" e "poderia melhorar", pra parar de reprovar por coisas que não deveriam
    // reprovar.
    'Reprovação só por motivo real: para cada item do checklist e para cada gate (precisão factual, fontes específicas, originalidade), classifique o que encontrar em duas categorias — (a) DEFEITO REAL: compromete a credibilidade, a precisão factual, ou deixa de cumprir de verdade o que o item exige (ex.: um dado inventado, uma fonte que não sustenta a afirmação que ela deveria sustentar, a extensão mínima não atingida, um H1 sem a palavra-chave); (b) PODE MELHORAR: uma nuance estilística ou um detalhe menor que não compromete o objetivo do item (ex.: 1 link a mais ou a menos do que o número exato pedido quando a cobertura de fontes já está adequada, um link específico repetido mais de uma vez, uma seção de CTA que não segue o padrão de resposta-direta por não ser uma pergunta). Só REPROVE (score abaixo do mínimo, ou qualquer um dos três gates booleanos como false) por itens do tipo (a). Itens do tipo (b) devem ser citados no motivo como sugestão de melhoria — útil pro Escritor considerar numa próxima geração do zero — mas NÃO devem, sozinhos, reprovar o rascunho; o score também precisa refletir essa distinção (pequenas melhorias possíveis não derrubam o score sozinhas abaixo do mínimo).',
    numeroTentativa > 1
      ? `Esta é a ${numeroTentativa}ª revisão desta pauta — já houve pelo menos uma correção anterior. Aplique a regra acima com atenção redobrada: aprove assim que os únicos problemas remanescentes forem do tipo "pode melhorar" (nenhum defeito real). Insistir em reprovar por causa de itens que não são defeitos de verdade só consome mais uma rodada inteira de tokens sem melhorar o que realmente importa no post.`
      : "",
    "",
    `Contagem REAL de palavras do corpo do artigo (calculada programaticamente, não estime por conta própria): ${contagemPalavras} palavras. Use este número exato para avaliar qualquer item do checklist sobre extensão mínima/máxima — não tente contar ou estimar visualmente, o número acima já é preciso.`,
    "",
    `Data de hoje (real, calculada pelo sistema — não estime nem assuma outra data): ${dataAtual}. Use esta data como referência pra julgar se qualquer data/período/estatística citada no rascunho é passado, presente ou futuro. Uma data anterior a hoje NÃO é "futura" só porque parece recente — confira contra a data real acima antes de reprovar algo por esse motivo (achado real de teste em produção: o Revisor já reprovou por engano tratando uma data passada como "impossível/futura").`,
    "",
    `Score mínimo para aprovação: ${scoreMinimo}/100.`,
    "",
    textoRigor,
    "",
    "Fontes específicas: reprove fontes_especificas se alguma fonte citada no rascunho apontar pra homepage genérica de um site em vez de uma página ou documento específico (ex.: citar \"gov.br\" solto em vez do link direto pra norma/página que sustenta a afirmação).",
    "",
    // Achado real de teste em produção (19/08/2026, pedido do Luiz): o Revisor já aprovou uma
    // citação jurídica inventada ("Súmula 548 do STJ" atribuída a um prazo que ela não trata) por
    // não ter como confirmar de verdade o que a fonte citada realmente diz — só julgava por
    // plausibilidade textual. web_search agora disponível fecha esse gap na origem.
    "Verificação por busca (use quando tiver dúvida real, não é obrigatório em toda revisão): você tem acesso à ferramenta web_search. Use-a sempre que precisar CONFIRMAR de verdade uma afirmação específica antes de aprovar ou reprovar por causa dela — por exemplo: confirmar que uma súmula/lei/resolução citada realmente trata do assunto atribuído a ela (não assuma pela numeração ou pelo nome que parece plausível); confirmar que um dado numérico/estatística citado bate com uma fonte oficial real; ou confirmar que a página de um link realmente sustenta a afirmação específica do parágrafo onde ele aparece (não só que o domínio é oficial). Não reprove por 'parece inventado' quando dá pra simplesmente checar — e não aprove uma citação duvidosa só porque soa plausível.",
    "",
    "Originalidade: compare o rascunho abaixo com os posts já publicados desta propriedade (títulos e ângulos listados a seguir). Se, removendo a persona e trocando a palavra-chave principal, o rascunho for essencialmente o mesmo conteúdo de um post já publicado, reprove originalidade_adequada.",
    "Posts recentes já publicados desta propriedade:",
    linhasPostsRecentes,
    "",
    "Checklist:",
    linhasChecklist,
    "",
    `Título: ${conteudo.titulo}`,
    `Meta title: ${conteudo.metaTitle}`,
    `Meta description: ${conteudo.metaDescription}`,
    `Conteúdo HTML:\n"""\n${conteudo.conteudoHtml}\n"""`,
    "",
    "Use a ferramenta para registrar o resultado. Se o rascunho for reprovado (score abaixo do mínimo OU algum dos três campos booleanos for false), o campo motivo é obrigatório e precisa conter, pra CADA problema real encontrado na revisão completa (não só o primeiro), tanto o diagnóstico específico (o que exatamente falhou) quanto uma sugestão concreta do que corrigir — não basta apontar o problema, aponte a correção. O texto será lido tanto por um Escritor automático quanto por um humano revisando manualmente. Depois de pesquisar o que for necessário (se for o caso), você DEVE terminar chamando a ferramenta registrar_revisao com o resultado final — nunca finalize a resposta só com texto.",
  ].join("\n");
}

type ResultadoBrutoFerramenta = {
  score: number;
  motivo?: string | null;
  precisao_factual_adequada: boolean;
  fontes_especificas: boolean;
  originalidade_adequada: boolean;
};

/**
 * Regra de aprovação multiplicativa (spec seção 3.1, "Regra de aprovação") — deliberadamente NÃO
 * é uma média nem soma ponderada: cada gate calibrável (`checar*`) que estiver ativo precisa ser
 * `true` E o score precisa bater o mínimo calibrado, todos ao mesmo tempo. Um score 95 com
 * `precisao_factual_adequada: false` reprova do mesmo jeito — é exatamente o problema que motivou
 * esta mudança (checklist ponderado conseguia "diluir" um problema factual/legal sério dentro de
 * uma média alta). Cada `checar*` ausente na propriedade é tratado como `true` (gate ativo por
 * padrão) — ver PropriedadeCarregada em tipos.ts.
 */
function calcularAprovacao(bruta: ResultadoBrutoFerramenta, propriedade: PropriedadeCarregada): boolean {
  const scoreMinimo = propriedade.scoreMinimoAprovacao ?? SCORE_MINIMO_APROVACAO_PADRAO;
  const checarPrecisaoFactual = propriedade.checarPrecisaoFactual ?? true;
  const checarFontesEspecificas = propriedade.checarFontesEspecificas ?? true;
  const checarOriginalidade = propriedade.checarOriginalidade ?? true;

  return (
    bruta.score >= scoreMinimo &&
    (!checarPrecisaoFactual || bruta.precisao_factual_adequada) &&
    (!checarFontesEspecificas || bruta.fontes_especificas) &&
    (!checarOriginalidade || bruta.originalidade_adequada)
  );
}

export async function revisarConteudo(
  conteudo: ConteudoGerado,
  checklist: ItemChecklistCarregado[],
  propriedade: PropriedadeCarregada,
  postsRecentes: PostRecenteResumo[],
  // numeroTentativa: 1 na primeira geração desta pauta, 2+ a partir da 1ª correção — pedido do
  // Luiz (19/08/2026), ver "Reprovação só por motivo real" em montarPrompt.
  numeroTentativa: number,
): Promise<{ resultado: ResultadoRevisao; usage: UsageTokens }> {
  const cliente = obterCliente();
  const prompt = montarPrompt(conteudo, checklist, propriedade, postsRecentes, numeroTentativa);

  const resposta = await cliente.messages.create({
    model: MODELO_REVISOR,
    // Histórico de truncamento real (19/08/2026, 2 ocorrências): 1000 (valor original da Fase 1)
    // estourava depois da Fase 4a (motivo passou a exigir diagnóstico + sugestão); 2000 (1º
    // aumento) estourou de novo depois do reforço de "revisão sistemática completa" (pedido do
    // Luiz — listar TODOS os problemas encontrados, não só os 1-2 primeiros, produz um motivo
    // ainda mais longo em posts com vários itens reprovados). As duas vezes o sintoma foi
    // idêntico: usage.outputTokens batendo EXATAMENTE no limite numa reprovação sem motivo nenhum
    // registrado — sinal de truncamento do tool_use, não de decisão do modelo. Margem generosa
    // desta vez porque o motivo tende a crescer, não encolher, à medida que o checklist ganha
    // itens. 8000 (era 4000) porque resultados de web_search agora também entram na conta — mesmo
    // raciocínio de escritor.ts, e mesmo teto real do SDK sem streaming (~21333, ver comentário em
    // escritor.ts) que 8000 fica bem longe de encostar.
    max_tokens: 8000,
    tools: [FERRAMENTA_REVISOR, FERRAMENTA_BUSCA_WEB],
    // tool_choice "auto" (não mais forçado em registrar_revisao) — pedido do Luiz, 19/08/2026:
    // precisa deixar o modelo livre pra chamar web_search (0 ou mais vezes) ANTES de finalizar com
    // registrar_revisao; forçar a ferramenta de saída de cara impediria qualquer busca.
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: prompt }],
  });

  // web_search (ferramenta SERVIDOR) aparece no content como blocos `server_tool_use` +
  // `web_search_tool_result`, tipos distintos de `tool_use` — o find abaixo já ignora esses blocos
  // sozinho (só bate com a invocação CLIENTE de registrar_revisao); `name` conferido também, por
  // clareza e como trava extra caso mais ferramentas entrem no futuro (mesmo padrão de escritor.ts).
  const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use" && b.name === "registrar_revisao");
  if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") {
    throw new Error("Revisor não retornou resultado estruturado.");
  }

  const bruta = blocoFerramenta.input as ResultadoBrutoFerramenta;
  const aprovado = calcularAprovacao(bruta, propriedade);

  // Achado real de produção (21/08/2026): uma reprovação sem `motivo` preenchido é inutilizável —
  // nem o Escritor nem um humano revisando manualmente sabem o que corrigir. O schema não pode
  // forçar `motivo` como obrigatório incondicionalmente (ele é null de propósito quando aprovado),
  // então isto já aconteceu antes por truncamento de tokens (ver comentário do max_tokens acima,
  // 2 ocorrências reais) e voltou a acontecer aqui sem truncamento nenhum — o modelo simplesmente
  // não preencheu. Trata os dois casos como falha TÉCNICA (lança, não retorna), mesmo padrão já
  // usado em escritor.ts pra "resposta truncada por limite de tokens": melhor perder esta
  // tentativa e deixar a próxima (ou o circuit breaker, se repetir) lidar com isso do que persistir
  // "Reprovado sem motivo detalhado." — uma reprovação de negócio fantasma, sem diagnóstico nenhum.
  if (!aprovado && !bruta.motivo) {
    const causa = resposta.stop_reason === "max_tokens" ? "resposta truncada por limite de tokens" : "campo 'motivo' não preenchido pelo modelo";
    throw new Error(`Revisor: reprovação sem motivo (${causa}).`);
  }

  return {
    resultado: {
      aprovado,
      score: bruta.score,
      motivo: aprovado ? null : bruta.motivo!,
      precisaoFactualAdequada: bruta.precisao_factual_adequada,
      fontesEspecificas: bruta.fontes_especificas,
      originalidadeAdequada: bruta.originalidade_adequada,
    },
    usage: {
      inputTokens: resposta.usage?.input_tokens ?? 0,
      outputTokens: resposta.usage?.output_tokens ?? 0,
    },
  };
}
