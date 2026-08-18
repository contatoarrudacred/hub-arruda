const UNIDADES = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = [
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];
const ESCALAS = [
  { singular: "", plural: "" },
  { singular: "mil", plural: "mil" },
  { singular: "milhão", plural: "milhões" },
  { singular: "bilhão", plural: "bilhões" },
];
const ESCALAS_QUE_USAM_DE = /(milhão|milhões|bilhão|bilhões)$/;

function centenaPorExtenso(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";

  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];

  if (centena > 0) partes.push(CENTENAS[centena]);

  if (resto > 0) {
    if (resto < 10) partes.push(UNIDADES[resto]);
    else if (resto < 20) partes.push(DEZ_A_DEZENOVE[resto - 10]);
    else {
      const dezena = Math.floor(resto / 10);
      const unidade = resto % 10;
      partes.push(unidade === 0 ? DEZENAS[dezena] : `${DEZENAS[dezena]} e ${UNIDADES[unidade]}`);
    }
  }

  return partes.join(" e ");
}

function numeroPorExtenso(n: number): string {
  if (n === 0) return "zero";

  const grupos: number[] = [];
  let resto = n;
  while (resto > 0) {
    grupos.push(resto % 1000);
    resto = Math.floor(resto / 1000);
  }

  const partes: string[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const valor = grupos[i];
    if (valor === 0) continue;

    if (i === 0) {
      partes.push(centenaPorExtenso(valor));
    } else if (i === 1) {
      partes.push(valor === 1 ? "mil" : `${centenaPorExtenso(valor)} mil`);
    } else {
      const escala = ESCALAS[i];
      partes.push(`${centenaPorExtenso(valor)} ${valor === 1 ? escala.singular : escala.plural}`);
    }
  }

  if (partes.length === 1) return partes[0];

  const ultimoGrupo = grupos[0];
  const usaE = ultimoGrupo > 0 && (ultimoGrupo < 100 || ultimoGrupo % 100 === 0);
  const cabeca = partes.slice(0, -1);
  const ultimaParte = partes[partes.length - 1];

  return usaE ? `${cabeca.join(", ")} e ${ultimaParte}` : `${cabeca.join(", ")}, ${ultimaParte}`;
}

/**
 * Converte um valor monetário em reais para texto por extenso (pt-BR), para uso no PDF do
 * contrato. Ex.: 1500 -> "mil e quinhentos reais". Usa "de reais" quando a parte inteira termina
 * em milhão/milhões/bilhão/bilhões, seguindo a norma culta (ex.: "um milhão de reais").
 */
export function valorPorExtenso(valor: number): string {
  if (valor < 0) throw new Error("Valor não pode ser negativo.");

  const valorArredondado = Math.round(valor * 100) / 100;
  const inteiro = Math.floor(valorArredondado);
  const centavos = Math.round((valorArredondado - inteiro) * 100);

  const parteReais = numeroPorExtenso(inteiro);
  const usaDe = ESCALAS_QUE_USAM_DE.test(parteReais);
  const reaisTexto =
    inteiro === 0 ? "zero reais" : `${parteReais}${usaDe ? " de" : ""} ${inteiro === 1 ? "real" : "reais"}`;

  if (centavos === 0) return reaisTexto;

  const centavosTexto = `${numeroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;

  if (inteiro === 0) return centavosTexto;

  return `${reaisTexto} e ${centavosTexto}`;
}
