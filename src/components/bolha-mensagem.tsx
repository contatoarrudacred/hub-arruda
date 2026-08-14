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
          {/* eslint-disable-next-line @next/next/no-img-element -- URL arbitrária de conteúdo editado pelo admin, não é asset do projeto */}
          <img
            src={mensagem.midia_url}
            alt={mensagem.legenda ?? "Imagem"}
            className="max-w-full rounded-lg"
          />
          {mensagem.legenda && <p className="whitespace-pre-wrap">{mensagem.legenda}</p>}
        </div>
      );
    case "video":
      return (
        <div className="space-y-1">
          <video controls src={mensagem.midia_url} className="max-w-full rounded-lg" />
          {mensagem.legenda && <p className="whitespace-pre-wrap">{mensagem.legenda}</p>}
        </div>
      );
    case "audio":
      return (
        <div className="space-y-1">
          <audio controls src={mensagem.midia_url} className="max-w-full" />
          {mensagem.legenda && <p className="whitespace-pre-wrap">{mensagem.legenda}</p>}
        </div>
      );
    case "documento":
      return (
        <a
          href={mensagem.midia_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 underline"
        >
          📄 {mensagem.legenda ?? "Documento"}
        </a>
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
