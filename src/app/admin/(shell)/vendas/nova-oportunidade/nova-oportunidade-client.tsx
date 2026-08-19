"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CampoEndereco, enderecoVazio, type ValorEndereco } from "@/components/vendas/campo-endereco";
import { LeitorDocumentoIA } from "@/components/vendas/leitor-documento-ia";
import { UploadDocumentosPessoa } from "@/components/vendas/upload-documentos-pessoa";
import { salvarDocumentosExtraidosAction } from "@/components/vendas/upload-pessoa-actions";
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

type ParcelaForm = { numero: number; valor: string; vencimento: string };

function parcelasParaForm(parcelas: Parcela[]): ParcelaForm[] {
  return parcelas.map((p) => ({
    numero: p.numero,
    valor: p.valor.toFixed(2),
    vencimento: p.vencimento.toISOString().slice(0, 10),
  }));
}

function formParaParcelas(form: ParcelaForm[]): Parcela[] {
  return form.map((p) => ({ numero: p.numero, valor: Number(p.valor.replace(",", ".")) || 0, vencimento: new Date(`${p.vencimento}T00:00:00`) }));
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
  const [parcelasBoleto, setParcelasBoleto] = useState<ParcelaForm[]>([]);

  const valorTotalNumeroPreview = valorTotal.trim() ? Number(valorTotal.replace(",", ".")) : null;

  // Recalcula a tabela de parcelas sempre que qtd/data/dia-âncora/valor mudam — edições manuais numa
  // linha específica (valor/vencimento) ficam até a próxima mudança de um desses campos, que
  // reconstrói a tabela do zero. Achado real de teste em produção: essa tabela nunca aparecia,
  // mesmo já sendo parte do design original da tela.
  //
  // Padrão recomendado do React pra "estado derivado, mas com escape hatch pra edição manual":
  // recalcula durante o render (comparando uma chave com a última vista), não dentro de um
  // useEffect — evita o ciclo extra de render que o effect causaria.
  const chaveRecalculoParcelas = `${especiePagamento}|${formaPagamento}|${primeiraParcela}|${qtdParcelas}|${diaAncora}|${valorTotalNumeroPreview}`;
  const [chaveRecalculoAnterior, setChaveRecalculoAnterior] = useState(chaveRecalculoParcelas);
  if (chaveRecalculoParcelas !== chaveRecalculoAnterior) {
    setChaveRecalculoAnterior(chaveRecalculoParcelas);
    const qtd = Number(qtdParcelas);
    if (
      especiePagamento === "boleto_pix" &&
      formaPagamento === "parcelado" &&
      primeiraParcela &&
      valorTotalNumeroPreview &&
      valorTotalNumeroPreview > 0 &&
      Number.isInteger(qtd) &&
      qtd >= 2
    ) {
      const calculadas = calcularParcelasContrato(valorTotalNumeroPreview, qtd, new Date(`${primeiraParcela}T00:00:00`), diaAncora);
      setParcelasBoleto(parcelasParaForm(calculadas));
    } else {
      setParcelasBoleto([]);
    }
  }

  function atualizarParcelaBoleto(indice: number, campoAlterado: "valor" | "vencimento", valor: string) {
    setParcelasBoleto((atual) => atual.map((p, i) => (i === indice ? { ...p, [campoAlterado]: valor } : p)));
  }

  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [avisoDocumentoIA, setAvisoDocumentoIA] = useState<string | null>(null);
  const [mostrarTranscricaoIA, setMostrarTranscricaoIA] = useState(false);

  /** Devolve o pessoaId resolvido (ou null) — não só atualiza estado. Necessário pra quem chama
   * (ex.: o Leitor de Documento IA) poder agir imediatamente com o resultado, sem depender de ler
   * `pessoaId` do closure logo após o await (o setState não atualiza essa variável capturada). */
  async function aoDigitarDocumento(valor: string): Promise<string | null> {
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
      setBuscandoPessoa(false); // sem isso, "Buscando..." podia ficar preso na tela (achado real)
      return null;
    }

    const idAtual = ++buscaDocIdRef.current;
    setBuscandoPessoa(true);
    const resultado: ResultadoBuscarPessoa = await buscarPessoaPorDocumentoAction(formatado);
    if (idAtual !== buscaDocIdRef.current) return null; // uma busca mais recente já assumiu, descarta esta resposta
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
      setBuscandoPessoa(false);
      return resultado.id;
    }

    setPessoaId(null);
    if (tipo === "pj") {
      const razaoSocial = await buscarRazaoSocialAction(formatado);
      if (idAtual !== buscaDocIdRef.current) return null;
      setDadosContrato({ ...dadosContratoVazios, nome: razaoSocial?.razaoSocial ?? "" });
    } else {
      setDadosContrato(dadosContratoVazios);
    }
    setBuscandoPessoa(false);
    return null;
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
        // descobrir que não bate) — usa a tabela como está na tela (com edições manuais, se houver),
        // não uma recalculada do zero, já que é isso que vai ser enviado de verdade.
        if (formaPagamento === "parcelado") {
          const parcelasEditadas = formParaParcelas(parcelasBoleto);
          if (!somaParcelasBateComTotal(parcelasEditadas, valorTotalNumero)) {
            setErro("A soma das parcelas não bate com o valor total. Ajuste a tabela de parcelas abaixo.");
            return;
          }
          financeiro.parcelas = parcelasBoleto.map((p) => ({ numero: p.numero, valor: Number(p.valor.replace(",", ".")) || 0, vencimento: p.vencimento }));
        }
      } else {
        const maxParcelas = Number(maxParcelasCartao);
        if (!Number.isInteger(maxParcelas) || maxParcelas < 1 || maxParcelas > 21) {
          setErro("Parcelas máximas do cartão precisa ser um número entre 1 e 21 (limite da Asaas).");
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
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Nova Oportunidade</h1>
        <button
          type="button"
          onClick={() => setMostrarTranscricaoIA((v) => !v)}
          title="Ler CPF/CNPJ, nome e endereço automaticamente a partir de uma foto/PDF de um documento"
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            mostrarTranscricaoIA
              ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
              : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          <span>✨</span> Transcrição com IA
        </button>
      </div>

      {mostrarTranscricaoIA && (
        <div className={secao}>
          <LeitorDocumentoIA
            onDadosExtraidos={async (dados, arquivosLidos) => {
              setAvisoDocumentoIA(null);
              const ehComprovanteResidencia = dados.tipoDocumento === "comprovante_residencia";

              // Comprovante de residência costuma estar em nome de outra pessoa da família (cônjuge,
              // pai/mãe) mesmo quando o endereço é mesmo do cliente — nesse caso NÃO mexe em
              // nome/documento (só o endereço vale), pra não trocar a identidade de quem está sendo
              // cadastrado. Pedido explícito do Luiz, achado testando em produção.
              let pessoaIdResolvido = pessoaId;
              if (!ehComprovanteResidencia) {
                // Espera a busca por documento terminar ANTES de aplicar o nome extraído pela IA —
                // senão, quando a pessoa não é encontrada (comum: PF nova, exatamente o caso de uso
                // do leitor), aoDigitarDocumento zera dadosContrato de volta e apaga o nome que
                // acabou de ser preenchido aqui (achado real da revisão final da branch).
                if (dados.documento) pessoaIdResolvido = await aoDigitarDocumento(dados.documento);
                if (dados.nome) setDadosContrato((atual) => ({ ...atual, nome: dados.nome }));
              }

              const temEnderecoExtraido = [dados.cep, dados.logradouro, dados.bairro, dados.cidade].some((v) => v);
              if (temEnderecoExtraido) {
                const preencherEndereco = (atual: ValorEndereco): ValorEndereco => ({
                  ...atual,
                  cep: dados.cep || atual.cep,
                  logradouro: dados.logradouro || atual.logradouro,
                  numero: dados.numero || atual.numero,
                  bairro: dados.bairro || atual.bairro,
                  cidade: dados.cidade || atual.cidade,
                  uf: dados.uf || atual.uf,
                });
                // Numa venda PJ o endereço da EMPRESA não é mais coletado (ver caixa "Dados da
                // Empresa" abaixo) — o endereço extraído só faz sentido pro representante legal, a
                // pessoa física de verdade nesse fluxo.
                if (ehPj) {
                  setEnderecoRepresentante(preencherEndereco);
                } else {
                  setEndereco(preencherEndereco);
                }
              }

              if (ehComprovanteResidencia) {
                setAvisoDocumentoIA(
                  "Endereço preenchido a partir do comprovante de residência enviado. Comprovantes às vezes estão em nome de outra pessoa da família (cônjuge, pai/mãe) — confira se o endereço corresponde mesmo a quem está sendo cadastrado.",
                );
              }

              // Salva os arquivos lidos junto com o cadastro, classificados pela própria IA — só
              // quando a pessoa já é conhecida nesse momento (pessoa nova ainda não tem id; o aviso
              // na seção de documentos já explica que fica pra depois, na tela de Detalhes da Venda).
              if (pessoaIdResolvido && arquivosLidos.length > 0) {
                const formData = new FormData();
                arquivosLidos.forEach((arquivo) => formData.append("arquivos", arquivo));
                await salvarDocumentosExtraidosAction(pessoaIdResolvido, dados.tipoDocumento, formData);
              }
            }}
          />
          {avisoDocumentoIA && (
            <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
              ⚠ {avisoDocumentoIA}
            </p>
          )}
        </div>
      )}

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

        {ehPj ? (
          <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Dados da Empresa</h3>
            <label className={rotulo}>CNPJ</label>
            <input className={campo} value={documento} onChange={(e) => aoMudarDocumento(e.target.value)} />
            {buscandoPessoa && <p className="text-xs text-zinc-500">Buscando...</p>}
            {!buscandoPessoa && pessoaId && <p className="text-xs text-emerald-600 dark:text-emerald-400">Empresa já cadastrada — dados carregados.</p>}
            <label className={rotulo}>Razão Social</label>
            <input
              className={campo}
              value={dadosContrato.nome}
              onChange={(e) => setDadosContrato({ ...dadosContrato, nome: e.target.value })}
            />
          </div>
        ) : (
          <>
            <label className={rotulo}>CPF/CNPJ</label>
            <input className={campo} value={documento} onChange={(e) => aoMudarDocumento(e.target.value)} />
            {buscandoPessoa && <p className="text-xs text-zinc-500">Buscando...</p>}
            {!buscandoPessoa && pessoaId && <p className="text-xs text-emerald-600 dark:text-emerald-400">Pessoa já cadastrada — dados carregados.</p>}
            <label className={rotulo}>Nome completo</label>
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
                <input
                  className={campo}
                  value={dadosContrato.email}
                  onChange={(e) => setDadosContrato({ ...dadosContrato, email: e.target.value })}
                />
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
          </>
        )}

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
                max={21}
                value={maxParcelasCartao}
                onChange={(e) => setMaxParcelasCartao(e.target.value)}
              />
            </div>
          )}

          {especiePagamento === "boleto_pix" && formaPagamento === "parcelado" && parcelasBoleto.length > 0 && (
            <div className="space-y-1 pt-2">
              <p className={rotulo}>
                Parcelas — ajuste valor ou data de uma parcela específica se precisar (ex.: 1ª parcela menor). Mudar
                quantidade/data-base/dia-âncora acima recalcula a tabela do zero.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-500 dark:text-zinc-400">
                      <th className="py-1 pr-2">Nº</th>
                      <th className="py-1 pr-2">Vencimento</th>
                      <th className="py-1">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcelasBoleto.map((p, indice) => (
                      <tr key={p.numero} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="py-1 pr-2 text-zinc-500 dark:text-zinc-400">{p.numero}</td>
                        <td className="py-1 pr-2">
                          <input
                            className={campo}
                            type="date"
                            value={p.vencimento}
                            onChange={(e) => atualizarParcelaBoleto(indice, "vencimento", e.target.value)}
                          />
                        </td>
                        <td className="py-1">
                          <input
                            className={campo}
                            type="number"
                            step="0.01"
                            value={p.valor}
                            onChange={(e) => atualizarParcelaBoleto(indice, "valor", e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Soma:{" "}
                {formParaParcelas(parcelasBoleto)
                  .reduce((acc, p) => acc + p.valor, 0)
                  .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                {valorTotalNumeroPreview != null && (
                  <>
                    {" "}
                    de{" "}
                    {valorTotalNumeroPreview.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </>
                )}
              </p>
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
