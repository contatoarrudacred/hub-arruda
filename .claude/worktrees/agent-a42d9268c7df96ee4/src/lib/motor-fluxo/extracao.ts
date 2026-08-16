// Extração determinística de dados que o lead já deu de cara na primeira mensagem (regra de
// "checkpoint já respondido" — SCRIPT_LIMPANOME_SERASA_SPC.md, premissas gerais: "o fluxo não pode
// assumir estado zero sempre — precisa checar o que o lead já informou de cara"). Cobre os padrões
// mais comuns com regex (camada 1 da estratégia de custo de IA, PLANO_MESTRE seção 2.1); quando não
// reconhece nada, o checkpoint correspondente simplesmente pergunta normalmente — e, se a etapa
// tiver `interpretacao_ia` habilitada, cai pra IA na hora certa (Fase 5, ainda não ligada).

import type { DadosConversa } from "./tipos";

// A primeira palavra do nome agora aceita minúscula (14/08/2026) — no WhatsApp real quase ninguém
// capitaliza ("sou luiz", não "sou Luiz"). Achado por Luiz testando o simulador (15/08/2026):
// "sou luiz, boa tarde!" não batia em nenhum padrão, caía no fallback ingênuo (primeira palavra da
// resposta crua = "sou") e virava "[Primeiro_Nome]".
//
// As palavras SEGUINTES do nome (pra compostos tipo "Luiz Silva") continuam exigindo maiúscula de
// propósito — é o único jeito de saber, só com regex, onde o nome termina e a frase continua. Sem
// essa exigência, "sou luiz e quero limpar meu nome" capturaria "luiz e quero limpar" inteiro (bug
// reproduzido ao tentar deixar tudo case-insensitive). Efeito colateral aceito: nome composto todo
// em minúsculo ("meu nome é luiz silva") só captura o primeiro nome — melhor capturar de menos do
// que capturar errado.
const PADROES_NOME = [
  /\b[Ss]ou\s+([A-Za-zÀ-ÿ][\wà-ÿ]*(?:\s+[A-ZÀ-Ý][\wà-ÿ]*){0,3})/,
  /\b[Mm]e\s+[Cc]hamo\s+([A-Za-zÀ-ÿ][\wà-ÿ]*(?:\s+[A-ZÀ-Ý][\wà-ÿ]*){0,3})/,
  /\b[Mm]eu\s+[Nn]ome\s+[ée]\s+([A-Za-zÀ-ÿ][\wà-ÿ]*(?:\s+[A-ZÀ-Ý][\wà-ÿ]*){0,3})/,
  /\b[Aa]qui\s+[ée]\s+(?:o|a)?\s*([A-Za-zÀ-ÿ][\wà-ÿ]*(?:\s+[A-ZÀ-Ý][\wà-ÿ]*){0,3})/,
];

// Conectores de nome composto que ficam em minúscula, exceto quando são a primeira palavra
// (ex.: "Luiz da Silva", não "Luiz Da Silva").
const CONECTORES_NOME = new Set(["de", "da", "do", "das", "dos", "e"]);

// Respostas cumprimento/preenchimento comuns a "Com quem eu falo?" que NÃO são o nome do lead
// (achado real, 16/08/2026: lead respondeu só "oi" e o fallback ingênuo virou nome "Oi", produzindo
// "Oi Oi, bom dia!" na mensagem seguinte). Sem IA (Fase 5) pra desambiguar, a saída seguinte é
// tratar como não reconhecido e repetir a pergunta — melhor que aceitar um nome claramente errado.
const RESPOSTAS_NAO_SAO_NOME = new Set([
  "oi",
  "oii",
  "oiii",
  "oie",
  "olá",
  "ola",
  "opa",
  "eae",
  "e ai",
  "eai",
  "alo",
  "alô",
  "bom dia",
  "boa tarde",
  "boa noite",
]);

function capitalizarNome(nome: string): string {
  return nome
    .split(/\s+/)
    .map((palavra, indice) => {
      const minuscula = palavra.toLowerCase();
      if (indice > 0 && CONECTORES_NOME.has(minuscula)) return minuscula;
      return minuscula.charAt(0).toUpperCase() + minuscula.slice(1);
    })
    .join(" ");
}

/** Tenta achar um nome próprio depois de frases de auto-apresentação comuns ("sou X", "meu nome é X"...). */
export function extrairNomeSaudacao(mensagem: string): string | null {
  for (const padrao of PADROES_NOME) {
    const encontrado = mensagem.match(padrao);
    if (encontrado?.[1]) return capitalizarNome(encontrado[1].trim());
  }
  return null;
}

/**
 * Extrai o nome de uma resposta DIRETA à pergunta "Com quem eu falo?" (não a mensagem de abertura
 * espontânea, que usa `extrairNomeSaudacao` acima). Tenta os mesmos padrões de auto-apresentação
 * primeiro ("sou Luiz, boa tarde!" → "Luiz") — se o lead respondeu só o nome puro, sem nenhuma
 * frase de apresentação ("Luiz"), cai no fallback de usar a resposta inteira. Retorna `null` quando
 * a resposta é só um cumprimento/preenchimento (ver RESPOSTAS_NAO_SAO_NOME) — quem chama trata como
 * não reconhecido e repete a pergunta, em vez de aceitar "Oi" como nome.
 */
export function extrairNomeDeResposta(resposta: string): string | null {
  const viaPadrao = extrairNomeSaudacao(resposta);
  if (viaPadrao) return viaPadrao;
  const bruta = resposta.trim();
  // Ignora pontuação de fim de frase ("Olá!!", "Oi.", "bom dia?") na comparação com o filtro —
  // achado real (16/08/2026): "Olá!!" não batia com "olá" no Set e virava nome "Olá!!".
  const semPontuacaoFinal = bruta.toLowerCase().replace(/[!?.,;]+$/, "").trim();
  if (RESPOSTAS_NAO_SAO_NOME.has(semPontuacaoFinal)) return null;
  return capitalizarNome(bruta);
}

export function extrairDadosAbertura(mensagem: string): DadosConversa {
  const dados: DadosConversa = {};
  const nome = extrairNomeSaudacao(mensagem);
  if (nome) dados.nome = nome;
  return dados;
}
