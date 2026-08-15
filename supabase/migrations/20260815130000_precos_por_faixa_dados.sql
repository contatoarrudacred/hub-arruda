-- ============================================================================
-- MIGRATION 013 — Preços por faixa (dados reais confirmados por Luiz)
-- Sistema de Gestão ArrudaCred
--
-- 5 faixas de restrição do produto Limpeza de Nome (CPF/CNPJ), conforme
-- SCRIPT_LIMPANOME_SERASA_SPC.md (Estrutura da tabela de preços por faixa).
-- "Abaixo de R$ 3 mil" e "acima de R$ 500 mil" ficam de fora de propósito:
-- o primeiro já é coberto pelas colunas de voucher da faixa R$3-10 mil
-- (R$ 899 à vista / 6x R$ 299 — Luiz confirmou 15/08/2026 que é o mesmo
-- valor, não uma faixa separada); o segundo é uma fórmula/regra pra Malala
-- (R$ 7.680 + 1,5% do valor), não um preço fixo de tabela.
-- ============================================================================

insert into precos_por_faixa (
  produto_id, faixa_min, faixa_max, preco_cheio, preco_avista,
  parcelas_boleto_qtd, parcelas_boleto_valor, parcelas_cartao_max,
  voucher_avista, voucher_parcelas_qtd, voucher_parcelas_valor
)
select p.id, v.faixa_min, v.faixa_max, v.preco_cheio, v.preco_avista,
  v.parcelas_boleto_qtd, v.parcelas_boleto_valor, v.parcelas_cartao_max,
  v.voucher_avista, v.voucher_parcelas_qtd, v.voucher_parcelas_valor
from produtos p,
(values
  (3000::numeric, 10000::numeric, 2580::numeric, 1290::numeric, 6, 430::numeric, 12, 899::numeric, 6, 299::numeric),
  (10000::numeric, 30000::numeric, 3600::numeric, 1800::numeric, 6, 600::numeric, 12, 1290::numeric, 6, 399::numeric),
  (30000::numeric, 50000::numeric, 3600::numeric, 1800::numeric, 6, 600::numeric, 12, 1290::numeric, 6, 399::numeric),
  (50000::numeric, 100000::numeric, 4800::numeric, 2400::numeric, 6, 800::numeric, 12, 1790::numeric, 6, 599::numeric),
  (100000::numeric, 500000::numeric, 6000::numeric, 3000::numeric, 6, 1000::numeric, 12, 2390::numeric, 6, 799::numeric)
) as v(faixa_min, faixa_max, preco_cheio, preco_avista, parcelas_boleto_qtd, parcelas_boleto_valor, parcelas_cartao_max, voucher_avista, voucher_parcelas_qtd, voucher_parcelas_valor)
where p.nome = 'Limpeza de Nome (CPF/CNPJ) — Serasa/SPC';
