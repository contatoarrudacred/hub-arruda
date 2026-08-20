"use client";

import { useState } from "react";
import { configurarWebhookAssinafyAction } from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

export function AssinafyWebhookClient() {
  const [email, setEmail] = useState("lhdoria2011@gmail.com");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ sucesso: boolean; mensagem: string } | null>(null);

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
