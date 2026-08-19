"use client";

import Link from "next/link";
import { useState } from "react";
import type { AssinafyDocumento, AssinafySignatarioStatus } from "@/lib/assinafy/cliente";
import type { CobrancaStatus } from "@/lib/asaas/cliente";
import type { ComissaoFornecedor } from "@/lib/vendas/comissoes";
import type { Contrato, ContratoParcela } from "@/lib/vendas/contratos";
import { corEstagio, rotuloEstagio } from "@/lib/vendas/estagio-venda";
import { formatarCpfCnpj } from "@/lib/vendas/mascaras";
import type { OportunidadeFechamento } from "@/lib/vendas/oportunidades";
import type { PessoaCompleta } from "@/lib/vendas/pessoas";
import type { EventoTimeline } from "@/lib/vendas/timeline";
import {
  buscarStatusAssinaturaAction,
  buscarStatusCobrancasAction,
  cancelarVendaDetalhesAction,
  marcarComissaoRecebidaAction,
  reenviarLinkAction,
} from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const cardBase = "rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900";
const botaoSecundario =
  "rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

function formatarValor(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(data: string): string {
  return new Date(data).toLocaleDateString("pt-BR");
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
}: {
  pessoaId: string;
  contexto: "assinatura" | "pagamento";
  link: string;
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
        {enviando === "whatsapp" ? "Enviando..." : enviado === "whatsapp" ? "Enviado!" : "WhatsApp"}
      </button>
      <button type="button" onClick={() => enviar("email")} disabled={enviando !== null} className={botaoSecundario}>
        {enviando === "email" ? "Enviando..." : enviado === "email" ? "Enviado!" : "E-mail"}
      </button>
      <LinkCopiavel link={link} />
      {erro && <p className="w-full text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}

function PainelAssinatura({ contrato, pessoa }: { contrato: Contrato; pessoa: PessoaCompleta }) {
  const [documento, setDocumento] = useState<AssinafyDocumento | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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

  return (
    <div className={cardBase}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Assinatura eletrônica</h3>
        <button type="button" onClick={verificar} disabled={carregando} className={botaoSecundario}>
          {carregando ? "Verificando..." : "Verificar assinaturas agora"}
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Estágio salvo no banco: {contrato.assinafyDocumentStatus ?? "ainda não sincronizado"}. Clique em &quot;Verificar&quot; pra ver o
        status exato na Assinafy neste instante.
      </p>
      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      {documento && (
        <ul className="mt-3 space-y-3">
          {documento.signatarios.map((signatario: AssinafySignatarioStatus) => (
            <li key={signatario.id} className="rounded border border-zinc-200 p-2 text-sm dark:border-zinc-700">
              <p className="text-zinc-900 dark:text-zinc-50">
                {signatario.nome} <span className="text-xs text-zinc-500 dark:text-zinc-400">({signatario.email})</span>
              </p>
              <p className={signatario.completo ? "text-xs text-emerald-600 dark:text-emerald-400" : "text-xs text-amber-600 dark:text-amber-400"}>
                {signatario.completo ? "Já assinou" : "Ainda não assinou"}
              </p>
              {/* Reenvio só pro cliente — o signatário da ArrudaCred não tem pessoaId conhecido aqui
                  (é o id do signatário na Assinafy, não um pessoas.id nosso), e não faz sentido
                  reenviar por WhatsApp/e-mail pra alguém da própria equipe. */}
              {!signatario.completo && signatario.url && signatario.email === pessoa.email && (
                <div className="mt-2">
                  <BotoesReenvio pessoaId={pessoa.id} contexto="assinatura" link={signatario.url} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PainelParcelasCliente({ contrato, pessoa }: { contrato: Contrato; pessoa: PessoaCompleta }) {
  const [status, setStatus] = useState<Map<string, CobrancaStatus>>(new Map());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const parcelasComCobranca = contrato.parcelas.filter((p) => p.status !== "previsto");

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
    <div className={cardBase}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Parcelas</h3>
        <button type="button" onClick={verificar} disabled={carregando} className={botaoSecundario}>
          {carregando ? "Verificando..." : "Verificar cobranças agora"}
        </button>
      </div>
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
                <td className="py-1">{cobranca ? `${parcela.status} (Asaas: ${cobranca.status})` : parcela.status}</td>
                <td className="py-1">
                  {cobranca && parcela.status !== "pago" && (
                    <BotoesReenvio pessoaId={pessoa.id} contexto="pagamento" link={cobranca.invoiceUrl} />
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
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Comissão do fornecedor</h3>
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
              <td className="py-1">{c.status === "recebido" ? `Recebida em ${formatarData(c.recebidoEm!)}` : "Prevista"}</td>
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

type Props = {
  oportunidade: OportunidadeFechamento;
  pessoa: PessoaCompleta;
  contrato: Contrato | null;
  timeline: EventoTimeline[];
  comissoes: ComissaoFornecedor[];
  pdfUrlAssinada: string | null;
};

export function DetalhesVendaClient({ oportunidade, pessoa, contrato, timeline, comissoes, pdfUrlAssinada }: Props) {
  function recarregarPagina() {
    window.location.reload();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
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
              oportunidade.produtoTipo === "comissionado"
                ? `/admin/vendas/${oportunidade.id}/confirmar-comissionada`
                : `/admin/vendas/${oportunidade.id}/fechamento`
            }
            className="mt-2 inline-block rounded-full bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            {oportunidade.produtoTipo === "comissionado" ? "Confirmar venda" : "Ir para Fechamento de Venda"}
          </Link>
        </div>
      )}

      {contrato && (
        <>
          <div className={cardBase}>
            <div className="flex items-center justify-between">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: corEstagio(contrato.status) }}
              >
                {rotuloEstagio(contrato.status)}
              </span>
              {contrato.status !== "cancelada" && contrato.status !== "concluida" && (
                <BotaoCancelar contratoId={contrato.id} onCancelado={recarregarPagina} />
              )}
            </div>
            {pdfUrlAssinada && (
              <a href={pdfUrlAssinada} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-zinc-900 underline dark:text-zinc-50">
                Ver PDF do contrato
              </a>
            )}
            {contrato.status === "cancelada" && contrato.motivoCancelamento && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Motivo: {contrato.motivoCancelamento}</p>
            )}
          </div>

          {contrato.status === "aguardando_assinaturas" && <PainelAssinatura contrato={contrato} pessoa={pessoa} />}

          {(contrato.status === "aguardando_pagamento" || contrato.status === "concluida") &&
            oportunidade.produtoTipo !== "comissionado" && <PainelParcelasCliente contrato={contrato} pessoa={pessoa} />}

          {oportunidade.produtoTipo === "comissionado" && comissoes.length > 0 && (
            <PainelComissoes comissoes={comissoes} onMudou={recarregarPagina} />
          )}

          {timeline.length > 0 && (
            <div className={cardBase}>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Histórico</h3>
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
