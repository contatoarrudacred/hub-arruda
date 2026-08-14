// Extração determinística de dados que o lead já deu de cara na primeira mensagem (regra de
// "checkpoint já respondido" — SCRIPT_LIMPANOME_SERASA_SPC.md, premissas gerais: "o fluxo não pode
// assumir estado zero sempre — precisa checar o que o lead já informou de cara"). Cobre os padrões
// mais comuns com regex (camada 1 da estratégia de custo de IA, PLANO_MESTRE seção 2.1); quando não
// reconhece nada, o checkpoint correspondente simplesmente pergunta normalmente — e, se a etapa
// tiver `interpretacao_ia` habilitada, cai pra IA na hora certa (Fase 5, ainda não ligada).

import type { DadosConversa } from "./tipos";

const PADROES_NOME = [
  /\bsou\s+([A-ZÀ-Ý][\wà-ÿ]*(?:\s+[A-ZÀ-Ý][\wà-ÿ]*){0,3})/,
  /\bme\s+chamo\s+([A-ZÀ-Ý][\wà-ÿ]*(?:\s+[A-ZÀ-Ý][\wà-ÿ]*){0,3})/,
  /\bmeu\s+nome\s+[ée]\s+([A-ZÀ-Ý][\wà-ÿ]*(?:\s+[A-ZÀ-Ý][\wà-ÿ]*){0,3})/,
  /\baqui\s+[ée]\s+(?:o|a)?\s*([A-ZÀ-Ý][\wà-ÿ]*(?:\s+[A-ZÀ-Ý][\wà-ÿ]*){0,3})/,
];

/** Tenta achar um nome próprio depois de frases de auto-apresentação comuns ("sou X", "meu nome é X"...). */
export function extrairNomeSaudacao(mensagem: string): string | null {
  for (const padrao of PADROES_NOME) {
    const encontrado = mensagem.match(padrao);
    if (encontrado?.[1]) return encontrado[1].trim();
  }
  return null;
}

export function extrairDadosAbertura(mensagem: string): DadosConversa {
  const dados: DadosConversa = {};
  const nome = extrairNomeSaudacao(mensagem);
  if (nome) dados.nome = nome;
  return dados;
}
