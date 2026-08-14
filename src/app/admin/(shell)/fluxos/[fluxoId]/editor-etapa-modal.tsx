"use client";

import { BolhaMensagem } from "@/components/bolha-mensagem";
import { modoNavegacao as detectarModo, type ModoNavegacao } from "@/lib/motor-fluxo/db";
import { KANBAN_SUBETAPAS } from "@/lib/motor-fluxo/kanban";
import type { AgendaAdmin, EtapaAdmin } from "@/lib/motor-fluxo/repositorio-admin";
import type { ConteudoEtapa, MensagemEtapa, Opcao, TipoResposta } from "@/lib/motor-fluxo/tipos";
import { useState } from "react";
import { excluirEtapaAction, salvarEtapaAction } from "../actions";
import { EditorMensagem } from "./editor-mensagem";

type Rascunho = {
  codigo: string;
  mensagens: MensagemEtapa[];
  aguardaResposta: boolean;
  tipoResposta: TipoResposta | "";
  modoNavegacao: ModoNavegacao;
  opcoes: Opcao[];
  proximoCodigo: string;
  condContemQualquer: string;
  condSeSim: string;
  condSeNao: string;
  dadoCampo: string;
  dadoSeIgual: string;
  dadoEntao: string;
  dadoSenao: string;
  kanbanSubetapa: string;
  digitando: boolean;
  delayTipo: "nenhum" | "fixo" | "aleatorio";
  delaySegundos: number;
  delayMin: number;
  delayMax: number;
  iaHabilitada: boolean;
  iaInstrucao: string;
  sobSupervisor: boolean;
  campoSalvo: string;
  agendaFollowupId: string;
};

function paraRascunho(
  etapa: EtapaAdmin | null,
  codigoSugerido: string,
  subetapaSugerida: string | undefined,
): Rascunho {
  const c = etapa?.conteudo ?? null;
  return {
    codigo: c?.codigo ?? codigoSugerido,
    mensagens: c?.mensagens ?? [{ tipo: "texto", texto: "" }],
    aguardaResposta: c?.aguarda_resposta ?? true,
    tipoResposta: c?.tipo_resposta ?? "texto_livre",
    modoNavegacao: c ? detectarModo(c) : "linear",
    opcoes: c?.opcoes ?? [],
    proximoCodigo: c?.proximo_codigo ?? "",
    condContemQualquer: c?.proximo_condicional?.contem_qualquer.join(", ") ?? "",
    condSeSim: c?.proximo_condicional?.se_sim ?? "",
    condSeNao: c?.proximo_condicional?.se_nao ?? "",
    dadoCampo: c?.proximo_por_dado?.campo ?? "",
    dadoSeIgual: c?.proximo_por_dado?.se_igual ?? "",
    dadoEntao: c?.proximo_por_dado?.entao ?? "",
    dadoSenao: c?.proximo_por_dado?.senao ?? "",
    kanbanSubetapa: c?.kanban_subetapa ?? subetapaSugerida ?? KANBAN_SUBETAPAS[0].slug,
    digitando: c?.digitando ?? true,
    delayTipo: c?.delay?.tipo ?? "nenhum",
    delaySegundos: c?.delay?.tipo === "fixo" ? c.delay.segundos : 2,
    delayMin: c?.delay?.tipo === "aleatorio" ? c.delay.min_segundos : 1,
    delayMax: c?.delay?.tipo === "aleatorio" ? c.delay.max_segundos : 3,
    iaHabilitada: c?.interpretacao_ia?.habilitado ?? false,
    iaInstrucao: c?.interpretacao_ia?.instrucao ?? "",
    sobSupervisor: c?.encerramento?.sob_supervisor ?? false,
    campoSalvo: etapa?.campoSalvo ?? "",
    agendaFollowupId: etapa?.agendaFollowupId ?? "",
  };
}

function paraConteudo(r: Rascunho): ConteudoEtapa {
  const base: ConteudoEtapa = {
    codigo: r.codigo.trim(),
    mensagens: r.mensagens,
    aguarda_resposta: r.aguardaResposta,
    kanban_subetapa: r.kanbanSubetapa,
    digitando: r.digitando,
    delay:
      r.delayTipo === "fixo"
        ? { tipo: "fixo", segundos: r.delaySegundos }
        : r.delayTipo === "aleatorio"
          ? { tipo: "aleatorio", min_segundos: r.delayMin, max_segundos: r.delayMax }
          : { tipo: "nenhum" },
  };

  if (r.aguardaResposta && r.tipoResposta) {
    base.tipo_resposta = r.tipoResposta;
  }

  if (r.iaHabilitada) {
    base.interpretacao_ia = { habilitado: true, instrucao: r.iaInstrucao || undefined };
  }

  switch (r.modoNavegacao) {
    case "opcoes":
      base.opcoes = r.opcoes;
      break;
    case "condicional_texto":
      base.proximo_condicional = {
        contem_qualquer: r.condContemQualquer
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        se_sim: r.condSeSim,
        se_nao: r.condSeNao,
      };
      break;
    case "condicional_dado":
      base.proximo_por_dado = {
        campo: r.dadoCampo,
        se_igual: r.dadoSeIgual,
        entao: r.dadoEntao,
        senao: r.dadoSenao,
      };
      break;
    case "linear":
      base.proximo_codigo = r.proximoCodigo || undefined;
      break;
    case "terminal":
      base.encerramento = { sob_supervisor: r.sobSupervisor };
      break;
  }

  return base;
}

const ICONE_TIPO_MENSAGEM: Record<MensagemEtapa["tipo"], string> = {
  texto: "💬",
  imagem: "🖼️",
  audio: "🎵",
  video: "🎬",
  documento: "📄",
  localizacao: "📍",
  contato: "👤",
  pix: "💠",
};

function resumoMensagem(m: MensagemEtapa): string {
  if (m.tipo === "texto") return m.texto.trim() || "(vazio)";
  return `Mensagem de ${m.tipo}`;
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";
const secao = "space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800";

type Aba = "mensagens" | "fluxo" | "avancado";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "mensagens", rotulo: "Mensagens" },
  { id: "fluxo", rotulo: "Fluxo" },
  { id: "avancado", rotulo: "Avançado" },
];

export function EditorEtapaModal({
  etapaExistente,
  fluxoId,
  agendas,
  codigosDisponiveis,
  codigoSugerido,
  subetapaSugerida,
  ordem,
  onFechar,
  onSalvo,
  onExcluido,
}: {
  etapaExistente: EtapaAdmin | null;
  fluxoId: string;
  agendas: AgendaAdmin[];
  codigosDisponiveis: string[];
  codigoSugerido: string;
  subetapaSugerida: string | undefined;
  ordem: number;
  onFechar: () => void;
  onSalvo: (etapa: EtapaAdmin) => void;
  onExcluido: (id: string) => void;
}) {
  const [r, setR] = useState<Rascunho>(() =>
    paraRascunho(etapaExistente, codigoSugerido, subetapaSugerida),
  );
  const [aba, setAba] = useState<Aba>("mensagens");
  const [mensagemExpandida, setMensagemExpandida] = useState<number | null>(0);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function moverMensagem(indice: number, direcao: -1 | 1) {
    const alvo = indice + direcao;
    if (alvo < 0 || alvo >= r.mensagens.length) return;
    setR((atual) => {
      const mensagens = [...atual.mensagens];
      [mensagens[indice], mensagens[alvo]] = [mensagens[alvo], mensagens[indice]];
      return { ...atual, mensagens };
    });
    setMensagemExpandida((atual) => {
      if (atual === indice) return alvo;
      if (atual === alvo) return indice;
      return atual;
    });
  }

  function atualizar<K extends keyof Rascunho>(chave: K, valor: Rascunho[K]) {
    setR((atual) => ({ ...atual, [chave]: valor }));
  }

  function atualizarOpcao(indice: number, patch: Partial<Opcao>) {
    setR((atual) => ({
      ...atual,
      opcoes: atual.opcoes.map((o, i) => (i === indice ? { ...o, ...patch } : o)),
    }));
  }

  async function salvar() {
    setErro(null);
    if (!r.codigo.trim()) {
      setAba("fluxo");
      setErro("O código da etapa é obrigatório.");
      return;
    }
    setSalvando(true);
    const conteudo = paraConteudo(r);
    const resultado = await salvarEtapaAction({
      id: etapaExistente?.id ?? null,
      fluxoId,
      ordem: etapaExistente?.ordem ?? ordem,
      campoSalvo: r.campoSalvo.trim() || null,
      agendaFollowupId: r.agendaFollowupId || null,
      conteudo,
    });
    setSalvando(false);

    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }

    onSalvo({
      id: resultado.id,
      fluxoId,
      ordem: etapaExistente?.ordem ?? ordem,
      campoSalvo: r.campoSalvo.trim() || null,
      agendaFollowupId: r.agendaFollowupId || null,
      conteudo,
    });
  }

  async function confirmarEExcluir() {
    if (!etapaExistente) return;
    setConfirmandoExclusao(false);
    setExcluindo(true);
    const resultado = await excluirEtapaAction(etapaExistente.id, fluxoId);
    setExcluindo(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onExcluido(etapaExistente.id);
  }

  const outrosCodigos = codigosDisponiveis.filter((c) => c !== etapaExistente?.conteudo.codigo);
  const modoOriginal = etapaExistente ? detectarModo(etapaExistente.conteudo) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-zinc-50 shadow-xl dark:bg-zinc-950">
        {/* Coluna de edição */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {etapaExistente ? "Editar etapa" : "Nova etapa"}
            </h2>
            <button onClick={onFechar} className="text-sm text-zinc-500 hover:underline">
              Fechar
            </button>
          </div>

          <div className="mt-4 space-y-1">
            <label className={rotulo}>Código (identifica a etapa — sem espaços)</label>
            <input
              className={campo}
              value={r.codigo}
              onChange={(e) => atualizar("codigo", e.target.value.replace(/\s+/g, "_"))}
            />
          </div>

          <div className="mt-4 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
            {ABAS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={`px-3 py-2 text-sm font-medium ${
                  aba === a.id
                    ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {a.rotulo}
              </button>
            ))}
          </div>

          {aba === "mensagens" && (
            <div className="mt-4 space-y-2">
              {r.mensagens.map((m, i) => {
                const expandida = mensagemExpandida === i;
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700"
                  >
                    <div className="flex items-center gap-1 pr-1">
                      <button
                        type="button"
                        onClick={() => setMensagemExpandida(expandida ? null : i)}
                        className="flex flex-1 items-center gap-2 px-3 py-2 text-left text-sm"
                      >
                        <span>{ICONE_TIPO_MENSAGEM[m.tipo]}</span>
                        <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">
                          {resumoMensagem(m)}
                        </span>
                        <span className="text-zinc-400">{expandida ? "▲" : "▼"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => moverMensagem(i, -1)}
                        disabled={i === 0}
                        title="Mover pra cima"
                        className="rounded px-1.5 py-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moverMensagem(i, 1)}
                        disabled={i === r.mensagens.length - 1}
                        title="Mover pra baixo"
                        className="rounded px-1.5 py-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        ▼
                      </button>
                    </div>
                    {expandida && (
                      <div className="border-t border-zinc-200 p-2 dark:border-zinc-700">
                        <EditorMensagem
                          mensagem={m}
                          onChange={(nova) =>
                            atualizar(
                              "mensagens",
                              r.mensagens.map((atual, idx) => (idx === i ? nova : atual)),
                            )
                          }
                          onRemover={() => {
                            atualizar("mensagens", r.mensagens.filter((_, idx) => idx !== i));
                            setMensagemExpandida(null);
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  atualizar("mensagens", [...r.mensagens, { tipo: "texto", texto: "" }]);
                  setMensagemExpandida(r.mensagens.length);
                }}
                className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
              >
                + Adicionar mensagem
              </button>
            </div>
          )}

          {aba === "fluxo" && (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={r.aguardaResposta}
                    onChange={(e) => atualizar("aguardaResposta", e.target.checked)}
                  />
                  Esta etapa aguarda resposta do lead
                </label>

                {r.aguardaResposta && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className={rotulo}>Tipo de resposta esperada</label>
                      <select
                        className={campo}
                        value={r.tipoResposta}
                        onChange={(e) => atualizar("tipoResposta", e.target.value as TipoResposta)}
                      >
                        <option value="texto_livre">Texto livre</option>
                        <option value="menu">Menu (opções numeradas)</option>
                        <option value="sim_nao">Sim/Não</option>
                        <option value="email">E-mail (validado)</option>
                        <option value="numero_ou_nao_sei">Número ou &quot;não sei&quot;</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className={rotulo}>Campo salvo em (opcional)</label>
                      <input
                        className={campo}
                        value={r.campoSalvo}
                        onChange={(e) => atualizar("campoSalvo", e.target.value)}
                        placeholder="ex.: faixa_valor"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className={secao}>
                <label className={rotulo}>Para onde a conversa vai depois</label>
                <select
                  className={campo}
                  value={r.modoNavegacao}
                  onChange={(e) => atualizar("modoNavegacao", e.target.value as ModoNavegacao)}
                >
                  <option value="linear">Sempre a mesma próxima etapa</option>
                  <option value="opcoes">Depende da opção escolhida (menu/sim-não)</option>
                  <option value="condicional_texto">
                    Depende do texto da resposta (contém palavra)
                  </option>
                  {/* "roteador por dado" é mecanismo de sistema (ex.: bifurcar por alto_valor) — só aparece se a etapa já usa isso, não é uma opção pra criar do zero */}
                  {modoOriginal === "condicional_dado" && (
                    <option value="condicional_dado">Depende de um dado já calculado (roteador)</option>
                  )}
                  <option value="terminal">Encerra o fluxo automatizado aqui</option>
                </select>

                {r.modoNavegacao === "linear" && (
                  <select
                    className={campo}
                    value={r.proximoCodigo}
                    onChange={(e) => atualizar("proximoCodigo", e.target.value)}
                  >
                    <option value="">— selecione —</option>
                    {outrosCodigos.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}

                {r.modoNavegacao === "opcoes" && (
                  <div className="space-y-2">
                    {r.opcoes.map((o, i) => (
                      <div
                        key={i}
                        className="space-y-1 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700"
                      >
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className={campo}
                            placeholder="valor salvo (ex.: sim)"
                            value={o.valor}
                            onChange={(e) => atualizarOpcao(i, { valor: e.target.value })}
                          />
                          <input
                            className={campo}
                            placeholder="rótulos aceitos, separados por vírgula"
                            value={o.rotulos.join(", ")}
                            onChange={(e) =>
                              atualizarOpcao(i, {
                                rotulos: e.target.value
                                  .split(",")
                                  .map((r2) => r2.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                          <input
                            type="checkbox"
                            checked={o.encerra_com_perda ?? false}
                            onChange={(e) => atualizarOpcao(i, { encerra_com_perda: e.target.checked })}
                          />
                          Esta opção marca a oportunidade como perdida
                        </label>
                        {o.encerra_com_perda ? (
                          <input
                            className={campo}
                            placeholder="motivo da perda"
                            value={o.motivo_perda ?? ""}
                            onChange={(e) => atualizarOpcao(i, { motivo_perda: e.target.value })}
                          />
                        ) : (
                          <select
                            className={campo}
                            value={o.proximo_codigo ?? ""}
                            onChange={(e) => atualizarOpcao(i, { proximo_codigo: e.target.value })}
                          >
                            <option value="">— próxima etapa —</option>
                            {outrosCodigos.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => atualizar("opcoes", r.opcoes.filter((_, idx) => idx !== i))}
                          className="text-xs text-red-600 hover:underline dark:text-red-400"
                        >
                          Remover opção
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => atualizar("opcoes", [...r.opcoes, { valor: "", rotulos: [] }])}
                      className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      + Adicionar opção
                    </button>
                  </div>
                )}

                {r.modoNavegacao === "condicional_texto" && (
                  <div className="space-y-2">
                    <input
                      className={campo}
                      placeholder="termos que ativam o 'sim', separados por vírgula"
                      value={r.condContemQualquer}
                      onChange={(e) => atualizar("condContemQualquer", e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className={campo}
                        value={r.condSeSim}
                        onChange={(e) => atualizar("condSeSim", e.target.value)}
                      >
                        <option value="">se contém → etapa</option>
                        {outrosCodigos.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select
                        className={campo}
                        value={r.condSeNao}
                        onChange={(e) => atualizar("condSeNao", e.target.value)}
                      >
                        <option value="">se não contém → etapa</option>
                        {outrosCodigos.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {r.modoNavegacao === "condicional_dado" && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className={campo}
                      placeholder="nome do dado (ex.: alto_valor)"
                      value={r.dadoCampo}
                      onChange={(e) => atualizar("dadoCampo", e.target.value)}
                    />
                    <input
                      className={campo}
                      placeholder="valor de comparação (ex.: sim)"
                      value={r.dadoSeIgual}
                      onChange={(e) => atualizar("dadoSeIgual", e.target.value)}
                    />
                    <select
                      className={campo}
                      value={r.dadoEntao}
                      onChange={(e) => atualizar("dadoEntao", e.target.value)}
                    >
                      <option value="">se igual → etapa</option>
                      {outrosCodigos.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <select
                      className={campo}
                      value={r.dadoSenao}
                      onChange={(e) => atualizar("dadoSenao", e.target.value)}
                    >
                      <option value="">senão → etapa</option>
                      {outrosCodigos.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {r.modoNavegacao === "terminal" && (
                  <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={r.sobSupervisor}
                      onChange={(e) => atualizar("sobSupervisor", e.target.checked)}
                    />
                    A partir daqui, alguém da equipe assume manualmente
                  </label>
                )}
              </div>

              <div className={secao}>
                <label className={rotulo}>Subetapa do Kanban</label>
                <select
                  className={campo}
                  value={r.kanbanSubetapa}
                  onChange={(e) => atualizar("kanbanSubetapa", e.target.value)}
                >
                  {KANBAN_SUBETAPAS.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {aba === "avancado" && (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={r.digitando}
                    onChange={(e) => atualizar("digitando", e.target.checked)}
                  />
                  Mostrar &quot;digitando...&quot; antes de enviar
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    className={campo}
                    value={r.delayTipo}
                    onChange={(e) => atualizar("delayTipo", e.target.value as Rascunho["delayTipo"])}
                  >
                    <option value="nenhum">Sem delay</option>
                    <option value="fixo">Delay fixo</option>
                    <option value="aleatorio">Sorteio entre X e Y</option>
                  </select>
                  {r.delayTipo === "fixo" && (
                    <input
                      type="number"
                      min={0}
                      className={campo}
                      value={r.delaySegundos}
                      onChange={(e) => atualizar("delaySegundos", Number(e.target.value))}
                      placeholder="segundos"
                    />
                  )}
                  {r.delayTipo === "aleatorio" && (
                    <>
                      <input
                        type="number"
                        min={0}
                        className={campo}
                        value={r.delayMin}
                        onChange={(e) => atualizar("delayMin", Number(e.target.value))}
                        placeholder="mín. segundos"
                      />
                      <input
                        type="number"
                        min={0}
                        className={campo}
                        value={r.delayMax}
                        onChange={(e) => atualizar("delayMax", Number(e.target.value))}
                        placeholder="máx. segundos"
                      />
                    </>
                  )}
                </div>
              </div>

              {r.aguardaResposta && (
                <div className={secao}>
                  <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={r.iaHabilitada}
                      onChange={(e) => atualizar("iaHabilitada", e.target.checked)}
                    />
                    Se não reconhecer a resposta, deixar a IA tentar entender (Fase 5)
                  </label>
                  {r.iaHabilitada && (
                    <textarea
                      className={campo}
                      rows={2}
                      placeholder="Instrução pra IA — o que ela deve tentar extrair"
                      value={r.iaInstrucao}
                      onChange={(e) => atualizar("iaInstrucao", e.target.value)}
                    />
                  )}

                  <label className={rotulo}>Agenda de follow-up</label>
                  <select
                    className={campo}
                    value={r.agendaFollowupId}
                    onChange={(e) => atualizar("agendaFollowupId", e.target.value)}
                  >
                    <option value="">Usar a agenda padrão do sistema</option>
                    {agendas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nome}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {erro && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{erro}</p>}

          <div className="mt-6 flex items-center justify-between">
            {etapaExistente ? (
              <button
                onClick={() => setConfirmandoExclusao(true)}
                disabled={excluindo}
                className="text-sm text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
              >
                {excluindo ? "Excluindo..." : "Excluir etapa"}
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-full bg-zinc-900 px-5 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

        {/* Prévia ao vivo */}
        <div className="hidden w-72 shrink-0 flex-col border-l border-zinc-200 bg-zinc-100 p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:flex">
          <p className={rotulo}>Prévia</p>
          <div className="mt-2 flex-1 space-y-2 overflow-y-auto">
            {r.mensagens.map((m, i) => (
              <div key={i} className="flex justify-start">
                <div className="max-w-full rounded-2xl bg-white px-3 py-2 text-sm text-zinc-900 shadow dark:bg-zinc-800 dark:text-zinc-50">
                  <BolhaMensagem mensagem={m} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {confirmandoExclusao && etapaExistente && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Excluir a etapa &quot;{etapaExistente.conteudo.codigo}&quot;?
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Essa ação não pode ser desfeita.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmandoExclusao(false)}
                className="rounded-full px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEExcluir}
                disabled={excluindo}
                className="rounded-full bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-40"
              >
                {excluindo ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
