"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CampoEndereco, enderecoVazio, type ValorEndereco } from "@/components/vendas/campo-endereco";
import { LeitorDocumentoIA } from "@/components/vendas/leitor-documento-ia";
import { UploadDocumentosPessoa } from "@/components/vendas/upload-documentos-pessoa";
import { calcularParcelasContrato, type DiaAncora, type Parcela } from "@/lib/vendas/calculo-parcelas";
import { formatarCpfCnpj } from "@/lib/vendas/mascaras";
import { tipoPessoaPorDocumento } from "@/lib/vendas/documento";
import type { ProdutoParaVenda } from "@/lib/vendas/produtos";
import {
  buscarPessoaPorDocumentoAction,
  buscarRazaoSocialAction,
  confirmarNovaOportunidadeAction,
  type EntradaConfirmarNovaOportunidade,
  type EntradaFinanceiro,
  type ResultadoBuscarPessoa,
} from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";
const secao = "space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700";

type DadosContratoForm = { nome: string; email: string; whatsapp: string; rg: string; estadoCivil: string; profissao: string };

const dadosContratoVazios: DadosContratoForm = { nome: "", email: "", whatsapp: "", rg: "", estadoCivil: "", profissao: "" };

type DocumentoPacoteForm = { documento: string; nomeRazaoSocial: string };

/**
 * Soma das parcelas em centavos == valor total em centavos — mesma lógica de arredondamento usada
 * em `fechamento/actions.ts` (seção "3) Resolve forma de pagamento + parcelas"), reaplicada no
 * client pra pegar divergência antes do round-trip pro servidor.
 */
function somaParcelasBateComTotal(parcelas: Parcela[], valorTotal: number): boolean {
  const somaParcelas = Math.round(parcelas.reduce((acc, p) => acc + p.valor, 0) * 100) / 100;
  const valorTotalArredondado = Math.round(valorTotal * 100) / 100;
  return somaParcelas === valorTotalArredondado;
}

export function NovaOportunidadeClient({ produtos }: { produtos: ProdutoParaVenda[] }) {
  const router = useRouter();

  const [produtoId, setProdutoId] = useState("");
  const produtoSelecionado = produtos.find((p) => p.id === produtoId) ?? null;
  const ehComissionado = produtoSelecionado?.tipo === "comissionado";

  const [documento, setDocumento] = useState("");
  const tipoPessoaAtual = tipoPessoaPorDocumento(documento);
  const ehPj = tipoPessoaAtual === "pj";
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [dadosContrato, setDadosContrato] = useState<DadosContratoForm>(dadosContratoVazios);
  const [endereco, setEndereco] = useState<ValorEndereco>(enderecoVazio);
  const [buscandoPessoa, setBuscandoPessoa] = useState(false);

  const [representanteDocumento, setRepresentanteDocumento] = useState("");
  const [representanteEncontrado, setRepresentanteEncontrado] = useState<{ id: string; nome: string } | null>(null);
  const [representanteNome, setRepresentanteNome] = useState("");
  const [dadosRepresentante, setDadosRepresentante] = useState<DadosContratoForm>(dadosContratoVazios);
  const [enderecoRepresentante, setEnderecoRepresentante] = useState<ValorEndereco>(enderecoVazio);

  // Guarda contra resposta obsoleta (o usuário digita rápido, uma busca antiga pode voltar depois
  // de uma mais nova e sobrescrever dado válido com null) + debounce pra não disparar uma busca por
  // tecla — mesmo padrão já usado na tela de Fornecedores e na antiga Nova Venda. Achado real da
  // revisão final da branch: essa proteção tinha ficado pra trás na reescrita desta tela.
  const buscaDocIdRef = useRef(0);
  const buscaDocTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buscaRepIdRef = useRef(0);
  const buscaRepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pacote, setPacote] = useState<DocumentoPacoteForm[]>([]);

  const [valorTotal, setValorTotal] = useState("");

  const [especiePagamento, setEspeciePagamento] = useState<"boleto_pix" | "cartao">("boleto_pix");
  const [formaPagamento, setFormaPagamento] = useState<"avista" | "parcelado">("avista");
  const [primeiraParcela, setPrimeiraParcela] = useState("");
  const [qtdParcelas, setQtdParcelas] = useState("2");
  const [diaAncora, setDiaAncora] = useState<DiaAncora>(10);
  const [maxParcelasCartao, setMaxParcelasCartao] = useState("12");

  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoDigitarDocumento(valor: string) {
    const formatado = formatarCpfCnpj(valor);
    setDocumento(formatado);
    // Documento do comprador mudou — descarta qualquer representante já resolvido/preenchido pro
    // documento anterior (senão o contrato de uma empresa nova pode sair vinculado ao representante
    // de outra empresa que o usuário tinha digitado antes por engano).
    setRepresentanteDocumento("");
    setRepresentanteEncontrado(null);
    setRepresentanteNome("");
    setDadosRepresentante(dadosContratoVazios);
    setEnderecoRepresentante(enderecoVazio);

    const tipo = tipoPessoaPorDocumento(formatado);
    if (!tipo) {
      buscaDocIdRef.current++; // invalida qualquer busca anterior ainda em andamento
      return;
    }

    const idAtual = ++buscaDocIdRef.current;
    setBuscandoPessoa(true);
    const resultado: ResultadoBuscarPessoa = await buscarPessoaPorDocumentoAction(formatado);
    if (idAtual !== buscaDocIdRef.current) return; // uma busca mais recente já assumiu, descarta esta resposta
    if (resultado.encontrada) {
      setPessoaId(resultado.id);
      setDadosContrato({
        nome: resultado.nome,
        email: resultado.email ?? "",
        whatsapp: resultado.whatsapp ?? "",
        rg: resultado.rg ?? "",
        estadoCivil: resultado.estadoCivil ?? "",
        profissao: resultado.profissao ?? "",
      });
    } else {
      setPessoaId(null);
      if (tipo === "pj") {
        const razaoSocial = await buscarRazaoSocialAction(formatado);
        if (idAtual !== buscaDocIdRef.current) return;
        setDadosContrato({ ...dadosContratoVazios, nome: razaoSocial?.razaoSocial ?? "" });
      } else {
        setDadosContrato(dadosContratoVazios);
      }
    }
    setBuscandoPessoa(false);
  }

  /** Wrapper com debounce (300ms) pro `onChange` do campo de documento digitado à mão — não usar
   * pro Leitor de Documento IA, que já dispara uma busca deliberada e precisa do `await` direto. */
  function aoMudarDocumento(valor: string) {
    setDocumento(formatarCpfCnpj(valor));
    if (buscaDocTimeoutRef.current) clearTimeout(buscaDocTimeoutRef.current);
    buscaDocTimeoutRef.current = setTimeout(() => aoDigitarDocumento(valor), 300);
  }

  async function aoDigitarDocumentoRepresentante(valor: string) {
    const formatado = formatarCpfCnpj(valor);
    setRepresentanteDocumento(formatado);
    const idAtual = ++buscaRepIdRef.current;
    const resultado = await buscarPessoaPorDocumentoAction(formatado);
    if (idAtual !== buscaRepIdRef.current) return;
    setRepresentanteEncontrado(resultado.encontrada ? { id: resultado.id, nome: resultado.nome } : null);
    if (resultado.encontrada) {
      setDadosRepresentante({
        nome: resultado.nome,
        email: resultado.email ?? "",
        whatsapp: resultado.whatsapp ?? "",
        rg: resultado.rg ?? "",
        estadoCivil: resultado.estadoCivil ?? "",
        profissao: resultado.profissao ?? "",
      });
    }
  }

  function aoMudarDocumentoRepresentante(valor: string) {
    setRepresentanteDocumento(formatarCpfCnpj(valor));
    if (buscaRepTimeoutRef.current) clearTimeout(buscaRepTimeoutRef.current);
    buscaRepTimeoutRef.current = setTimeout(() => aoDigitarDocumentoRepresentante(valor), 300);
  }

  function adicionarDocumentoPacote() {
    setPacote((atual) => [...atual, { documento: "", nomeRazaoSocial: "" }]);
  }

  function removerDocumentoPacote(indice: number) {
    setPacote((atual) => atual.filter((_, i) => i !== indice));
  }

  function atualizarDocumentoPacote(indice: number, campoAlterado: "documento" | "nomeRazaoSocial", valor: string) {
    setPacote((atual) =>
      atual.map((d, i) => (i === indice ? { ...d, [campoAlterado]: campoAlterado === "documento" ? formatarCpfCnpj(valor) : valor } : d)),
    );
  }

  async function confirmar() {
    setErro(null);

    if (!produtoId) {
      setErro("Selecione o serviço.");
      return;
    }
    if (!pessoaId && !dadosContrato.nome.trim()) {
      setErro("Informe o nome completo/razão social de quem assina o contrato.");
      return;
    }

    if (ehPj && !ehComissionado) {
      if (!representanteEncontrado && !representanteNome.trim()) {
        setErro("Informe o representante legal da empresa (nome ou CPF de alguém já cadastrado).");
        return;
      }
    }

    const valorTotalNumero = valorTotal.trim() ? Number(valorTotal.replace(",", ".")) : null;

    let financeiro: EntradaFinanceiro | null = null;
    if (!ehComissionado) {
      if (valorTotalNumero === null || Number.isNaN(valorTotalNumero) || valorTotalNumero <= 0) {
        setErro("Informe o valor total do serviço.");
        return;
      }
      if (!primeiraParcela && especiePagamento === "boleto_pix") {
        setErro("Informe a data da 1ª parcela.");
        return;
      }

      if (especiePagamento === "boleto_pix") {
        financeiro = {
          especie: "boleto_pix",
          formaPagamento,
          primeiraParcela,
          qtdParcelas: formaPagamento === "avista" ? 1 : Number(qtdParcelas),
          diaAncora,
        };

        // Validação de soma de parcelas == valor total antes de submeter (evita round-trip só pra
        // descobrir que não bate) — mesma lógica de arredondamento em centavos do Fechamento de Venda.
        const parcelas: Parcela[] =
          formaPagamento === "avista"
            ? [{ numero: 1, valor: valorTotalNumero, vencimento: new Date(primeiraParcela) }]
            : calcularParcelasContrato(valorTotalNumero, Number(qtdParcelas), new Date(primeiraParcela), diaAncora);
        if (!somaParcelasBateComTotal(parcelas, valorTotalNumero)) {
          setErro("A soma das parcelas não bate com o valor total.");
          return;
        }
      } else {
        const maxParcelas = Number(maxParcelasCartao);
        if (!Number.isInteger(maxParcelas) || maxParcelas < 1) {
          setErro("Informe um número válido de parcelas máximas do cartão.");
          return;
        }
        financeiro = { especie: "cartao", maxParcelas };
      }
    }

    setEnviando(true);
    try {
      const entrada: EntradaConfirmarNovaOportunidade = {
        produtoId,
        pessoaId,
        pessoaNova: pessoaId ? null : { nome: dadosContrato.nome, documento },
        dadosContrato: {
          email: dadosContrato.email,
          whatsapp: dadosContrato.whatsapp,
          rg: dadosContrato.rg,
          estadoCivil: dadosContrato.estadoCivil,
          profissao: dadosContrato.profissao,
        },
        endereco: endereco.logradouro ? endereco : null,
        pacote,
        valorTotal: valorTotalNumero,
        financeiro,
        representante:
          ehPj && !ehComissionado
            ? {
                pessoaId: representanteEncontrado?.id ?? null,
                pessoaNova: representanteEncontrado ? null : { nome: representanteNome, documento: representanteDocumento },
                dadosContrato: {
                  email: dadosRepresentante.email,
                  whatsapp: dadosRepresentante.whatsapp,
                  rg: dadosRepresentante.rg,
                  estadoCivil: dadosRepresentante.estadoCivil,
                  profissao: dadosRepresentante.profissao,
                },
                endereco: enderecoRepresentante.logradouro ? enderecoRepresentante : null,
              }
            : null,
      };

      const resultado = await confirmarNovaOportunidadeAction(entrada);
      if (!resultado.sucesso) {
        setErro(resultado.erro);
        return;
      }
      router.push(`/admin/vendas/${resultado.oportunidadeId}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Nova Oportunidade</h1>

      <div className={secao}>
        <label className={rotulo}>Serviço</label>
        <select className={campo} value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
          <option value="">Selecione...</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        {produtoSelecionado?.exigeListaDocumentos && (
          <p className="text-xs text-zinc-500">
            Este serviço aceita mais de um CPF/CNPJ no mesmo contrato — a seção de pacote de documentos entra na próxima etapa desta tela.
          </p>
        )}
      </div>

      <div className={secao}>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Quem assina o contrato</h2>
        <LeitorDocumentoIA
          onDadosExtraidos={async (dados) => {
            // Espera a busca por documento terminar ANTES de aplicar o nome extraído pela IA —
            // senão, quando a pessoa não é encontrada (comum: PF nova, exatamente o caso de uso do
            // leitor), aoDigitarDocumento zera dadosContrato de volta e apaga o nome que acabou de
            // ser preenchido aqui (achado real da revisão final da branch).
            if (dados.documento) await aoDigitarDocumento(dados.documento);
            if (dados.nome) setDadosContrato((atual) => ({ ...atual, nome: dados.nome }));
            setEndereco((atual) => ({
              ...atual,
              cep: dados.cep || atual.cep,
              logradouro: dados.logradouro || atual.logradouro,
              numero: dados.numero || atual.numero,
              bairro: dados.bairro || atual.bairro,
              cidade: dados.cidade || atual.cidade,
              uf: dados.uf || atual.uf,
            }));
          }}
        />
        <label className={rotulo}>CPF/CNPJ</label>
        <input className={campo} value={documento} onChange={(e) => aoMudarDocumento(e.target.value)} />
        {buscandoPessoa && <p className="text-xs text-zinc-500">Buscando...</p>}
        {!buscandoPessoa && pessoaId && <p className="text-xs text-emerald-600 dark:text-emerald-400">Pessoa já cadastrada — dados carregados.</p>}
        <label className={rotulo}>Nome completo / Razão social</label>
        <input
          className={campo}
          value={dadosContrato.nome}
          onChange={(e) => setDadosContrato({ ...dadosContrato, nome: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={rotulo}>RG</label>
            <input className={campo} value={dadosContrato.rg} onChange={(e) => setDadosContrato({ ...dadosContrato, rg: e.target.value })} />
          </div>
          <div>
            <label className={rotulo}>Estado civil</label>
            <input
              className={campo}
              value={dadosContrato.estadoCivil}
              onChange={(e) => setDadosContrato({ ...dadosContrato, estadoCivil: e.target.value })}
            />
          </div>
          <div>
            <label className={rotulo}>Profissão</label>
            <input
              className={campo}
              value={dadosContrato.profissao}
              onChange={(e) => setDadosContrato({ ...dadosContrato, profissao: e.target.value })}
            />
          </div>
          <div>
            <label className={rotulo}>E-mail</label>
            <input className={campo} value={dadosContrato.email} onChange={(e) => setDadosContrato({ ...dadosContrato, email: e.target.value })} />
          </div>
          <div>
            <label className={rotulo}>WhatsApp</label>
            <input
              className={campo}
              value={dadosContrato.whatsapp}
              onChange={(e) => setDadosContrato({ ...dadosContrato, whatsapp: e.target.value })}
            />
          </div>
        </div>
        <CampoEndereco value={endereco} onChange={setEndereco} />

        {ehPj && (
          <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Representante legal (quem assina pela empresa)</h3>
            <label className={rotulo}>CPF do representante</label>
            <input
              className={campo}
              value={representanteDocumento}
              onChange={(e) => aoMudarDocumentoRepresentante(e.target.value)}
            />
            {representanteEncontrado ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ {representanteEncontrado.nome}</p>
            ) : (
              <div>
                <label className={rotulo}>Nome (representante novo)</label>
                <input className={campo} value={representanteNome} onChange={(e) => setRepresentanteNome(e.target.value)} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={rotulo}>RG</label>
                <input
                  className={campo}
                  value={dadosRepresentante.rg}
                  onChange={(e) => setDadosRepresentante({ ...dadosRepresentante, rg: e.target.value })}
                />
              </div>
              <div>
                <label className={rotulo}>Estado civil</label>
                <input
                  className={campo}
                  value={dadosRepresentante.estadoCivil}
                  onChange={(e) => setDadosRepresentante({ ...dadosRepresentante, estadoCivil: e.target.value })}
                />
              </div>
              <div>
                <label className={rotulo}>Profissão</label>
                <input
                  className={campo}
                  value={dadosRepresentante.profissao}
                  onChange={(e) => setDadosRepresentante({ ...dadosRepresentante, profissao: e.target.value })}
                />
              </div>
              <div>
                <label className={rotulo}>E-mail</label>
                <input
                  className={campo}
                  value={dadosRepresentante.email}
                  onChange={(e) => setDadosRepresentante({ ...dadosRepresentante, email: e.target.value })}
                />
              </div>
              <div>
                <label className={rotulo}>WhatsApp</label>
                <input
                  className={campo}
                  value={dadosRepresentante.whatsapp}
                  onChange={(e) => setDadosRepresentante({ ...dadosRepresentante, whatsapp: e.target.value })}
                />
              </div>
            </div>
            <CampoEndereco value={enderecoRepresentante} onChange={setEnderecoRepresentante} />
          </div>
        )}
      </div>

      {produtoSelecionado?.exigeListaDocumentos && (
        <div className={secao}>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Pacote de documentos</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Este serviço cobre mais de um CPF/CNPJ no mesmo contrato (ex.: cônjuge, empresa do cliente). Adicione cada um abaixo.
          </p>
          {pacote.map((doc, indice) => (
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
        </div>
      )}

      {produtoId && (
        <div className={secao}>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Valor</h2>
          <label className={rotulo}>Valor total do serviço</label>
          <input
            className={campo}
            type="number"
            min={0}
            step="0.01"
            placeholder="0,00"
            value={valorTotal}
            onChange={(e) => setValorTotal(e.target.value)}
          />
        </div>
      )}

      {produtoId && !ehComissionado && (
        <div className={secao}>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Pagamento</h2>
          <div className="flex gap-2">
            <select
              className={campo}
              value={especiePagamento}
              onChange={(e) => setEspeciePagamento(e.target.value as "boleto_pix" | "cartao")}
            >
              <option value="boleto_pix">Boleto/Pix</option>
              <option value="cartao">Cartão de crédito</option>
            </select>
            {especiePagamento === "boleto_pix" && (
              <select className={campo} value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value as "avista" | "parcelado")}>
                <option value="avista">À vista</option>
                <option value="parcelado">Parcelado</option>
              </select>
            )}
          </div>

          {especiePagamento === "boleto_pix" ? (
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
          ) : (
            <div>
              <label className={rotulo}>Máximo de parcelas no cartão</label>
              <input
                className={campo}
                type="number"
                min={1}
                value={maxParcelasCartao}
                onChange={(e) => setMaxParcelasCartao(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      <div className={secao}>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Documentos de identificação</h2>
        {pessoaId ? (
          <UploadDocumentosPessoa pessoaId={pessoaId} />
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Documentos de identificação podem ser enviados depois, na tela de Detalhes da Venda.
          </p>
        )}
      </div>

      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <button
        type="button"
        onClick={confirmar}
        disabled={enviando}
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {enviando ? "Criando..." : "Criar oportunidade"}
      </button>
    </div>
  );
}
