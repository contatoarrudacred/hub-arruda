// Parser determinístico — primeira camada da estratégia de custo de IA (PLANO_MESTRE seção 2.1):
// regex/matching de texto antes de qualquer chamada de IA; só cai pra IA (Fase 5) quando isto
// não reconhece a resposta.

import type { ConteudoEtapa, Opcao } from "./tipos";

export type ResultadoParse =
  | { reconhecido: true; valor: string; opcaoEscolhida?: Opcao }
  | { reconhecido: false };

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // remove acentos
}

const AFIRMATIVOS = ["sim", "s", "yes", "quero", "pode", "positivo", "bora", "vamos"];
const NEGATIVOS = ["nao", "n", "no", "negativo", "agora nao", "depois"];

function parseSimNao(resposta: string): ResultadoParse {
  const norm = normalizar(resposta);
  if (AFIRMATIVOS.some((a) => norm === a || norm.startsWith(a + " "))) {
    return { reconhecido: true, valor: "sim" };
  }
  if (NEGATIVOS.some((n) => norm === n || norm.startsWith(n + " "))) {
    return { reconhecido: true, valor: "nao" };
  }
  return { reconhecido: false };
}

function parseMenu(resposta: string, opcoes: Opcao[]): ResultadoParse {
  const norm = normalizar(resposta);
  for (const opcao of opcoes) {
    for (const rotulo of opcao.rotulos) {
      if (normalizar(rotulo) === norm) {
        return { reconhecido: true, valor: opcao.valor, opcaoEscolhida: opcao };
      }
    }
  }
  return { reconhecido: false };
}

function parseEmail(resposta: string): ResultadoParse {
  const texto = resposta.trim();
  const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto);
  return valido ? { reconhecido: true, valor: texto } : { reconhecido: false };
}

/** Aceita um valor numérico livre ("10 mil", "5000", "R$ 8.500") ou "não sei". */
function parseNumeroOuNaoSei(resposta: string): ResultadoParse {
  const norm = normalizar(resposta);
  if (["nao sei", "n sei", "nao tenho certeza", "ns"].some((v) => norm.includes(v))) {
    return { reconhecido: true, valor: "nao_sei" };
  }

  const semSimbolos = resposta.replace(/[Rr]\$/g, "").trim();
  const temMil = /mil/i.test(semSimbolos);
  // Precisa começar por um dígito — sem isso, uma resposta tipo "bom, uns 10 mil" casava a vírgula
  // antes de chegar no número de verdade (mesmo achado real de extrairValorMencionadoNaAbertura,
  // fluxo-limpeza-nome.ts, 17/08/2026).
  const numeroMatch = semSimbolos.match(/\d[\d.,]*/);
  if (!numeroMatch) return { reconhecido: false };

  let numero = Number(numeroMatch[0].replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(numero)) return { reconhecido: false };
  if (temMil) numero *= 1000;

  return { reconhecido: true, valor: String(numero) };
}

function parseTextoLivre(resposta: string): ResultadoParse {
  const texto = resposta.trim();
  if (texto.length === 0) return { reconhecido: false };
  return { reconhecido: true, valor: texto };
}

export function parseResposta(conteudo: ConteudoEtapa, respostaLead: string): ResultadoParse {
  switch (conteudo.tipo_resposta) {
    case "sim_nao":
      // sim_nao pode ou não ter `opcoes` mapeando sim/nao para próximos códigos distintos
      if (conteudo.opcoes && conteudo.opcoes.length > 0) {
        return parseMenu(respostaLead, conteudo.opcoes);
      }
      return parseSimNao(respostaLead);
    case "menu":
      return parseMenu(respostaLead, conteudo.opcoes ?? []);
    case "email":
      return parseEmail(respostaLead);
    case "numero_ou_nao_sei":
      return parseNumeroOuNaoSei(respostaLead);
    case "texto_livre":
    default:
      return parseTextoLivre(respostaLead);
  }
}
