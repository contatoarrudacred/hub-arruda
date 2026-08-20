import { notFound } from "next/navigation";
import { buscarEnderecoPorPessoa } from "@/lib/vendas/endereco";
import {
  buscarDetalhePagamentoCrm,
  buscarOportunidadeParaFechamento,
  listarDocumentosPacote,
} from "@/lib/vendas/oportunidades";
import { buscarPessoaCompleta } from "@/lib/vendas/pessoas";
import { buscarRepresentante } from "@/lib/vendas/pessoa-representantes";
import { FechamentoVendaClient } from "./fechamento-client";

export default async function FechamentoVendaPage({ params }: { params: Promise<{ oportunidadeId: string }> }) {
  const { oportunidadeId } = await params;

  const oportunidade = await buscarOportunidadeParaFechamento(oportunidadeId);
  if (!oportunidade) notFound();

  const [pessoa, endereco, documentosPacote, detalhePagamentoCrm] = await Promise.all([
    buscarPessoaCompleta(oportunidade.pessoaId),
    buscarEnderecoPorPessoa(oportunidade.pessoaId),
    listarDocumentosPacote(oportunidadeId),
    buscarDetalhePagamentoCrm(oportunidadeId),
  ]);
  if (!pessoa) notFound();

  let representante = null;
  let enderecoRepresentante = null;
  if (pessoa.tipoPessoa === "pj") {
    const vinculo = await buscarRepresentante(pessoa.id);
    if (vinculo) {
      [representante, enderecoRepresentante] = await Promise.all([
        buscarPessoaCompleta(vinculo.pessoaFisicaId),
        buscarEnderecoPorPessoa(vinculo.pessoaFisicaId),
      ]);
    }
  }

  return (
    <FechamentoVendaClient
      oportunidade={oportunidade}
      pessoa={pessoa}
      endereco={endereco}
      representante={representante}
      enderecoRepresentante={enderecoRepresentante}
      documentosPacoteIniciais={documentosPacote}
      detalhePagamentoCrm={detalhePagamentoCrm}
    />
  );
}
