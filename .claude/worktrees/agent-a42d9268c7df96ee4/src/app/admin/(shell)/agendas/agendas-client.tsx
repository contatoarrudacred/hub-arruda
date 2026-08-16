"use client";

import { useState } from "react";
import type { AgendaFollowupCompleta, AgendaItemAdmin } from "@/lib/motor-fluxo/repositorio-admin";
import {
  excluirAgendaAction,
  excluirAgendaItemAction,
  salvarAgendaAction,
  salvarAgendaItemAction,
} from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

function rotuloIntervalo(item: AgendaItemAdmin): string {
  return `${item.intervaloValor} ${item.intervaloUnidade}`;
}

export function AgendasClient({ agendasIniciais }: { agendasIniciais: AgendaFollowupCompleta[] }) {
  const [agendas, setAgendas] = useState(agendasIniciais);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [criandoNova, setCriandoNova] = useState(false);
  const [nomeNovaAgenda, setNomeNovaAgenda] = useState("");
  const [salvandoNova, setSalvandoNova] = useState(false);
  const [erroNova, setErroNova] = useState<string | null>(null);

  async function criarAgenda() {
    setErroNova(null);
    setSalvandoNova(true);
    const resultado = await salvarAgendaAction(null, nomeNovaAgenda);
    setSalvandoNova(false);
    if (!resultado.sucesso) {
      setErroNova(resultado.erro);
      return;
    }
    setAgendas((atual) => [...atual, { id: resultado.id, nome: nomeNovaAgenda.trim(), itens: [] }]);
    setNomeNovaAgenda("");
    setCriandoNova(false);
    setExpandidoId(resultado.id);
  }

  return (
    <div className="max-w-3xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Agendas de Follow-up</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Cadência de retomada quando o lead para de responder — cada agenda tem várias tentativas em
            sequência.
          </p>
        </div>
        <button
          onClick={() => setCriandoNova(true)}
          disabled={criandoNova}
          className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Nova agenda
        </button>
      </div>

      {criandoNova && (
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <input
            className={campo}
            value={nomeNovaAgenda}
            onChange={(e) => setNomeNovaAgenda(e.target.value)}
            placeholder="Nome da agenda (ex.: Proposta)"
            autoFocus
          />
          <button
            onClick={() => {
              setCriandoNova(false);
              setNomeNovaAgenda("");
            }}
            className="shrink-0 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
          >
            Cancelar
          </button>
          <button
            onClick={criarAgenda}
            disabled={salvandoNova}
            className="shrink-0 rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
          >
            {salvandoNova ? "Criando..." : "Criar"}
          </button>
          {erroNova && <p className="text-sm text-red-600 dark:text-red-400">{erroNova}</p>}
        </div>
      )}

      {agendas.map((agenda) => (
        <CardAgenda
          key={agenda.id}
          agenda={agenda}
          expandida={expandidoId === agenda.id}
          onExpandir={() => setExpandidoId(expandidoId === agenda.id ? null : agenda.id)}
          onAtualizada={(atualizada) =>
            setAgendas((atual) => atual.map((a) => (a.id === atualizada.id ? atualizada : a)))
          }
          onExcluida={() => setAgendas((atual) => atual.filter((a) => a.id !== agenda.id))}
        />
      ))}

      {agendas.length === 0 && !criandoNova && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma agenda cadastrada ainda.</p>
      )}
    </div>
  );
}

function CardAgenda({
  agenda,
  expandida,
  onExpandir,
  onAtualizada,
  onExcluida,
}: {
  agenda: AgendaFollowupCompleta;
  expandida: boolean;
  onExpandir: () => void;
  onAtualizada: (agenda: AgendaFollowupCompleta) => void;
  onExcluida: () => void;
}) {
  const [nome, setNome] = useState(agenda.nome);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [novoItem, setNovoItem] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function salvarNome() {
    setSalvandoNome(true);
    await salvarAgendaAction(agenda.id, nome);
    setSalvandoNome(false);
    onAtualizada({ ...agenda, nome: nome.trim() });
  }

  async function confirmarEExcluir() {
    setConfirmandoExclusao(false);
    setExcluindo(true);
    await excluirAgendaAction(agenda.id);
    setExcluindo(false);
    onExcluida();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <button type="button" onClick={onExpandir} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">{agenda.nome}</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {agenda.itens.length} {agenda.itens.length === 1 ? "tentativa" : "tentativas"}
        </span>
        <span className="text-zinc-400">{expandida ? "▲" : "▼"}</span>
      </button>

      {expandida && (
        <div className="space-y-3 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1">
              <label className={rotulo}>Nome da agenda</label>
              <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <button
              onClick={salvarNome}
              disabled={salvandoNome || nome.trim() === agenda.nome}
              className="mt-5 shrink-0 rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {salvandoNome ? "Salvando..." : "Salvar nome"}
            </button>
          </div>

          <div className="space-y-2">
            {agenda.itens.map((item) => (
              <ItemAgenda
                key={item.id}
                agendaId={agenda.id}
                item={item}
                onSalvo={(atualizado) =>
                  onAtualizada({
                    ...agenda,
                    itens: agenda.itens
                      .map((i) => (i.id === atualizado.id ? atualizado : i))
                      .sort((a, b) => a.ordem - b.ordem),
                  })
                }
                onExcluido={() =>
                  onAtualizada({ ...agenda, itens: agenda.itens.filter((i) => i.id !== item.id) })
                }
              />
            ))}

            {novoItem ? (
              <ItemAgenda
                agendaId={agenda.id}
                item={{
                  id: null as unknown as string,
                  ordem: agenda.itens.length + 1,
                  intervaloValor: 10,
                  intervaloUnidade: "minutos",
                  canal: "whatsapp",
                  respeitaJanelaComercial: true,
                  conteudo: "",
                }}
                novo
                onSalvo={(criado) => {
                  onAtualizada({ ...agenda, itens: [...agenda.itens, criado].sort((a, b) => a.ordem - b.ordem) });
                  setNovoItem(false);
                }}
                onExcluido={() => setNovoItem(false)}
              />
            ) : (
              <button
                onClick={() => setNovoItem(true)}
                className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
              >
                + Adicionar tentativa
              </button>
            )}
          </div>

          <div className="border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <button
              onClick={() => setConfirmandoExclusao(true)}
              disabled={excluindo}
              className="text-sm text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
            >
              {excluindo ? "Excluindo..." : "Excluir agenda inteira"}
            </button>
          </div>
        </div>
      )}

      {confirmandoExclusao && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Excluir a agenda &quot;{agenda.nome}&quot; e todas as suas {agenda.itens.length} tentativas?
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Essa ação não pode ser desfeita.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmandoExclusao(false)}
                className="rounded-full px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEExcluir}
                className="rounded-full bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemAgenda({
  agendaId,
  item,
  novo,
  onSalvo,
  onExcluido,
}: {
  agendaId: string;
  item: AgendaItemAdmin;
  novo?: boolean;
  onSalvo: (item: AgendaItemAdmin) => void;
  onExcluido: () => void;
}) {
  const [aberto, setAberto] = useState(!!novo);
  const [r, setR] = useState(item);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resultado = await salvarAgendaItemAction({
      id: r.id ?? null,
      agendaId,
      ordem: r.ordem,
      intervaloValor: r.intervaloValor,
      intervaloUnidade: r.intervaloUnidade,
      canal: r.canal,
      respeitaJanelaComercial: r.respeitaJanelaComercial,
      conteudo: r.conteudo,
    });
    setSalvando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onSalvo({ ...r, id: resultado.id });
    setAberto(false);
  }

  async function confirmarEExcluir() {
    if (!r.id) return;
    setConfirmandoExclusao(false);
    setExcluindo(true);
    await excluirAgendaItemAction(r.id);
    setExcluindo(false);
    onExcluido();
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
      <button type="button" onClick={() => setAberto(!aberto)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {rotuloIntervalo(r)}
        </span>
        <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">{r.conteudo || "(sem conteúdo)"}</span>
        <span className="text-zinc-400">{aberto ? "▲" : "▼"}</span>
      </button>

      {aberto && (
        <div className="space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-700">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className={rotulo}>Ordem</label>
              <input
                type="number"
                min={1}
                className={campo}
                value={r.ordem}
                onChange={(e) => setR({ ...r, ordem: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <label className={rotulo}>Intervalo</label>
              <input
                type="number"
                min={1}
                className={campo}
                value={r.intervaloValor}
                onChange={(e) => setR({ ...r, intervaloValor: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <label className={rotulo}>Unidade</label>
              <select
                className={campo}
                value={r.intervaloUnidade}
                onChange={(e) => setR({ ...r, intervaloUnidade: e.target.value as AgendaItemAdmin["intervaloUnidade"] })}
              >
                <option value="minutos">minutos</option>
                <option value="horas">horas</option>
                <option value="dias">dias</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className={rotulo}>Canal</label>
              <select
                className={campo}
                value={r.canal}
                onChange={(e) => setR({ ...r, canal: e.target.value as AgendaItemAdmin["canal"] })}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={r.respeitaJanelaComercial}
                onChange={(e) => setR({ ...r, respeitaJanelaComercial: e.target.checked })}
              />
              Respeita janela comercial
            </label>
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Mensagem de retomada</label>
            <textarea
              className={campo}
              rows={2}
              value={r.conteudo}
              onChange={(e) => setR({ ...r, conteudo: e.target.value })}
            />
          </div>

          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

          <div className="flex items-center justify-between pt-1">
            {r.id ? (
              <button
                onClick={() => setConfirmandoExclusao(true)}
                disabled={excluindo}
                className="text-sm text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
              >
                {excluindo ? "Excluindo..." : "Excluir"}
              </button>
            ) : (
              <button onClick={onExcluido} className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
                Cancelar
              </button>
            )}
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}

      {confirmandoExclusao && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Excluir esta tentativa?</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Essa ação não pode ser desfeita.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmandoExclusao(false)}
                className="rounded-full px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEExcluir}
                className="rounded-full bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
