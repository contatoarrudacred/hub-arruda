"use client";

import { useState } from "react";
import type { StatusWebhookAssinafy } from "@/lib/assinafy/cliente";
import { buscarStatusWebhookAssinafyAction, configurarWebhookAssinafyAction } from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

const EVENTOS_ESPERADOS = ["document_ready", "signer_rejected_document"];

function StatusAtual({ status, erro }: { status: StatusWebhookAssinafy | null | undefined; erro: string | null }) {
  if (erro) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
        Não consegui consultar o status agora: {erro}
      </div>
    );
  }

  if (status === undefined) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Consultando status atual na Assinafy...</p>;
  }

  if (status === null) {
    return (
      <div className="rounded-lg border border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        Nenhuma assinatura de webhook cadastrada ainda na Assinafy — clique em &quot;Configurar webhook&quot; abaixo.
      </div>
    );
  }

  const eventosFaltando = EVENTOS_ESPERADOS.filter((e) => !status.events.includes(e));
  const tudoCerto = status.ativo && eventosFaltando.length === 0;

  return (
    <div
      className={`space-y-1 rounded-lg border p-3 text-sm ${
        tudoCerto
          ? "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
          : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
      }`}
    >
      <p className="font-medium">{tudoCerto ? "✅ Webhook configurado corretamente" : "⚠ Webhook cadastrado, mas incompleto"}</p>
      <p>
        Ativo: <strong>{status.ativo ? "sim" : "não"}</strong>
      </p>
      <p>
        Eventos: <strong>{status.events.join(", ") || "nenhum"}</strong>
        {eventosFaltando.length > 0 && <span> — faltando: {eventosFaltando.join(", ")}</span>}
      </p>
      <p className="break-all">
        URL: <code>{status.url}</code>
      </p>
      <p>E-mail: {status.email}</p>
      <p className="text-xs opacity-80">Atualizado em: {new Date(status.atualizadoEm).toLocaleString("pt-BR")}</p>
    </div>
  );
}

export function AssinafyWebhookClient({
  statusInicial,
  erroInicial,
}: {
  statusInicial: StatusWebhookAssinafy | null;
  erroInicial: string | null;
}) {
  const [email, setEmail] = useState("lhdoria2011@gmail.com");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ sucesso: boolean; mensagem: string } | null>(null);
  const [status, setStatus] = useState<StatusWebhookAssinafy | null | undefined>(statusInicial);
  const [erroStatus, setErroStatus] = useState<string | null>(erroInicial);

  async function consultarStatus() {
    setErroStatus(null);
    const resposta = await buscarStatusWebhookAssinafyAction();
    if (!resposta.sucesso) {
      setErroStatus(resposta.erro);
      return;
    }
    setStatus(resposta.status);
  }

  async function configurar() {
    setEnviando(true);
    setResultado(null);
    const resposta = await configurarWebhookAssinafyAction(email);
    setEnviando(false);
    setResultado(
      resposta.sucesso
        ? { sucesso: true, mensagem: `Webhook configurado com sucesso, apontando pra ${resposta.url}` }
        : { sucesso: false, mensagem: resposta.erro },
    );
    if (resposta.sucesso) await consultarStatus();
  }

  return (
    <div className="max-w-xl space-y-4 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Configurar webhook da Assinafy</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Ação de configuração única (setup) — registra na Assinafy a URL que deve avisar o sistema quando um
          documento for assinado (<code>document_ready</code>) ou recusado (<code>signer_rejected_document</code>).
          Sem isso, o card fica preso em &quot;Aguardando Assinaturas&quot; pra sempre, mesmo depois de assinado.
        </p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Status atual (consultado agora na Assinafy)</h2>
          <button type="button" onClick={consultarStatus} className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
            Atualizar
          </button>
        </div>
        <StatusAtual status={status} erro={erroStatus} />
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
        Pré-requisito: <code>ASSINAFY_WEBHOOK_SECRET</code> precisa estar configurada no Vercel antes de clicar
        — é um valor que a gente mesmo inventa (a Assinafy não fornece um), tem que ser o mesmo dos dois lados.
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          E-mail que recebe avisos sobre o webhook (exigido pela Assinafy)
        </label>
        <input className={campo} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <button
        type="button"
        onClick={configurar}
        disabled={enviando}
        className="rounded-full bg-zinc-900 px-5 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {enviando ? "Configurando..." : "Configurar webhook"}
      </button>

      {resultado && (
        <p className={`text-sm ${resultado.sucesso ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          {resultado.mensagem}
        </p>
      )}
    </div>
  );
}
