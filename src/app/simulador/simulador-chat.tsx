"use client";

import { BolhaMensagem } from "@/components/bolha-mensagem";
import type { ConfigDelay, MensagemEnviada, MensagemEtapa } from "@/lib/motor-fluxo/tipos";
import { useEffect, useRef, useState } from "react";
import { enviarResposta, iniciarSimulacaoComMensagem, type EstadoSimulador } from "./actions";
import { TesteFollowup } from "./teste-followup";

type MensagemExibida =
  | { autor: "malala" | "lead"; conteudo: MensagemEtapa }
  | { autor: "sistema"; texto: string };

const ESTADO_INICIAL: EstadoSimulador = {
  etapaAtualCodigo: null,
  dados: {},
  conversaId: null,
  oportunidadeId: null,
  pessoaId: null,
};
const DIGITANDO_MINIMO_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function delayMs(delay: ConfigDelay): number {
  if (delay.tipo === "fixo") return delay.segundos * 1000;
  if (delay.tipo === "aleatorio") {
    const min = delay.min_segundos * 1000;
    const max = delay.max_segundos * 1000;
    return min + Math.random() * Math.max(0, max - min);
  }
  return 0;
}

export function SimuladorChat({ aoFechar }: { aoFechar?: () => void } = {}) {
  const [mensagens, setMensagens] = useState<MensagemExibida[]>([]);
  const [estado, setEstado] = useState<EstadoSimulador>(ESTADO_INICIAL);
  const [entrada, setEntrada] = useState("");
  const [encerrado, setEncerrado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [digitando, setDigitando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [iniciado, setIniciado] = useState(false);
  const fimDaLista = useRef<HTMLDivElement>(null);

  async function revelarSequencialmente(autor: "malala", itens: MensagemEnviada[]) {
    for (const item of itens) {
      const espera = Math.max(delayMs(item.delay), item.digitando ? DIGITANDO_MINIMO_MS : 0);
      if (item.digitando) setDigitando(true);
      if (espera > 0) await sleep(espera);
      setDigitando(false);
      setMensagens((atual) => [...atual, { autor, conteudo: item.mensagem }]);
    }
  }

  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, digitando]);

  function enviar() {
    const texto = entrada.trim();
    if (!texto || encerrado || ocupado) return;

    setMensagens((atual) => [...atual, { autor: "lead", conteudo: { tipo: "texto", texto } }]);
    setEntrada("");
    setOcupado(true);

    (async () => {
      try {
        // A conversa é sempre receptiva — é o lead quem chama primeiro (SCRIPT_LIMPANOME_SERASA_SPC.md).
        // A primeira mensagem passa pela extração determinística antes do fluxo decidir o que perguntar.
        const passo = iniciado
          ? await enviarResposta(estado, texto)
          : await iniciarSimulacaoComMensagem(texto);
        setIniciado(true);
        await revelarSequencialmente("malala", passo.mensagens);
        setEstado(passo.estado);
        setEncerrado(passo.encerrado);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao processar a mensagem.");
      } finally {
        setOcupado(false);
      }
    })();
  }

  if (erro) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-zinc-50 p-8 dark:bg-black">
        <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>
        <p className="max-w-md text-center text-xs text-zinc-500">
          Verifique se a migration 004 e o supabase/seed.sql já foram rodados no Supabase.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-start justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Simulador — Malala (Limpeza de Nome)
          </h1>
          <p className="text-xs text-zinc-500">
            Testa o motor de fluxo direto pelo navegador, sem WhatsApp de verdade — o conteúdo vem do
            Supabase, então editar uma etapa no banco muda a conversa aqui na hora.
          </p>
        </div>
        {aoFechar && (
          <button
            onClick={aoFechar}
            className="shrink-0 rounded-full px-3 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            ✕ Fechar
          </button>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {mensagens.length === 0 && (
          <p className="text-center text-xs text-zinc-400">
            É sempre o lead que chama primeiro — digite a primeira mensagem abaixo (ex.: &quot;Oi,
            sou Luiz e quero limpar meu nome&quot;) pra ver o que a Malala já reconhece de cara.
          </p>
        )}
        {mensagens.map((m, i) =>
          m.autor === "sistema" ? (
            <div key={i} className="text-center text-xs text-amber-700 dark:text-amber-500">
              {m.texto}
            </div>
          ) : (
            <div key={i} className={m.autor === "lead" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-md rounded-2xl px-4 py-2 text-sm ${
                  m.autor === "lead"
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-zinc-900 shadow dark:bg-zinc-900 dark:text-zinc-50"
                }`}
              >
                <BolhaMensagem mensagem={m.conteudo} />
              </div>
            </div>
          ),
        )}
        {digitando && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-white px-4 py-2 text-sm text-zinc-400 shadow dark:bg-zinc-900">
              digitando...
            </div>
          </div>
        )}
        {encerrado && !ocupado && mensagens.length > 0 && (
          <div className="text-center text-xs text-zinc-400">
            — fluxo automatizado encerrado (a partir daqui seria handoff manual/supervisor) —
          </div>
        )}
        <div ref={fimDaLista} />
      </div>

      <TesteFollowup
        etapaAtualCodigo={estado.etapaAtualCodigo}
        dados={estado.dados}
        turno={mensagens.length}
        desabilitado={ocupado}
        onMostrarWhatsapp={(texto) =>
          setMensagens((atual) => [...atual, { autor: "malala", conteudo: { tipo: "texto", texto } }])
        }
        onMostrarEmail={(descricao) =>
          setMensagens((atual) => [...atual, { autor: "sistema", texto: `📧 Preview de e-mail: ${descricao}` }])
        }
        onFimDaCadencia={() => setEncerrado(true)}
      />

      <div className="flex gap-2 border-t border-zinc-200 p-4 dark:border-zinc-800">
        <input
          className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder={
            encerrado
              ? "Conversa encerrada"
              : iniciado
                ? "Digite como se fosse o lead..."
                : "Primeira mensagem do lead (ex.: Oi, sou Luiz e quero limpar meu nome)"
          }
          disabled={encerrado || ocupado}
        />
        <button
          onClick={enviar}
          disabled={encerrado || ocupado}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
