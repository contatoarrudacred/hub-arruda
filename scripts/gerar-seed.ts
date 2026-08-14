// Gera supabase/seed.sql a partir das fontes em src/lib/motor-fluxo/*.ts — mantém uma fonte única
// pro conteúdo do script (testado em engine.test.ts) em vez de duplicar tudo em SQL à mão.
//
// Uso: pnpm exec tsx scripts/gerar-seed.ts > supabase/seed.sql

import { randomUUID } from "node:crypto";
import {
  AGENDA_PADRAO_ITENS,
  CONFIG_PRECIFICACAO_LIMPEZA_NOME as CONFIG,
  FAIXAS_PRECOS_LIMPEZA_NOME as FAIXAS_PRECOS,
  FAQS_LIMPEZA_NOME,
} from "../src/lib/motor-fluxo/dados-referencia-limpeza-nome";
import {
  ETAPAS_ABERTURA_TRIAGEM,
  ETAPAS_LIMPEZA_NOME,
  NOME_FLUXO_ABERTURA_TRIAGEM,
  NOME_FLUXO_LIMPEZA_NOME,
  tipoEtapaDb,
  type DefinicaoEtapa,
} from "../src/lib/motor-fluxo/fluxo-limpeza-nome";

function sqlStr(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}

function sqlJson(valor: unknown): string {
  return `${sqlStr(JSON.stringify(valor))}::jsonb`;
}

function sqlNum(valor: number | null): string {
  return valor === null ? "null" : String(valor);
}

function sqlBool(valor: boolean): string {
  return valor ? "true" : "false";
}

const linhas: string[] = [];
function emitir(sql: string) {
  linhas.push(sql);
}

// ---------------------------------------------------------------------------
// IDs fixos desta geração — internamente consistentes dentro do arquivo gerado.
// ---------------------------------------------------------------------------
const idEntidadeLegal = randomUUID();
const idUnidadeNegocio = randomUUID();
const idProdutoLimpezaNome = randomUUID();
const idFluxoAberturaTriagem = randomUUID();
const idFluxoLimpezaNome = randomUUID();
const idAgendaPadrao = randomUUID();

emitir("-- Gerado por scripts/gerar-seed.ts — não editar à mão, editar a fonte em src/lib/motor-fluxo/ e regerar.");
emitir("-- Rodar no SQL Editor do Supabase depois das migrations 001-004.\n");

emitir("-- Entidade legal e unidade de negócio (ArrudaCred)");
emitir(
  `insert into entidades_legais (id, razao_social, cnpj) values (${sqlStr(idEntidadeLegal)}, ${sqlStr("L.H. DE ARRUDA D. DO VALLE SERVIÇOS LTDA")}, ${sqlStr("40342851000137")});`,
);
emitir(
  `insert into unidades_negocio (id, entidade_legal_id, nome) values (${sqlStr(idUnidadeNegocio)}, ${sqlStr(idEntidadeLegal)}, ${sqlStr("ArrudaCred")});`,
);

emitir("\n-- Produto");
emitir(
  `insert into produtos (id, unidade_negocio_id, nome, tipo, fonte_receita) values (${sqlStr(idProdutoLimpezaNome)}, ${sqlStr(idUnidadeNegocio)}, ${sqlStr("Limpeza de Nome (CPF/CNPJ) — Serasa/SPC")}, ${sqlStr("proprio")}, ${sqlStr("venda_direta")});`,
);

emitir("\n-- Fluxos");
emitir(
  `insert into fluxos (id, produto_id, nome) values (${sqlStr(idFluxoAberturaTriagem)}, null, ${sqlStr(NOME_FLUXO_ABERTURA_TRIAGEM)});`,
);
emitir(
  `insert into fluxos (id, produto_id, nome) values (${sqlStr(idFluxoLimpezaNome)}, ${sqlStr(idProdutoLimpezaNome)}, ${sqlStr(NOME_FLUXO_LIMPEZA_NOME)});`,
);

emitir("\n-- Etapas do fluxo (o \"editor de fluxo\" — PLANO_MESTRE seção 8.9)");
function emitirEtapas(definicoes: DefinicaoEtapa[], fluxoId: string) {
  for (const def of definicoes) {
    const tipo = tipoEtapaDb(def.conteudo);
    const campoSalvo = def.campoSalvo ? sqlStr(def.campoSalvo) : "null";
    emitir(
      `insert into etapas_fluxo (fluxo_id, ordem, tipo_etapa, conteudo, campo_salvo) values (${sqlStr(fluxoId)}, ${def.ordem}, ${sqlStr(tipo)}, ${sqlJson(def.conteudo)}, ${campoSalvo});`,
    );
  }
}
emitirEtapas(ETAPAS_ABERTURA_TRIAGEM, idFluxoAberturaTriagem);
emitirEtapas(ETAPAS_LIMPEZA_NOME, idFluxoLimpezaNome);

emitir("\n-- FAQs (FAQ_LIMPANOME_SERASA_SPC.md)");
for (const faq of FAQS_LIMPEZA_NOME) {
  emitir(
    `insert into faqs (produto_id, pergunta, resposta) values (${sqlStr(idProdutoLimpezaNome)}, ${sqlStr(faq.pergunta)}, ${sqlStr(faq.resposta)});`,
  );
}

emitir("\n-- Preços por faixa (SCRIPT_LIMPANOME_SERASA_SPC.md)");
for (const faixa of FAIXAS_PRECOS) {
  emitir(
    `insert into precos_por_faixa (produto_id, faixa_min, faixa_max, preco_cheio, preco_avista, parcelas_boleto_qtd, parcelas_boleto_valor, parcelas_cartao_max, voucher_avista, voucher_parcelas_qtd, voucher_parcelas_valor) values (${sqlStr(idProdutoLimpezaNome)}, ${sqlNum(faixa.faixaMin)}, ${sqlNum(faixa.faixaMax)}, ${sqlNum(faixa.precoCheio)}, ${sqlNum(faixa.precoAvista)}, ${sqlNum(faixa.parcelasBoletoQtd)}, ${sqlNum(faixa.parcelasBoletoValor)}, ${sqlNum(faixa.parcelasCartaoMax)}, ${sqlNum(faixa.voucherAvista)}, ${sqlNum(faixa.voucherParcelasQtd)}, ${sqlNum(faixa.voucherParcelasValor)});`,
  );
}

emitir("\n-- Valores configuráveis (PLANO_MESTRE seção 8.9 / MODELAGEM_DADOS seção \"Valores Configuráveis\")");
const configuracoes: { chave: string; valor: unknown; descricao: string }[] = [
  {
    chave: "limpanome_investimento_minimo_avista",
    valor: CONFIG.investimentoMinimoAvista,
    descricao:
      "Investimento mínimo à vista para restrição abaixo de R$3 mil (Passo 7 do script) — usado quando o valor não cabe na tabela por faixa.",
  },
  {
    chave: "limpanome_investimento_minimo_parcelado",
    valor: { qtd: CONFIG.investimentoMinimoParcelasQtd, valor: CONFIG.investimentoMinimoParcelasValor },
    descricao: "Parcelamento do investimento mínimo (Passo 7) — mesma regra do valor à vista acima.",
  },
  {
    chave: "limpanome_formula_alto_valor",
    valor: { valor_fixo: CONFIG.altoValorFixo, percentual: CONFIG.altoValorPercentual },
    descricao:
      "Fórmula de previsibilidade de receita para restrições acima do corte de alto valor: valor_fixo + percentual × valor da restrição (KANBAN_COMERCIAL_LIMPANOME.md).",
  },
  {
    chave: "limpanome_corte_alto_valor",
    valor: CONFIG.corteAltoValor,
    descricao:
      "A partir deste valor de restrição, a Malala qualifica e tenta agendar call com Luiz em vez de propor direto (PLANO_MESTRE seção 8.7).",
  },
];
for (const config of configuracoes) {
  emitir(
    `insert into configuracoes (unidade_negocio_id, produto_id, chave, valor, descricao) values (${sqlStr(idUnidadeNegocio)}, ${sqlStr(idProdutoLimpezaNome)}, ${sqlStr(config.chave)}, ${sqlJson(config.valor)}, ${sqlStr(config.descricao)});`,
  );
}

emitir("\n-- Agenda padrão de follow-up (SCRIPT_LIMPANOME_SERASA_SPC.md, premissas gerais)");
emitir(`insert into agendas_followup (id, nome) values (${sqlStr(idAgendaPadrao)}, ${sqlStr("Padrão")});`);
for (const item of AGENDA_PADRAO_ITENS) {
  emitir(
    `insert into agenda_itens (agenda_id, ordem, intervalo_valor, intervalo_unidade, canal, respeita_janela_comercial, conteudo) values (${sqlStr(idAgendaPadrao)}, ${item.ordem}, ${item.intervaloValor}, ${sqlStr(item.intervaloUnidade)}, ${sqlStr(item.canal)}, ${sqlBool(item.respeitaJanelaComercial)}, ${sqlStr(item.conteudo)});`,
  );
}

console.log(linhas.join("\n"));
