"use client";

import type { MensagemEtapa } from "@/lib/motor-fluxo/tipos";

// Renderiza uma MensagemEtapa como bolha de chat — usado tanto no simulador (/simulador) quanto na
// prévia ao vivo do editor de fluxo (/admin/fluxos/[fluxoId]), pra nunca desalinhar como uma
// mensagem "realmente aparece" entre as duas telas.
export function BolhaMensagem({ mensagem }: { mensagem: MensagemEtapa }) {
  switch (mensagem.tipo) {
    case "texto":
      return <p className="whitespace-pre-wrap">{mensagem.texto}</p>;
    case "imagem":
      return (
        <div className="space-y-1">
          {mensagem.midia_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL arbitrária de conteúdo editado pelo admin, não é asset do projeto
            <img
              src={mensagem.midia_url}
              alt={mensagem.legenda ?? "Imagem"}
              className="max-w-full rounded-lg"
            />
          ) : (
            <MidiaPendente rotulo="Nenhuma imagem enviada ainda" />
          )}
          {mensagem.legenda && <p className="whitespace-pre-wrap">{mensagem.legenda}</p>}
        </div>
      );
    case "video":
      return (
        <div className="space-y-1">
          {mensagem.midia_url ? (
            <video controls src={mensagem.midia_url} className="max-w-full rounded-lg" />
          ) : (
            <MidiaPendente rotulo="Nenhum vídeo enviado ainda" />
          )}
          {mensagem.legenda && <p className="whitespace-pre-wrap">{mensagem.legenda}</p>}
        </div>
      );
    case "audio":
      return (
        <div className="space-y-1">
          {mensagem.midia_url ? (
            <audio controls src={mensagem.midia_url} className="max-w-full" />
          ) : (
            <MidiaPendente rotulo="Nenhum áudio enviado ainda" />
          )}
          {mensagem.legenda && <p className="whitespace-pre-wrap">{mensagem.legenda}</p>}
        </div>
      );
    case "documento":
      return mensagem.midia_url ? (
        <a
          href={mensagem.midia_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 underline"
        >
          📄 {mensagem.legenda ?? "Documento"}
        </a>
      ) : (
        <MidiaPendente rotulo={`📄 ${mensagem.legenda ?? "Nenhum documento enviado ainda"}`} />
      );
    case "localizacao":
      return (
        <div className="space-y-0.5">
          <p>📍 {mensagem.nome ?? "Localização"}</p>
          {mensagem.endereco && <p className="text-xs opacity-80">{mensagem.endereco}</p>}
          <p className="text-xs opacity-60">
            {mensagem.latitude}, {mensagem.longitude}
          </p>
        </div>
      );
    case "contato":
      return (
        <p>
          👤 {mensagem.nome} — {mensagem.telefone}
        </p>
      );
    case "pix":
      return (
        <div className="space-y-0.5">
          <p>💠 Pix ({mensagem.tipo_chave})</p>
          <p className="font-mono text-xs">{mensagem.chave}</p>
          {mensagem.nome_beneficiario && (
            <p className="text-xs opacity-80">{mensagem.nome_beneficiario}</p>
          )}
        </div>
      );
  }
}

function MidiaPendente({ rotulo }: { rotulo: string }) {
  return (
    <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
      {rotulo}
    </p>
  );
}
