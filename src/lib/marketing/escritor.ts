// src/lib/marketing/escritor.ts
// Estágio 1 (parte 2) do pipeline — gera o rascunho completo seguindo o checklist da propriedade.
// Mesmo padrão de cliente/ferramenta de src/lib/motor-fluxo/interpretacao-ia.ts, modelo Sonnet
// porque qualidade de escrita é crítica (diferente da classificação simples que usa Haiku).

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ConteudoGerado, ItemChecklistCarregado, PautaCarregada, PersonaCarregada, PropriedadeCarregada, UsageTokens } from "./tipos";

const MODELO_ESCRITOR = "claude-sonnet-5";

let clienteSingleton: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!clienteSingleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    clienteSingleton = new Anthropic({ apiKey });
  }
  return clienteSingleton;
}

const FERRAMENTA_ESCRITOR = {
  name: "registrar_conteudo",
  description: "Registra o rascunho completo do post gerado.",
  input_schema: {
    type: "object" as const,
    properties: {
      titulo: { type: "string", description: "Título do post (vira o H1)." },
      conteudo_html: { type: "string", description: "Corpo completo do post em HTML, incluindo headings, FAQ com Schema FAQPage embutido em JSON-LD, e CTA." },
      meta_title: { type: "string", description: "50-60 caracteres, contém a palavra-chave principal." },
      meta_description: { type: "string", description: "130-155 caracteres, contém CTA." },
      slug: { type: "string", description: "Slug em kebab-case, sem acentos, derivado da palavra-chave principal." },
      relatorio: {
        type: "string",
        description:
          "Relatório do que foi feito nesta chamada, para o humano (ou o próprio Revisor na próxima rodada) cruzar com o motivo da reprovação. NUMA CORREÇÃO (existe 'Motivo da reprovação' abaixo): liste CADA apontamento do motivo, na mesma ordem/numeração dele, e para cada um diga exatamente o que foi mudado no HTML/campos para resolvê-lo (ex.: '1) Link do Procon: troquei a URL genérica por https://... conforme sugerido pelo Revisor.'). NUMA PRIMEIRA GERAÇÃO (sem motivo anterior): resuma as principais decisões tomadas — ângulo seguido, fontes externas escolhidas e por quê, estrutura das seções e do FAQ.",
      },
    },
    required: ["titulo", "conteudo_html", "meta_title", "meta_description", "slug", "relatorio"],
  },
};

// Ferramenta de busca na internet nativa da Anthropic (19/08/2026, pedido do Luiz) — server-side:
// a Anthropic executa a busca e injeta o resultado na mesma resposta, sem round-trip nosso. Achado
// real de teste em produção que motivou isto: o Escritor não tinha nenhum jeito de verificar se uma
// URL "mais específica" pedida pelo Revisor existia de verdade — sem ferramenta de busca, ele só
// adivinhava um caminho plausível (às vezes uma URL quebrada, ex.: "bcb.gov.br/.../supervisaosupervisao").
// max_uses limita o número de buscas POR CHAMADA (custo/latência previsíveis) — 6 dá folga pra
// verificar os 2-3 links externos que o checklist pede, mesmo com alguma tentativa e erro.
const FERRAMENTA_BUSCA_WEB = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  max_uses: 6,
};

function montarPrompt(
  pauta: PautaCarregada,
  checklist: ItemChecklistCarregado[],
  persona: PersonaCarregada | null,
  propriedade: PropriedadeCarregada,
): string {
  const linhasChecklist = checklist.map((c) => `- ${c.item}`).join("\n");
  const linhas = [
    "Você é o Agente Escritor de um pipeline de geração de conteúdo para blog, otimizado tanto para SEO tradicional quanto para citação por IAs (AEO/GEO).",
    "",
    `Palavra-chave principal: ${pauta.palavraChavePrincipal}`,
    pauta.palavrasSecundarias.length ? `Palavras secundárias: ${pauta.palavrasSecundarias.join(", ")}` : "",
    `Ângulo: ${pauta.angulo}`,
    pauta.geografia ? `Geografia: ${pauta.geografia}` : "",
    `Funil: ${pauta.funil}`,
    `Formato: ${pauta.tipoConteudo}`,
    "",
    "Checklist de qualidade obrigatório — todo item precisa ser atendido:",
    linhasChecklist,
    "",
    // Achado real de teste em produção (19/08/2026, pedido do Luiz): o post publicado mostrava o
    // título duplicado — uma vez pelo campo `titulo` (que o WordPress renderiza automaticamente
    // como H1 da página) e outra vez pelo <h1>título</h1> que o Escritor escreve como primeira
    // linha de conteudo_html pra satisfazer o item de checklist "H1 com a palavra-chave principal".
    // Decisão deliberada (não é bug — 19/08/2026, decisão do Luiz): manter a duplicação AQUI, no
    // texto gerado, porque é o jeito mais confiável do Revisor confirmar de verdade que o H1 tem a
    // palavra-chave (checar uma tag literal é mais robusto que confiar no modelo "lembrar" de uma
    // instrução negativa "nunca faça X"). Quem garante que a página publicada nunca mostra os dois
    // títulos é o sanitizador (sanitizarConteudoHtml, sanitizar-html.ts), que remove o <h1> do corpo
    // por completo — tag E texto — bem antes de qualquer coisa chegar ao WordPress. Ver comentário
    // de cabeçalho de sanitizar-html.ts pro raciocínio completo.
    // Achado real de teste em produção (19/08/2026): esta linha tinha "40-60 palavras" fixo,
    // duplicando (e travando) o número que já vem do item do checklist ("Resposta direta e
    // extraível (N-M palavras) logo abaixo de cada H2", editável na tela Checklist de QA) —
    // editar o item no banco não tinha efeito nenhum no Escritor, que continuava recebendo o
    // número antigo hardcoded aqui. Removido o número: a contagem exata é responsabilidade do
    // item do checklist (linhasChecklist acima), esta linha só explica a TÉCNICA em si.
    "Regra adicional de citabilidade por IA: logo abaixo de cada H2, inclua uma resposta direta e extraível (contagem de palavras exata definida no item do checklist acima) antes de aprofundar — é a técnica mais concreta para aumentar a chance de citação por ChatGPT/Perplexity/Gemini.",
    "",
    // Achado do teste de ponta a ponta em produção (19/08/2026): ao ser cobrado por "fonte
    // específica" (seja na primeira geração ou numa correção), o Escritor às vezes inventa um
    // número de lei/resolução/artigo plausível em vez de citar algo mais genérico mas correto —
    // isso é uma alucinação factual grave em conteúdo YMYL (financeiro), pior do que a fonte
    // genérica que a instrução tentava evitar. Regra explícita para fechar esse gap.
    "Regra de precisão em citação normativa: ao citar lei, resolução, artigo ou norma específica, só inclua número/ano depois de confirmar por busca (ver regra dura abaixo) — NUNCA invente ou chute um número de lei/resolução/artigo/súmula que pareça plausível, isso é uma alucinação factual grave (achado real de teste em produção: uma citação atribuiu incorretamente um prazo à \"Súmula 548 do STJ\", que trata de assunto diferente).",
    "",
    // Achado real de teste em produção (19/08/2026, pedido do Luiz): sem uma forma de verificar
    // URLs de verdade, o Escritor adivinhava um caminho "específico" plausível pro link pedido pelo
    // Revisor — às vezes inventando uma URL quebrada (achado real: um link do BACEN saiu com o
    // caminho duplicado, "supervisaosupervisao"). A ferramenta web_search agora disponível resolve
    // isso na origem, em vez de só reagir depois via checagem HTTP (ver etapa "verificar_links",
    // processar-pauta.ts). Técnica de busca por CONTEXTO específica (19/08/2026, pedido do Luiz):
    // buscar só o nome do órgão (ex.: "BACEN") tende a cair numa homepage genérica; buscar a
    // AFIRMAÇÃO específica do parágrafo tende a cair direto na página que sustenta essa afirmação —
    // exemplo real dado pelo Luiz: parágrafo cita "Serasa informa mais de 83 milhões de
    // brasileiros negativados" → a busca certa é "quantos negativados tem no Brasil de acordo com
    // o Serasa?" (não só "Serasa"), o que leva à página exata do mapa da inadimplência, em vez da
    // homepage do Serasa.
    'Regra de verificação de links: para CADA link externo que for incluir no HTML, use a ferramenta web_search pra confirmar que a URL existe de verdade e que a página encontrada realmente sustenta a afirmação do texto — nunca invente ou chute uma URL só porque parece plausível. TÉCNICA DE BUSCA: formule a busca em torno da AFIRMAÇÃO ESPECÍFICA do parágrafo onde o link vai entrar, não só o nome do órgão — isso leva direto à página que sustenta aquela afirmação, em vez de uma homepage genérica. Exemplo: se o parágrafo diz "...Serasa informa mais de 83 milhões de brasileiros negativados...", a busca certa é algo como "quantos negativados tem no Brasil de acordo com o Serasa?" (a pergunta que a própria frase responde), não apenas "Serasa" — o resultado ideal é a página específica que traz esse dado (ex.: https://www.serasa.com.br/limpa-nome-online/blog/mapa-da-inadimplencia-e-renegociacao-de-dividas-no-brasil/), não a homepage do Serasa. A mesma técnica vale pra citação de lei/norma/jurisprudência: antes de citar um número de súmula, resolução ou artigo, busque o texto EXATO da afirmação (ex.: "prazo para baixa de negativação após pagamento súmula STJ") pra confirmar que a norma citada realmente trata desse tema — não assuma que um número que "parece certo" está certo. Depois de pesquisar o que for necessário, você DEVE terminar chamando a ferramenta registrar_conteudo com o resultado final — nunca finalize a resposta só com texto.',
    "",
    // REGRA DURA pedida explicitamente pelo Luiz (19/08/2026), em cima do achado real da "Súmula
    // 548" (citação jurídica inventada que bloqueou uma pauta inteira após 6 tentativas). Consolida
    // e reforça as duas regras acima (precisão normativa + verificação de links) numa única
    // instrução inegociável: NENHUMA citação de fato sem link de comprovação, sem exceção — fecha
    // de vez a "saída" que a regra antiga dava de citar algo genérico sem precisar linkar nada.
    "REGRA DURA — nunca inventar, sempre comprovar com link: você NUNCA pode inventar um fato, número, estatística, data, prazo, citação legal/normativa ou afirmação atribuída a um órgão/entidade externa. Toda vez que o texto citar algo como fato — um dado numérico (\"a Serasa aponta X milhões de negativados\"), uma norma (\"conforme o art. Y do CDC\"), uma jurisprudência (\"segundo a Súmula Z do STJ\"), um prazo, ou qualquer afirmação atribuída a uma fonte externa —, essa frase É OBRIGATÓRIA de vir acompanhada de um link pra uma fonte oficial que comprove EXATAMENTE essa afirmação (busque por ela usando a técnica de busca por afirmação específica, acima, ANTES de escrever a frase — nunca depois). Se a busca não encontrar uma fonte oficial que comprove a afirmação específica, você NÃO PODE fazer essa afirmação: reescreva sem o dado/citação específica, ou remova o trecho inteiro. Não existe exceção nem meio-termo — nem um número que 'parece certo', nem uma norma 'que geralmente é essa', nem uma estatística lembrada de memória: toda citação de fato precisa ter uma fonte oficial linkada comprovando ela, sempre, sem exceção.",
    "",
    // REGRA DURA pedida explicitamente pelo Luiz (19/08/2026): a âncora dos links externos estava
    // saindo como a frase inteira (ex.: toda a oração "a Serasa informa mais de 83 milhões de
    // brasileiros negativados" virando um <a>), o que é ruim pra leitura (bloco de texto azul
    // grande, sem indicar qual termo específico está sendo linkado) e pra SEO/AEO (âncora ideal é
    // curta e descritiva do destino, não a frase toda).
    'REGRA DURA — âncora do link curta (1 a 3 palavras): ao inserir um link externo, a âncora (o texto dentro de <a>...</a>, o trecho que fica clicável/sublinhado) deve ser uma palavra-chave curta — no máximo 1 a 3 palavras, o termo específico que está sendo linkado — NUNCA a frase inteira nem um trecho longo. O resto da frase fica como texto normal, fora do <a>. Exemplo ERRADO: <a href="...">a Serasa informa mais de 83 milhões de brasileiros negativados</a>. Exemplo CERTO: a Serasa informa mais de 83 milhões de brasileiros negativados, segundo o <a href="...">mapa da inadimplência</a> — ou: segundo o <a href="...">Registrato do Banco Central</a>, é possível consultar todas as dívidas em aberto. A âncora deve nomear a FONTE ou o DOCUMENTO específico (ex.: "mapa da inadimplência", "Registrato", "art. 43 do CDC", "Súmula 548"), não repetir o dado ou a afirmação inteira.',
    "",
    // Fase 3 (personas ricas), Task 5, spec seção 7 — adição aditiva: só entra no prompt quando a
    // pauta nasceu de uma persona sorteada (pauta.personaId não nulo, ver processar-pauta.ts);
    // pautas antigas/manuais (persona null) mantêm o prompt idêntico ao de antes desta task, sem
    // este bloco — nenhuma outra linha acima foi reordenada ou alterada.
    persona ? `Persona deste post — escreva na voz/vocabulário dela, respeitando o que ela não quer ouvir:\n${persona.conteudoCompleto}` : "",
    "",
    // Achado do teste real de ponta a ponta da Fase 3 (19/08/2026): motivoUltimaReprovacao já
    // existia em PautaCarregada desde o núcleo (Task 10), mas nunca era lido aqui — cada retry
    // regenerava o texto às cegas, sem saber o que o Revisor apontou na tentativa anterior (na
    // prática, o texto chegou a sair PIOR na tentativa seguinte, não melhor). Correção em duas
    // camadas: se existe um rascunho anterior salvo (ultimoRascunho, gravado por salvarRascunho em
    // processar-pauta.ts a cada geração), pede REVISÃO desse texto específico em vez de reescrita —
    // mantém o que já está bom, corrige só o que falhou. Sem rascunho salvo (pauta antiga de antes
    // desta coluna existir, ou caso raro em que a geração anterior falhou antes de salvar), cai no
    // texto só-com-motivo de antes. Sem motivo nenhum (primeira tentativa), nenhum bloco — prompt
    // idêntico ao de antes desta correção.
    pauta.motivoUltimaReprovacao && pauta.ultimoRascunho
      ? [
          "Esta é uma revisão — a versão anterior deste post foi reprovada pelo Revisor pelo motivo abaixo. Sua tarefa é uma EDIÇÃO CIRÚRGICA, não uma reescrita: o motivo abaixo lista os problemas específicos encontrados (pode ser 1 frase, 1 link, 1 número de caracteres do meta title) — mude EXATAMENTE isso e nada além disso. Todo o resto do HTML anterior (frases, links, exemplos, ordem, formatação) deve permanecer IDÊNTICO ao da versão anterior, mesmo que você ache que poderia escrever melhor. Reescrever mais do que o apontado já causou regressão real neste pipeline: numa correção anterior, ao trocar um link só porque era 'genérico demais', o Escritor substituiu por outro link que introduziu um erro factual novo que não existia antes — não repita esse padrão. Se o motivo aponta 2 problemas pontuais, a saída deve divergir do HTML anterior em no máximo essas 2 passagens.",
          "",
          // Achado real de teste em produção (19/08/2026, pedido do Luiz): o motivo do Revisor
          // costuma vir bem completo, item por item, cada um já com uma sugestão concreta do que
          // fazer — mas sem um processo explícito de correção, o Escritor às vezes resolve 1-2
          // apontamentos e deixa outro passar batido, ou resolve um apontamento de um jeito
          // diferente do sugerido (o que já causou regressão, ver parágrafo acima). Processo
          // explícito de correção item a item, igual ao que o Revisor já usa pra encontrar os
          // problemas (ver "Revisão sistemática obrigatória" em revisor.ts).
          "Processo de correção item a item: o motivo abaixo já está organizado por apontamento (numerado ou em parágrafos separados), cada um com um diagnóstico e uma sugestão concreta de correção. Percorra o motivo apontamento por apontamento, do primeiro ao último: para cada um, localize a passagem exata correspondente no HTML da versão anterior (linha a linha, se necessário) e aplique a correção seguindo a sugestão já dada pelo Revisor — não invente uma solução diferente da sugerida nem pule para o próximo apontamento antes de resolver o atual. Só depois de ter percorrido TODOS os apontamentos do motivo é que a edição está completa; um apontamento resolvido e outro esquecido produz uma nova reprovação evitável.",
          "",
          `Motivo da reprovação: ${pauta.motivoUltimaReprovacao}`,
          "",
          // Os quatro campos da versão anterior — não só título/HTML — porque o Revisor avalia
          // meta_title/meta_description junto do resto (revisor.ts monta o prompt dele com os
          // quatro campos do ConteudoGerado); uma reprovação por "meta title longo demais" sem o
          // meta title anterior aqui obrigaria o Escritor a adivinhar o valor problemático em vez
          // de editá-lo (achado da revisão desta mesma task).
          `Título da versão anterior: ${pauta.ultimoRascunho.titulo}`,
          `Meta title da versão anterior: ${pauta.ultimoRascunho.metaTitle}`,
          `Meta description da versão anterior: ${pauta.ultimoRascunho.metaDescription}`,
          `Slug da versão anterior: ${pauta.ultimoRascunho.slug}`,
          `HTML da versão anterior:\n"""\n${pauta.ultimoRascunho.conteudoHtml}\n"""`,
        ].join("\n")
      : pauta.motivoUltimaReprovacao
        ? `Esta é uma nova tentativa — a versão anterior deste post foi reprovada pelo Revisor pelo seguinte motivo, e esta versão precisa corrigir especificamente isso:\n${pauta.motivoUltimaReprovacao}`
        : "",
    "",
    // Fase 4a, Task 4, spec seção 3.1.2 — instruções adicionais cadastradas por propriedade
    // (config_pipeline.instrucoes_adicionais, ver repositorio.ts), aditivo igual aos blocos de
    // persona/motivo acima: propriedade sem instrução extra cadastrada (undefined/"") não adiciona
    // bloco nenhum, prompt sai idêntico ao de antes desta task.
    propriedade.instrucoesAdicionais ? `Instruções adicionais desta propriedade — siga além de tudo já pedido acima:\n${propriedade.instrucoesAdicionais}` : "",
    "",
    "Use a ferramenta para registrar o resultado.",
  ];
  return linhas.filter(Boolean).join("\n");
}

export async function gerarConteudo(
  pauta: PautaCarregada,
  checklist: ItemChecklistCarregado[],
  persona: PersonaCarregada | null,
  propriedade: PropriedadeCarregada,
): Promise<{ resultado: ConteudoGerado; usage: UsageTokens }> {
  const cliente = obterCliente();
  const prompt = montarPrompt(pauta, checklist, persona, propriedade);

  const resposta = await cliente.messages.create({
    model: MODELO_ESCRITOR,
    // Um artigo de 1800+ palavras em HTML com FAQ+JSON-LD gira em torno de 6-7600 tokens de saída
    // na prática (medido em produção); com resultados de web_search também entrando na conta,
    // 20000 dá bastante folga extra (era 16000 antes da busca existir). Mesmo assim checamos
    // stop_reason abaixo — nunca seguir com dado truncado. TETO REAL do SDK sem streaming: acima
    // de ~21333 (fórmula do próprio SDK, ver `_calculateNonstreamingTimeout` em
    // node_modules/@anthropic-ai/sdk/client.js) a chamada lança "Streaming is required..." —
    // achado real de teste em produção (19/08/2026): 24000 estourava esse teto na hora, antes
    // mesmo de qualquer token ser gerado. Se um dia precisar de mais que isso, a resposta certa é
    // migrar pra streaming (cliente.messages.stream(...).finalMessage()), não só subir o número.
    max_tokens: 20000,
    tools: [FERRAMENTA_ESCRITOR, FERRAMENTA_BUSCA_WEB],
    // tool_choice "auto" (não mais forçado em registrar_conteudo) — pedido do Luiz, 19/08/2026:
    // precisa deixar o modelo livre pra chamar web_search (0 ou mais vezes) ANTES de finalizar com
    // registrar_conteudo; forçar a ferramenta de saída de cara impediria qualquer busca.
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: prompt }],
  });

  if (resposta.stop_reason === "max_tokens") {
    throw new Error("Escritor: resposta truncada por limite de tokens.");
  }

  // web_search (ferramenta SERVIDOR) aparece no content como blocos `server_tool_use` +
  // `web_search_tool_result`, tipos distintos de `tool_use` — o find abaixo já ignora esses blocos
  // sozinho (só bate com a invocação CLIENTE de registrar_conteudo); `name` conferido também, por
  // clareza e como trava extra caso mais ferramentas entrem no futuro.
  const blocoFerramenta = resposta.content.find((b) => b.type === "tool_use" && b.name === "registrar_conteudo");
  if (!blocoFerramenta || blocoFerramenta.type !== "tool_use") {
    throw new Error("Escritor não retornou conteúdo estruturado.");
  }

  const bruta = blocoFerramenta.input as {
    titulo: string;
    conteudo_html: string;
    meta_title: string;
    meta_description: string;
    slug: string;
    relatorio: string;
  };

  const camposObrigatorios: Array<keyof typeof bruta> = ["titulo", "conteudo_html", "meta_title", "meta_description", "slug", "relatorio"];
  for (const campo of camposObrigatorios) {
    if (typeof bruta[campo] !== "string" || bruta[campo].trim() === "") {
      throw new Error(`Escritor: campo obrigatório "${campo}" ausente ou vazio na resposta.`);
    }
  }

  return {
    resultado: {
      titulo: bruta.titulo,
      conteudoHtml: bruta.conteudo_html,
      metaTitle: bruta.meta_title,
      metaDescription: bruta.meta_description,
      slug: bruta.slug,
      relatorio: bruta.relatorio,
    },
    usage: {
      inputTokens: resposta.usage?.input_tokens ?? 0,
      outputTokens: resposta.usage?.output_tokens ?? 0,
    },
  };
}
