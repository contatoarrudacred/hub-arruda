"use client";

import { useRef, useState } from "react";
import { CampoEndereco, enderecoVazio, type ValorEndereco } from "@/components/vendas/campo-endereco";
import type { DiaAncora } from "@/lib/vendas/calculo-parcelas";
import type { FormaPagamento, MetodoPagamento } from "@/lib/vendas/contratos";
import type { EnderecoPessoa } from "@/lib/vendas/endereco";
import type { DetalhePagamentoCrm, DocumentoPacoteLinha, OportunidadeFechamento } from "@/lib/vendas/oportunidades";
import { formatarCpfCnpj } from "@/lib/vendas/mascaras";
import type { PessoaCompleta } from "@/lib/vendas/pessoas";
import { buscarPessoaPorDocumentoAction, confirmarFechamentoAction, type EntradaConfirmarFechamento } from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

type DadosContratoForm = { email: string; whatsapp: string; rg: string; estadoCivil: string; profissao: string };

function dadosContratoIniciais(pessoa: PessoaCompleta | null): DadosContratoForm {
  return {
    email: pessoa?.email ?? "",
    whatsapp: pessoa?.whatsapp ?? "",
    rg: pessoa?.rg ?? "",
    estadoCivil: pessoa?.estadoCivil ?? "",
    profissao: pessoa?.profissao ?? "",
  };
}

function enderecoInicial(endereco: EnderecoPessoa | null): ValorEndereco {
  if (!endereco) return enderecoVazio;
  return {
    cep: endereco.cep ?? "",
    logradouro: endereco.logradouro ?? "",
    numero: endereco.numero ?? "",
    complemento: endereco.complemento ?? "",
    bairro: endereco.bairro ?? "",
    cidade: endereco.cidade ?? "",
    uf: endereco.uf ?? "",
  };
}

function BlocoDadosContrato({ valor, onChange }: { valor: DadosContratoForm; onChange: (v: DadosContratoForm) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={rotulo}>RG</label>
        <input className={campo} value={valor.rg} onChange={(e) => onChange({ ...valor, rg: e.target.value })} />
      </div>
      <div>
        <label className={rotulo}>Estado civil</label>
        <input className={campo} value={valor.estadoCivil} onChange={(e) => onChange({ ...valor, estadoCivil: e.target.value })} />
      </div>
      <div>
        <label className={rotulo}>Profissão</label>
        <input className={campo} value={valor.profissao} onChange={(e) => onChange({ ...valor, profissao: e.target.value })} />
      </div>
      <div>
        <label className={rotulo}>E-mail</label>
        <input className={campo} value={valor.email} onChange={(e) => onChange({ ...valor, email: e.target.value })} />
      </div>
      <div>
        <label className={rotulo}>Telefone/WhatsApp</label>
        <input className={campo} value={valor.whatsapp} onChange={(e) => onChange({ ...valor, whatsapp: e.target.value })} />
      </div>
    </div>
  );
}

type Props = {
  oportunidade: OportunidadeFechamento;
  pessoa: PessoaCompleta;
  endereco: EnderecoPessoa | null;
  representante: PessoaCompleta | null;
  enderecoRepresentante: EnderecoPessoa | null;
  documentosPacoteIniciais: DocumentoPacoteLinha[];
  detalhePagamentoCrm: DetalhePagamentoCrm | null;
};

export function FechamentoVendaClient({
  oportunidade,
  pessoa,
  endereco,
  representante,
  enderecoRepresentante,
  documentosPacoteIniciais,
  detalhePagamentoCrm,
}: Props) {
  const [dadosSignatario, setDadosSignatario] = useState<DadosContratoForm>(dadosContratoIniciais(pessoa));
  const [enderecoSignatario, setEnderecoSignatario] = useState<ValorEndereco>(enderecoInicial(endereco));

  const [representanteDocumento, setRepresentanteDocumento] = useState(representante?.documento ? formatarCpfCnpj(representante.documento) : "");
  const [representanteEncontrado, setRepresentanteEncontrado] = useState<{ id: string; nome: string } | null>(
    representante ? { id: representante.id, nome: representante.nomeRazaoSocial } : null,
  );
  const [representanteNome, setRepresentanteNome] = useState("");
  const [dadosRepresentante, setDadosRepresentante] = useState<DadosContratoForm>(dadosContratoIniciais(representante));
  const [enderecoRepresentanteForm, setEnderecoRepresentanteForm] = useState<ValorEndereco>(enderecoInicial(enderecoRepresentante));
  const buscaRepIdRef = useRef(0);
  const buscaRepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [documentosPacote, setDocumentosPacote] = useState(
    documentosPacoteIniciais.map((d) => ({ documento: formatarCpfCnpj(d.documento), nomeRazaoSocial: d.nomeRazaoSocial })),
  );

  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("avista");
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>("boleto_pix");
  const [primeiraParcela, setPrimeiraParcela] = useState("");
  const [qtdParcelas, setQtdParcelas] = useState("2");
  const [diaAncora, setDiaAncora] = useState<DiaAncora>(10);

  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ pdfUrl: string | null } | null>(null);

  async function buscarRepresentante(doc: string) {
    const idAtual = ++buscaRepIdRef.current;
    const resultadoBusca = await buscarPessoaPorDocumentoAction(doc);
    if (idAtual !== buscaRepIdRef.current) return;
    setRepresentanteEncontrado(resultadoBusca.encontrada ? { id: resultadoBusca.id, nome: resultadoBusca.nome } : null);
  }

  function aoMudarDocumentoRepresentante(valor: string) {
    const formatado = formatarCpfCnpj(valor);
    setRepresentanteDocumento(formatado);
    if (buscaRepTimeoutRef.current) clearTimeout(buscaRepTimeoutRef.current);
    buscaRepTimeoutRef.current = setTimeout(() => buscarRepresentante(formatado), 300);
  }

  function adicionarDocumentoPacote() {
    setDocumentosPacote((atual) => [...atual, { documento: "", nomeRazaoSocial: "" }]);
  }

  function removerDocumentoPacote(indice: number) {
    setDocumentosPacote((atual) => atual.filter((_, i) => i !== indice));
  }

  function atualizarDocumentoPacote(indice: number, campoAlterado: "documento" | "nomeRazaoSocial", valor: string) {
    setDocumentosPacote((atual) =>
      atual.map((d, i) => (i === indice ? { ...d, [campoAlterado]: campoAlterado === "documento" ? formatarCpfCnpj(valor) : valor } : d)),
    );
  }

  async function confirmar() {
    setErro(null);
    setEnviando(true);
    try {
      const entrada: EntradaConfirmarFechamento = {
        oportunidadeId: oportunidade.id,
        pessoaId: pessoa.id,
        pessoaTipo: pessoa.tipoPessoa,
        dadosContrato: {
          email: dadosSignatario.email || null,
          whatsapp: dadosSignatario.whatsapp || null,
          rg: dadosSignatario.rg || null,
          estadoCivil: dadosSignatario.estadoCivil || null,
          profissao: dadosSignatario.profissao || null,
        },
        endereco: enderecoSignatario.logradouro ? enderecoSignatario : null,
        representante:
          pessoa.tipoPessoa === "pj"
            ? {
                pessoaId: representanteEncontrado?.id ?? null,
                pessoaNova: representanteEncontrado ? null : { nome: representanteNome, documento: representanteDocumento },
                dadosContrato: {
                  email: dadosRepresentante.email || null,
                  whatsapp: dadosRepresentante.whatsapp || null,
                  rg: dadosRepresentante.rg || null,
                  estadoCivil: dadosRepresentante.estadoCivil || null,
                  profissao: dadosRepresentante.profissao || null,
                },
                endereco: enderecoRepresentanteForm.logradouro ? enderecoRepresentanteForm : null,
              }
            : null,
        documentosPacote,
        pagamento: detalhePagamentoCrm
          ? { origem: "crm" }
          : {
              origem: "manual",
              formaPagamento,
              metodoPagamento,
              primeiraParcela,
              qtdParcelas: formaPagamento === "avista" ? 1 : Number(qtdParcelas),
              diaAncora,
            },
      };

      const resultadoAction = await confirmarFechamentoAction(entrada);
      if (!resultadoAction.sucesso) {
        setErro(resultadoAction.erro);
        return;
      }
      setResultado({ pdfUrl: resultadoAction.pdfUrl });
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <div className="max-w-2xl space-y-3 p-8">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">✓ Venda registrada.</p>
        {resultado.pdfUrl ? (
          <a href={resultado.pdfUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline dark:text-blue-400">
            Abrir PDF do contrato
          </a>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            PDF ainda sendo gerado (ou precisou de retentativa) — acompanhe na tela de Detalhes da Venda.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Fechamento de Venda</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {oportunidade.produtoNome} — {pessoa.nomeRazaoSocial} ({pessoa.documento})
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {pessoa.tipoPessoa === "pf" ? "Dados do cliente" : "Dados da empresa (já cadastrados)"}
        </h2>
        {pessoa.tipoPessoa === "pf" ? (
          <>
            <BlocoDadosContrato valor={dadosSignatario} onChange={setDadosSignatario} />
            <CampoEndereco value={enderecoSignatario} onChange={setEnderecoSignatario} />
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {pessoa.nomeRazaoSocial} — CNPJ {pessoa.documento}
            </p>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Representante legal (quem assina pela empresa)</h3>
            <div>
              <label className={rotulo}>CPF do representante</label>
              <input className={campo} value={representanteDocumento} onChange={(e) => aoMudarDocumentoRepresentante(e.target.value)} />
            </div>
            {representanteEncontrado ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">✓ {representanteEncontrado.nome}</p>
            ) : (
              <div>
                <label className={rotulo}>Nome (representante novo)</label>
                <input className={campo} value={representanteNome} onChange={(e) => setRepresentanteNome(e.target.value)} />
              </div>
            )}
            <BlocoDadosContrato valor={dadosRepresentante} onChange={setDadosRepresentante} />
            <CampoEndereco value={enderecoRepresentanteForm} onChange={setEnderecoRepresentanteForm} />
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Documentos cobertos pelo contrato (opcional)</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Só preencha se o serviço cobrir mais de um CPF/CNPJ (ex.: cônjuge, empresa do cliente). Deixe vazio se for só o cliente acima.
        </p>
        {documentosPacote.map((doc, indice) => (
          <div key={indice} className="flex gap-2">
            <input
              className={campo}
              placeholder="CPF ou CNPJ"
              value={doc.documento}
              onChange={(e) => atualizarDocumentoPacote(indice, "documento", e.target.value)}
            />
            <input
              className={campo}
              placeholder="Nome completo ou razão social"
              value={doc.nomeRazaoSocial}
              onChange={(e) => atualizarDocumentoPacote(indice, "nomeRazaoSocial", e.target.value)}
            />
            <button type="button" onClick={() => removerDocumentoPacote(indice)} className="px-2 text-sm text-red-600 dark:text-red-400">
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={adicionarDocumentoPacote} className="text-sm text-blue-600 dark:text-blue-400">
          + Adicionar documento
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Pagamento</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Valor total: {oportunidade.valorEstimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </p>

        {detalhePagamentoCrm ? (
          <div className="rounded-lg border border-zinc-300 p-3 text-sm dark:border-zinc-700">
            <p>
              Já capturado no atendimento: {detalhePagamentoCrm.tipo === "avista" ? "à vista" : `parcelado em ${detalhePagamentoCrm.parcelas.length}x`},{" "}
              {detalhePagamentoCrm.forma === "boleto_pix" ? "Boleto/Pix" : "Cartão"}.
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <select className={campo} value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento)}>
                <option value="avista">À vista</option>
                <option value="parcelado">Parcelado</option>
              </select>
              <select className={campo} value={metodoPagamento} onChange={(e) => setMetodoPagamento(e.target.value as MetodoPagamento)}>
                <option value="boleto_pix">Boleto/Pix</option>
                <option value="cartao">Cartão</option>
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className={rotulo}>Data da 1ª parcela</label>
                <input className={campo} type="date" value={primeiraParcela} onChange={(e) => setPrimeiraParcela(e.target.value)} />
              </div>
              {formaPagamento === "parcelado" && (
                <>
                  <div>
                    <label className={rotulo}>Qtd. parcelas</label>
                    <input className={campo} type="number" min={2} value={qtdParcelas} onChange={(e) => setQtdParcelas(e.target.value)} />
                  </div>
                  <div>
                    <label className={rotulo}>Dia âncora</label>
                    <select className={campo} value={diaAncora} onChange={(e) => setDiaAncora(Number(e.target.value) as DiaAncora)}>
                      <option value={1}>01</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </section>

      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <button
        onClick={confirmar}
        disabled={enviando}
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {enviando ? "Gerando contrato..." : "Gerar contrato"}
      </button>
    </div>
  );
}
