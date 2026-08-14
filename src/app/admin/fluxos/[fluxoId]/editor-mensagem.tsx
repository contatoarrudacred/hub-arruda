"use client";

import type { MensagemEtapa } from "@/lib/motor-fluxo/tipos";

const ROTULO_TIPO: Record<MensagemEtapa["tipo"], string> = {
  texto: "Texto",
  imagem: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  documento: "Documento",
  localizacao: "Localização",
  contato: "Contato",
  pix: "Pix",
};

function criarMensagemPadrao(tipo: MensagemEtapa["tipo"]): MensagemEtapa {
  switch (tipo) {
    case "texto":
      return { tipo: "texto", texto: "" };
    case "imagem":
    case "audio":
    case "video":
    case "documento":
      return { tipo, midia_url: "" };
    case "localizacao":
      return { tipo: "localizacao", latitude: 0, longitude: 0 };
    case "contato":
      return { tipo: "contato", nome: "", telefone: "" };
    case "pix":
      return { tipo: "pix", chave: "", tipo_chave: "cpf" };
  }
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs text-zinc-500 dark:text-zinc-400";

export function EditorMensagem({
  mensagem,
  onChange,
  onRemover,
}: {
  mensagem: MensagemEtapa;
  onChange: (m: MensagemEtapa) => void;
  onRemover: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      <div className="flex items-center justify-between">
        <select
          className={campo + " w-auto"}
          value={mensagem.tipo}
          onChange={(e) => onChange(criarMensagemPadrao(e.target.value as MensagemEtapa["tipo"]))}
        >
          {Object.entries(ROTULO_TIPO).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemover}
          className="text-xs text-red-600 hover:underline dark:text-red-400"
        >
          Remover
        </button>
      </div>

      {mensagem.tipo === "texto" && (
        <textarea
          className={campo}
          rows={3}
          value={mensagem.texto}
          onChange={(e) => onChange({ ...mensagem, texto: e.target.value })}
          placeholder="Texto da mensagem — use [Primeiro_Nome] e [saudacao] como variáveis"
        />
      )}

      {(mensagem.tipo === "imagem" ||
        mensagem.tipo === "audio" ||
        mensagem.tipo === "video" ||
        mensagem.tipo === "documento") && (
        <>
          <div className="space-y-1">
            <label className={rotulo}>URL do arquivo</label>
            <input
              className={campo}
              value={mensagem.midia_url}
              onChange={(e) => onChange({ ...mensagem, midia_url: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Legenda (opcional)</label>
            <input
              className={campo}
              value={mensagem.legenda ?? ""}
              onChange={(e) => onChange({ ...mensagem, legenda: e.target.value })}
            />
          </div>
        </>
      )}

      {mensagem.tipo === "localizacao" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={rotulo}>Latitude</label>
            <input
              type="number"
              step="any"
              className={campo}
              value={mensagem.latitude}
              onChange={(e) => onChange({ ...mensagem, latitude: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Longitude</label>
            <input
              type="number"
              step="any"
              className={campo}
              value={mensagem.longitude}
              onChange={(e) => onChange({ ...mensagem, longitude: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-2 space-y-1">
            <label className={rotulo}>Nome do local (opcional)</label>
            <input
              className={campo}
              value={mensagem.nome ?? ""}
              onChange={(e) => onChange({ ...mensagem, nome: e.target.value })}
            />
          </div>
          <div className="col-span-2 space-y-1">
            <label className={rotulo}>Endereço (opcional)</label>
            <input
              className={campo}
              value={mensagem.endereco ?? ""}
              onChange={(e) => onChange({ ...mensagem, endereco: e.target.value })}
            />
          </div>
        </div>
      )}

      {mensagem.tipo === "contato" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={rotulo}>Nome</label>
            <input
              className={campo}
              value={mensagem.nome}
              onChange={(e) => onChange({ ...mensagem, nome: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Telefone</label>
            <input
              className={campo}
              value={mensagem.telefone}
              onChange={(e) => onChange({ ...mensagem, telefone: e.target.value })}
            />
          </div>
        </div>
      )}

      {mensagem.tipo === "pix" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={rotulo}>Chave</label>
            <input
              className={campo}
              value={mensagem.chave}
              onChange={(e) => onChange({ ...mensagem, chave: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Tipo de chave</label>
            <select
              className={campo}
              value={mensagem.tipo_chave}
              onChange={(e) =>
                onChange({
                  ...mensagem,
                  tipo_chave: e.target.value as typeof mensagem.tipo_chave,
                })
              }
            >
              <option value="cpf">CPF</option>
              <option value="cnpj">CNPJ</option>
              <option value="email">E-mail</option>
              <option value="telefone">Telefone</option>
              <option value="aleatoria">Aleatória</option>
            </select>
          </div>
          <div className="col-span-2 space-y-1">
            <label className={rotulo}>Nome do beneficiário (opcional)</label>
            <input
              className={campo}
              value={mensagem.nome_beneficiario ?? ""}
              onChange={(e) => onChange({ ...mensagem, nome_beneficiario: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
