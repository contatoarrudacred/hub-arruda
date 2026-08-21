"use client";

import Link from "next/link";
import { useState } from "react";
import type { AssinafyDocumento, AssinafySignatarioStatus } from "@/lib/assinafy/cliente";
import type { CobrancaStatus } from "@/lib/asaas/cliente";
import type { ComissaoFornecedor } from "@/lib/vendas/comissoes";
import type { TemplateDocumentoCompleto } from "@/lib/vendas/contrato-templates";
import type { Contrato, ContratoParcela, FormaPagamento, MetodoPagamento, StatusContrato } from "@/lib/vendas/contratos";
import type { EnderecoPessoa } from "@/lib/vendas/endereco";
import { corEstagio, rotuloEstagio } from "@/lib/vendas/estagio-venda";
import { formatarCep, formatarCpfCnpj, formatarTelefone } from "@/lib/vendas/mascaras";
import type { DocumentoPacoteLinha, OportunidadeFechamento, TipoProduto } from "@/lib/vendas/oportunidades";
import type { PessoaCompleta } from "@/lib/vendas/pessoas";
import type { EventoTimeline } from "@/lib/vendas/timeline";
import {
  buscarStatusAssinaturaAction,
  buscarStatusCobrancasAction,
  cancelarVendaDetalhesAction,
  gerarUrlDownloadContratoAction,
  marcarComissaoRecebidaAction,
  reenviarLinkAction,
  tentarNovamenteAction,
} from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const cardBase = "rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900";
const botaoSecundario =
  "rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

const TIPO_PRODUTO_LABEL: Record<TipoProduto, string> = {
  proprio: "Próprio",
  subcontratado: "Subcontratado",
  comissionado: "Comissionado",
};
// Record<FormaPagamento/MetodoPagamento, string> em vez de Record<string, string> — tipagem
// exaustiva de propósito (achado real registrado em docs/status/vendas.md: um Record<string,string>
// sem exaustividade em emissao-contrato.ts ficou como Minor pendente; aqui já nasce corrigido).
const FORMA_PAGAMENTO_LABEL: Record<FormaPagamento, string> = { avista: "À vista", parcelado: "Parcelado" };
const METODO_PAGAMENTO_LABEL: Record<MetodoPagamento, string> = { boleto_pix: "Boleto/Pix", cartao: "Cartão de crédito" };

function formatarValor(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(data: string): string {
  return new Date(data).toLocaleDateString("pt-BR");
}

const DESCRICAO_ESTAGIO: Record<StatusContrato, string> = {
  nova_oportunidade: "Registro criado — o sistema ainda vai tentar gerar o contrato automaticamente.",
  emitindo_contrato: "Gerando o PDF e enviando pra assinatura eletrônica — automático.",
  aguardando_assinaturas: "Esperando as partes assinarem o contrato.",
  aguardando_pagamento: "Esperando o cliente pagar a 1ª parcela.",
  concluida: "1ª parcela paga — venda concluída.",
  cancelada: "Venda cancelada.",
};

const BADGE_STATUS_PARCELA: Record<string, string> = {
  previsto: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  gerado: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  pago: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  atrasado: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  cancelado: "bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800 dark:text-zinc-500",
};

const BADGE_STATUS_COMISSAO: Record<string, string> = {
  previsto: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  recebido: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
};

function BadgeStatus({ status, mapa, texto }: { status: string; mapa: Record<string, string>; texto: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${mapa[status] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
      {texto}
    </span>
  );
}

function formatarEndereco(endereco: EnderecoPessoa | null): string | null {
  if (!endereco) return null;
  const partes = [
    endereco.logradouro ? `${endereco.logradouro}${endereco.numero ? `, ${endereco.numero}` : ""}` : null,
    endereco.complemento || null,
    endereco.bairro || null,
    endereco.cidade && endereco.uf ? `${endereco.cidade}/${endereco.uf}` : null,
    endereco.cep ? formatarCep(endereco.cep) : null,
  ].filter((parte): parte is string => Boolean(parte));
  return partes.length > 0 ? partes.join(" — ") : null;
}

function LinkCopiavel({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(link);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
      className={botaoSecundario}
    >
      {copiado ? "Copiado!" : "Copiar link"}
    </button>
  );
}

function BotoesReenvio({
  pessoaId,
  contexto,
  link,
  mostrarCopiar = true,
}: {
  pessoaId: string;
  contexto: "assinatura" | "pagamento";
  link: string;
  /** false quando quem chama já colocou um LinkCopiavel próprio ao lado (evita botão duplicado —
   * caso da linha de parcela, que já tem Ver+Copiar antes deste grupo). */
  mostrarCopiar?: boolean;
}) {
  const [enviando, setEnviando] = useState<"whatsapp" | "email" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<"whatsapp" | "email" | null>(null);

  async function enviar(canal: "whatsapp" | "email") {
    setEnviando(canal);
    setErro(null);
    const resultado = await reenviarLinkAction(pessoaId, canal, contexto, link);
    setEnviando(null);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setEnviado(canal);
    setTimeout(() => setEnviado(null), 2500);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => enviar("whatsapp")} disabled={enviando !== null} className={botaoSecundario}>
        {enviando === "whatsapp" ? "Enviando..." : enviado === "whatsapp" ? "Enviado!" : "💬 WhatsApp"}
      </button>
      <button type="button" onClick={() => enviar("email")} disabled={enviando !== null} className={botaoSecundario}>
        {enviando === "email" ? "Enviando..." : enviado === "email" ? "Enviado!" : "✉️ E-mail"}
      </button>
      {mostrarCopiar && <LinkCopiavel link={link} />}
      {erro && <p className="w-full text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}

function BotaoBaixarPdf({ contratoId }: { contratoId: string }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar() {
    setCarregando(true);
    setErro(null);
    const resultado = await gerarUrlDownloadContratoAction(contratoId);
    setCarregando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    window.location.href = resultado.url;
  }

  return (
    <>
      <button type="button" onClick={baixar} disabled={carregando} className={botaoSecundario} title="Baixa o arquivo PDF do contrato pro seu computador">
        {carregando ? "Preparando..." : "⬇️ Baixar"}
      </button>
      {erro && <p className="w-full text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </>
  );
}

function BotoesPdfContrato({ contratoId, pdfUrl }: { contratoId: string; pdfUrl: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <a href={pdfUrl} target="_blank" rel="noreferrer" className={botaoSecundario} title="Abre o PDF do contrato numa nova aba">
        👁️ Ver
      </a>
      <BotaoBaixarPdf contratoId={contratoId} />
      <LinkCopiavel link={pdfUrl} />
    </div>
  );
}

function LinhaDado({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <p className="text-sm text-zinc-600 dark:text-zinc-400">
      <span className="text-zinc-900 dark:text-zinc-50">{rotulo}:</span> {valor && valor.trim() ? valor : "não informado"}
    </p>
  );
}

function CardDadosCliente({ pessoa, endereco }: { pessoa: PessoaCompleta; endereco: EnderecoPessoa | null }) {
  return (
    <div className={cardBase}>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        <span aria-hidden="true">👤</span> Dados do Cliente
      </h3>
      <div className="mt-2 space-y-1">
        <LinhaDado rotulo="Nome/Razão social" valor={pessoa.nomeRazaoSocial} />
        <LinhaDado rotulo="Documento" valor={formatarCpfCnpj(pessoa.documento)} />
        <LinhaDado rotulo="Tipo" valor={pessoa.tipoPessoa === "pf" ? "Pessoa Física" : "Pessoa Jurídica"} />
        <LinhaDado rotulo="E-mail" valor={pessoa.email} />
        <LinhaDado rotulo="WhatsApp" valor={pessoa.whatsapp ? formatarTelefone(pessoa.whatsapp) : null} />
        <LinhaDado rotulo="Endereço" valor={formatarEndereco(endereco)} />
        {pessoa.tipoPessoa === "pf" && (
          <>
            <LinhaDado rotulo="RG" valor={pessoa.rg} />
            <LinhaDado rotulo="Estado civil" valor={pessoa.estadoCivil} />
            <LinhaDado rotulo="Profissão" valor={pessoa.profissao} />
          </>
        )}
      </div>
    </div>
  );
}

function CardDadosDaVenda({
  oportunidade,
  fornecedor,
  template,
  ehComissionado,
  documentosPacote,
}: {
  oportunidade: OportunidadeFechamento;
  fornecedor: PessoaCompleta | null;
  template: TemplateDocumentoCompleto | null;
  ehComissionado: boolean;
  documentosPacote: DocumentoPacoteLinha[];
}) {
  return (
    <div className={cardBase}>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        <span aria-hidden="true">🧾</span> Dados da Venda
      </h3>
      <div className="mt-2 space-y-1">
        <LinhaDado rotulo="Produto" valor={oportunidade.produtoNome} />
        <LinhaDado rotulo="Tipo" valor={TIPO_PRODUTO_LABEL[oportunidade.produtoTipo]} />
        <LinhaDado rotulo="Fornecedor" valor={fornecedor?.nomeRazaoSocial ?? null} />
        <LinhaDado
          rotulo="Template do contrato"
          valor={ehComissionado ? "não se aplica (venda comissionada)" : (template?.nome ?? "nenhum template ativo pra este produto")}
        />
      </div>
      {/* Pacote de documentos é dado do serviço contratado (produtos.exige_lista_documentos), não
          da venda em si — fica aninhado aqui em vez de ser um card próprio (pedido do Luiz,
          20/08/2026). */}
      {documentosPacote.length > 0 && (
        <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span aria-hidden="true">📎</span> Documentos do pacote (nomes cobertos pelo contrato)
          </p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="py-1">Documento</th>
                <th className="py-1">Nome/Razão social</th>
              </tr>
            </thead>
            <tbody>
              {documentosPacote.map((d) => (
                <tr key={d.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-1">{formatarCpfCnpj(d.documento)}</td>
                  <td className="py-1">{d.nomeRazaoSocial}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type ParteContrato = { papel: string; nome: string; email: string | null };

function montarPartes(
  pessoa: PessoaCompleta,
  representante: PessoaCompleta | null,
  pessoaArrudaCred: PessoaCompleta | null,
): ParteContrato[] {
  const partes: ParteContrato[] = [{ papel: "Cliente", nome: pessoa.nomeRazaoSocial, email: pessoa.email }];
  if (representante) partes.push({ papel: "Representante legal", nome: representante.nomeRazaoSocial, email: representante.email });
  if (pessoaArrudaCred) partes.push({ papel: "Signatário ArrudaCred", nome: pessoaArrudaCred.nomeRazaoSocial, email: pessoaArrudaCred.email });
  return partes;
}

function CardPartesDoContrato({
  contrato,
  pessoa,
  representante,
  pessoaArrudaCred,
}: {
  contrato: Contrato;
  pessoa: PessoaCompleta;
  representante: PessoaCompleta | null;
  pessoaArrudaCred: PessoaCompleta | null;
}) {
  const [documento, setDocumento] = useState<AssinafyDocumento | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const partes = montarPartes(pessoa, representante, pessoaArrudaCred);

  async function verificar() {
    if (!contrato.assinafyDocumentId) return;
    setCarregando(true);
    setErro(null);
    const resultado = await buscarStatusAssinaturaAction(contrato.assinafyDocumentId);
    setCarregando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setDocumento(resultado.documento);
  }

  function statusDaParte(email: string | null): AssinafySignatarioStatus | null {
    if (!documento || !email) return null;
    return documento.signatarios.find((s) => s.email === email) ?? null;
  }

  const aguardandoAssinatura = contrato.status === "aguardando_assinaturas";

  return (
    <div className={aguardandoAssinatura ? `${cardBase} border-l-4 border-l-amber-400 dark:border-l-amber-500` : cardBase}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          <span aria-hidden="true">✍️</span> Partes do Contrato
        </h3>
        {contrato.assinafyDocumentId && (
          <button
            type="button"
            onClick={verificar}
            disabled={carregando}
            className={botaoSecundario}
            title="Consulta o status exato na Assinafy neste instante — o texto abaixo é só o que já estava salvo no banco"
          >
            {carregando ? "Verificando..." : "Verificar assinaturas agora"}
          </button>
        )}
      </div>
      {!contrato.assinafyDocumentId && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Aguardando emissão do contrato.</p>
      )}
      {contrato.assinafyDocumentId && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Estágio salvo no banco: {contrato.assinafyDocumentStatus ?? "ainda não sincronizado"}. Clique em &quot;Verificar&quot; pra ver o
          status exato na Assinafy neste instante.
        </p>
      )}
      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <ul className="mt-3 space-y-3">
        {partes.map((parte) => {
          const status = statusDaParte(parte.email);
          return (
            <li key={parte.papel} className="rounded border border-zinc-200 p-2 text-sm dark:border-zinc-700">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{parte.papel}</p>
              <p className="text-zinc-900 dark:text-zinc-50">
                {parte.nome} {parte.email && <span className="text-xs text-zinc-500 dark:text-zinc-400">({parte.email})</span>}
              </p>
              {status && (
                <p className={status.completo ? "text-xs text-emerald-600 dark:text-emerald-400" : "text-xs text-amber-600 dark:text-amber-400"}>
                  {status.completo ? "Já assinou" : "Ainda não assinou"}
                </p>
              )}
              {/* Reenvio só pro cliente — o signatário da ArrudaCred não tem pessoaId conhecido aqui
                  (é o id do signatário na Assinafy, não um pessoas.id nosso), e não faz sentido
                  reenviar por WhatsApp/e-mail pra alguém da própria equipe. */}
              {status && !status.completo && status.url && parte.email === pessoa.email && (
                <div className="mt-2">
                  <BotoesReenvio pessoaId={pessoa.id} contexto="assinatura" link={status.url} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CardFinanceiro({ contrato, pessoa }: { contrato: Contrato; pessoa: PessoaCompleta }) {
  const [status, setStatus] = useState<Map<string, CobrancaStatus>>(new Map());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const parcelasComCobranca = contrato.parcelas.filter((p) => p.status !== "previsto");
  const temAtraso = contrato.parcelas.some((p) => p.status === "atrasado");

  async function verificar() {
    setCarregando(true);
    setErro(null);
    const ids = parcelasComCobranca.map((p) => p.id);
    const resultado = await buscarStatusCobrancasAction(ids);
    setCarregando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    const mapa = new Map<string, CobrancaStatus>();
    resultado.cobrancas.forEach((c, i) => mapa.set(ids[i], c));
    setStatus(mapa);
  }

  return (
    <div className={temAtraso ? `${cardBase} border-l-4 border-l-red-400 dark:border-l-red-500` : cardBase}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          <span aria-hidden="true">💰</span> Financeiro
        </h3>
        <button
          type="button"
          onClick={verificar}
          disabled={carregando || parcelasComCobranca.length === 0}
          className={botaoSecundario}
          title="Consulta o status exato na Asaas neste instante — a tabela abaixo é só o que já estava salvo no banco"
        >
          {carregando ? "Verificando..." : "Verificar cobranças agora"}
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {contrato.formaPagamento ? FORMA_PAGAMENTO_LABEL[contrato.formaPagamento] : "—"} —{" "}
        {contrato.metodoPagamento ? METODO_PAGAMENTO_LABEL[contrato.metodoPagamento] : "—"} — valor total {formatarValor(contrato.valorTotal)}
      </p>
      {parcelasComCobranca.length === 0 && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Ainda não há cobrança gerada na Asaas.</p>
      )}
      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <th className="py-1">Parcela</th>
            <th className="py-1">Vencimento</th>
            <th className="py-1">Valor</th>
            <th className="py-1">Status</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {contrato.parcelas.map((parcela: ContratoParcela) => {
            const cobranca = status.get(parcela.id);
            return (
              <tr key={parcela.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="py-1">{parcela.numero}</td>
                <td className="py-1">{formatarData(parcela.vencimentoPrevisto)}</td>
                <td className="py-1">{formatarValor(parcela.valor)}</td>
                <td className="py-1">
                  <BadgeStatus status={parcela.status} mapa={BADGE_STATUS_PARCELA} texto={cobranca ? `${parcela.status} (Asaas: ${cobranca.status})` : parcela.status} />
                </td>
                <td className="py-1">
                  {cobranca && (
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={cobranca.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={botaoSecundario}
                        title="Abre o link do boleto/Pix ou do checkout do cartão"
                      >
                        👁️ Ver
                      </a>
                      <LinkCopiavel link={cobranca.invoiceUrl} />
                      {parcela.status !== "pago" && (
                        <BotoesReenvio pessoaId={pessoa.id} contexto="pagamento" link={cobranca.invoiceUrl} mostrarCopiar={false} />
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PainelComissoes({ comissoes, onMudou }: { comissoes: ComissaoFornecedor[]; onMudou: () => void }) {
  const [processando, setProcessando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function marcarRecebida(id: string) {
    setProcessando(id);
    setErro(null);
    const resultado = await marcarComissaoRecebidaAction(id, new Date().toISOString());
    setProcessando(null);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onMudou();
  }

  return (
    <div className={cardBase}>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        <span aria-hidden="true">🏭</span> Comissão do fornecedor
      </h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Sem link de pagamento aqui — quem paga é o fornecedor pra ArrudaCred. Marque manualmente quando o valor cair.
      </p>
      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <th className="py-1">Parcela</th>
            <th className="py-1">Previsão</th>
            <th className="py-1">Valor</th>
            <th className="py-1">Status</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {comissoes.map((c) => (
            <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-800">
              <td className="py-1">{c.numero}</td>
              <td className="py-1">{formatarData(c.dataPrevista)}</td>
              <td className="py-1">{formatarValor(c.valor)}</td>
              <td className="py-1">
                <BadgeStatus
                  status={c.status}
                  mapa={BADGE_STATUS_COMISSAO}
                  texto={c.status === "recebido" ? `Recebida em ${formatarData(c.recebidoEm!)}` : "Prevista"}
                />
              </td>
              <td className="py-1">
                {c.status === "previsto" && (
                  <button type="button" onClick={() => marcarRecebida(c.id)} disabled={processando === c.id} className={botaoSecundario}>
                    {processando === c.id ? "Marcando..." : "Marcar recebida"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BotaoCancelar({ contratoId, onCancelado }: { contratoId: string; onCancelado: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    if (!motivo.trim()) {
      setErro("Descreva o motivo do cancelamento.");
      return;
    }
    setEnviando(true);
    const resultado = await cancelarVendaDetalhesAction(contratoId, motivo.trim());
    setEnviando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onCancelado();
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-full border border-amber-300 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
      >
        Cancelar venda
      </button>
    );
  }

  return (
    <div className="space-y-1 rounded border border-amber-300 p-2 dark:border-amber-700">
      <label className="text-xs text-zinc-600 dark:text-zinc-400">Motivo do cancelamento</label>
      <input className={campo} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente desistiu antes de assinar" />
      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <button type="button" onClick={confirmar} disabled={enviando} className="text-xs font-medium text-amber-700 dark:text-amber-400">
        {enviando ? "Cancelando..." : "Confirmar cancelamento"}
      </button>
    </div>
  );
}

function PainelErroTentativas({ contrato, onTentou }: { contrato: Contrato; onTentou: () => void }) {
  const [tentando, setTentando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function tentar() {
    setTentando(true);
    setErro(null);
    const resultado = await tentarNovamenteAction(contrato.id);
    setTentando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onTentou();
  }

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm dark:border-red-700 dark:bg-red-950">
      <p className="text-red-700 dark:text-red-400">{contrato.ultimoErro}</p>
      {/* Não existe retentativa automática de verdade hoje (só uma tentativa por etapa, ver
         progressao.ts) — então qualquer erro já é candidato a retentativa manual, não só depois de
         3 falhas (achado real da revisão final da branch: com o gate >= 3, um contrato com 1 erro
         ficava preso pra sempre, sem essa ação nem aparecer). */}
      <button
        type="button"
        onClick={tentar}
        disabled={tentando}
        className="mt-2 text-xs font-medium text-red-700 underline dark:text-red-400"
      >
        {tentando ? "Tentando..." : "Tentar novamente"}
      </button>
      {erro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}

type Props = {
  oportunidade: OportunidadeFechamento;
  pessoa: PessoaCompleta;
  contrato: Contrato | null;
  timeline: EventoTimeline[];
  comissoes: ComissaoFornecedor[];
  pdfUrlAssinada: string | null;
  enderecoCliente: EnderecoPessoa | null;
  pessoaArrudaCred: PessoaCompleta | null;
  representante: PessoaCompleta | null;
  fornecedor: PessoaCompleta | null;
  template: TemplateDocumentoCompleto | null;
  documentosPacote: DocumentoPacoteLinha[];
};

export function DetalhesVendaClient({
  oportunidade,
  pessoa,
  contrato,
  timeline,
  comissoes,
  pdfUrlAssinada,
  enderecoCliente,
  pessoaArrudaCred,
  representante,
  fornecedor,
  template,
  documentosPacote,
}: Props) {
  function recarregarPagina() {
    window.location.reload();
  }

  const ehComissionado = oportunidade.produtoTipo === "comissionado";

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {pessoa.nomeRazaoSocial} <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">({formatarCpfCnpj(pessoa.documento)})</span>
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {oportunidade.produtoNome} — {formatarValor(oportunidade.valorEstimado)}
          </p>
        </div>
        <Link href="/admin/vendas" className="text-xs text-zinc-500 underline dark:text-zinc-400">
          ← Painel de Vendas
        </Link>
      </div>

      {!contrato && (
        <div className={cardBase}>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Essa venda ainda não foi registrada.</p>
          <Link
            href={
              ehComissionado
                ? `/admin/vendas/${oportunidade.id}/confirmar-comissionada`
                : `/admin/vendas/${oportunidade.id}/fechamento`
            }
            className="mt-2 inline-block rounded-full bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            {ehComissionado ? "Confirmar venda" : "Ir para Fechamento de Venda"}
          </Link>
        </div>
      )}

      {contrato && (
        <>
          {contrato.ultimoErro && <PainelErroTentativas contrato={contrato} onTentou={recarregarPagina} />}

          <div className={cardBase}>
            <div className="flex items-center justify-between">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: corEstagio(contrato.status) }}
                title={DESCRICAO_ESTAGIO[contrato.status]}
              >
                {rotuloEstagio(contrato.status)}
              </span>
              {contrato.status !== "cancelada" && contrato.status !== "concluida" && (
                <BotaoCancelar contratoId={contrato.id} onCancelado={recarregarPagina} />
              )}
            </div>
            {pdfUrlAssinada && <BotoesPdfContrato contratoId={contrato.id} pdfUrl={pdfUrlAssinada} />}
            {contrato.status === "cancelada" && contrato.motivoCancelamento && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Motivo: {contrato.motivoCancelamento}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CardDadosCliente pessoa={pessoa} endereco={enderecoCliente} />
            <CardDadosDaVenda
              oportunidade={oportunidade}
              fornecedor={fornecedor}
              template={template}
              ehComissionado={ehComissionado}
              documentosPacote={documentosPacote}
            />

            {!ehComissionado && (
              <div className="md:col-span-2">
                <CardPartesDoContrato contrato={contrato} pessoa={pessoa} representante={representante} pessoaArrudaCred={pessoaArrudaCred} />
              </div>
            )}

            {!ehComissionado && (
              <div className="md:col-span-2">
                <CardFinanceiro contrato={contrato} pessoa={pessoa} />
              </div>
            )}

            {ehComissionado && comissoes.length > 0 && (
              <div className="md:col-span-2">
                <PainelComissoes comissoes={comissoes} onMudou={recarregarPagina} />
              </div>
            )}
          </div>

          {timeline.length > 0 && (
            <div className={cardBase}>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                <span aria-hidden="true">🕘</span> Histórico
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                {timeline.map((evento, i) => (
                  <li key={i}>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatarData(evento.data)}</span> — {evento.texto}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
