// Estágio 1 do pipeline — escolhe (ou cria) a próxima pauta a processar.
//
// Três caminhos, nesta ordem de prioridade (Fase 3, spec
// docs/superpowers/specs/2026-08-18-personas-ricas-geracao-por-persona-design.md seção 5):
//   1. Pauta "pendente" já na fila (comportamento original da Fase 1).
//   2. Pauta "em_producao" travada há mais de RECLAIM_MINUTOS — reclaim (Fase 1/núcleo, Task 10).
//      Os caminhos 1 e 2 são implementados inteiramente por `selecionarProximaPautaPendente`
//      (repositorio.ts) — este arquivo não decide entre eles, só consome o resultado. NENHUMA
//      lógica de persona roda quando um destes dois caminhos encontra uma pauta.
//   3. NOVO (Fase 3): nem pendente nem reclaim — sorteia uma persona ativa da propriedade e cria a
//      pauta a partir dela (com ângulo pronto do Bloco 11, ou via IA quando os prontos esgotam).
import "server-only";
import { gerarAngulo } from "./gerador-angulo";
import {
  carregarAngulosUsadosPorPersona,
  carregarPersona,
  criarPautaDePersona,
  listarPersonasAtivasComAngulosDisponiveis,
  marcarPautaEmProducao,
  selecionarProximaPautaPendente,
} from "./repositorio";
import type { FunilPauta, PautaCarregada, PersonaAtiva, TipoConteudo } from "./tipos";

/**
 * Sorteio ponderado "menos usada recentemente tem mais peso" (spec seção 5) — decisão de
 * implementação desta task: em vez de um sorteio probabilístico de verdade (pesos calculados a
 * partir da distância em dias desde `usadaPelaUltimaVezEm`, roleta ponderada), usa a versão
 * determinística mais simples que ainda satisfaz a intenção — ordena as candidatas por
 * `usadaPelaUltimaVezEm` ascendente (nunca usada = `null`, tratado como prioridade máxima, vem
 * primeiro) e pega a primeira. É o caso-limite de um sorteio ponderado onde o peso de quem nunca
 * foi usada tende a infinito: sempre vence. Preferida a uma implementação probabilística porque
 * (a) a spec não manda um algoritmo específico, só a intenção; (b) fica determinística e testável
 * sem precisar mockar Math.random(); (c) com o volume esperado (75 personas, sorteio a cada
 * poucos posts) o efeito prático — nunca deixar uma persona esquecida — é o mesmo que se buscava
 * com "peso maior pra quem foi menos usada". Comparação de string funciona porque ISO 8601 com a
 * mesma largura ordena lexicograficamente igual a cronologicamente (mesma premissa já usada em
 * listarPersonasAtivasComAngulosDisponiveis, repositorio.ts).
 */
function escolherPersonaMenosUsadaRecentemente(personas: PersonaAtiva[]): PersonaAtiva {
  return [...personas].sort((a, b) => {
    if (a.usadaPelaUltimaVezEm === b.usadaPelaUltimaVezEm) return 0;
    if (a.usadaPelaUltimaVezEm === null) return -1;
    if (b.usadaPelaUltimaVezEm === null) return 1;
    return a.usadaPelaUltimaVezEm < b.usadaPelaUltimaVezEm ? -1 : 1;
  })[0];
}

/** "Sorteio simples" (spec seção 5) do ângulo dentro dos `angulosProntos` de UMA persona já
 * escolhida — ao contrário da escolha de persona acima, aqui a spec não fala em ponderar por
 * nada, é uma escolha aleatória simples entre os ângulos disponíveis dela. */
function escolherAnguloAleatorio(angulosDisponiveis: string[]): string {
  return angulosDisponiveis[Math.floor(Math.random() * angulosDisponiveis.length)];
}

/**
 * Defaults do caminho "ângulo pronto" (sem IA) — heurística explicitamente deixada em aberto pela
 * spec (seção 9, "Pendências"), decidida nesta task:
 * - `funil: "meio"` — o ângulo pronto do Bloco 11 é conteúdo de atração/conscientização geral
 *   (ex.: uma citação de dor + explicação), não uma peça de conversão direta (fundo) nem
 *   institucional (topo); "meio" é o ponto médio mais seguro sem um sinal melhor pra decidir.
 * - `tipoConteudo: "post_padrao"` — o formato mais genérico do enum, mesmo tipo que o pipeline já
 *   publica hoje pra toda pauta manual da Fase 1; nenhuma informação estruturada disponível neste
 *   caminho (sem IA) sugere um formato mais específico (storytelling, página de serviço etc.).
 * Nenhum dos dois é lido de volta do banco por este caminho — são constantes fixas, não uma
 * config por propriedade (YAGNI: a Fase 1 também não tinha "default de propriedade" pra isso).
 */
const FUNIL_DEFAULT_ANGULO_PRONTO: FunilPauta = "meio";
const TIPO_CONTEUDO_DEFAULT_ANGULO_PRONTO: TipoConteudo = "post_padrao";

export async function selecionarPauta(matrizConteudoId: string, propriedadeId: string): Promise<PautaCarregada | null> {
  const pautaExistente = await selecionarProximaPautaPendente(matrizConteudoId);
  if (pautaExistente) {
    await marcarPautaEmProducao(pautaExistente.id);
    return pautaExistente;
  }

  // Terceiro caminho (Fase 3): nem pendente nem reclaim. `criarPautaDePersona` já grava a pauta
  // DIRETO em "em_producao" (repositorio.ts) — diferente do caminho acima, não há um segundo
  // passo de marcarPautaEmProducao aqui.
  const personasAtivas = await listarPersonasAtivasComAngulosDisponiveis(propriedadeId);
  if (personasAtivas.length === 0) return null; // nenhuma persona ativa ainda — nada a produzir.

  const personasComAnguloPronto = personasAtivas.filter((persona) => persona.angulosProntos.length > 0);

  if (personasComAnguloPronto.length > 0) {
    // Sub-caso A: ao menos uma persona ativa ainda tem ângulo pronto do Bloco 11 — zero custo de
    // IA nesta etapa.
    const persona = escolherPersonaMenosUsadaRecentemente(personasComAnguloPronto);
    const angulo = escolherAnguloAleatorio(persona.angulosProntos);
    return criarPautaDePersona({
      matrizConteudoId,
      personaId: persona.id,
      angulo,
      palavraChavePrincipal: persona.dorEntrada,
      palavrasSecundarias: [],
      funil: FUNIL_DEFAULT_ANGULO_PRONTO,
      tipoConteudo: TIPO_CONTEUDO_DEFAULT_ANGULO_PRONTO,
    });
  }

  // Sub-caso B: TODAS as personas ativas esgotaram os ângulos prontos — fallback de IA (Gerador
  // de Ângulo, Task 3), com os ângulos já usados por essa persona (prontos + gerados por IA em
  // ciclos anteriores) pra nunca repetir.
  const personaEscolhida = escolherPersonaMenosUsadaRecentemente(personasAtivas);
  const [angulosUsados, personaCompleta] = await Promise.all([
    carregarAngulosUsadosPorPersona(personaEscolhida.id),
    carregarPersona(personaEscolhida.id),
  ]);
  const { resultado } = await gerarAngulo(personaCompleta, angulosUsados);

  return criarPautaDePersona({
    matrizConteudoId,
    personaId: personaEscolhida.id,
    angulo: resultado.anguloTexto,
    palavraChavePrincipal: resultado.palavraChavePrincipal,
    palavrasSecundarias: resultado.palavrasSecundarias,
    funil: resultado.funil,
    tipoConteudo: resultado.tipoConteudo,
  });
}
