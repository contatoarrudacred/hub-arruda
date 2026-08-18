"use client";

import { useState } from "react";
import { Ajuda } from "@/components/marketing/ajuda";
import type { CredencialCanalAdmin, PropriedadeAdmin } from "@/lib/marketing/tipos";
import { salvarCredencialAction, salvarPropriedadeAction } from "./actions";

type UnidadeNegocio = { id: string; nome: string };

// Só WordPress por enquanto (tipo_cms fixo) — lista separada porque a Task 7 já prevê mais de um
// canal de credenciais no futuro (a seção "Credenciais" itera sobre isto, não sobre um campo único).
const CANAIS = ["wordpress"] as const;

type Rascunho = {
  id: string | null;
  nome: string;
  urlBase: string;
  maxTentativas: string;
  postsPorDia: string;
  janelaInicio: string;
  janelaFim: string;
  unidadeNegocioId: string;
  ativo: boolean;
};

function paraRascunho(p: PropriedadeAdmin | null): Rascunho {
  return {
    id: p?.id ?? null,
    nome: p?.nome ?? "",
    urlBase: p?.urlBase ?? "",
    maxTentativas: p ? String(p.maxTentativas) : "3",
    postsPorDia: p?.postsPorDia != null ? String(p.postsPorDia) : "",
    janelaInicio: p?.janelaPublicacao?.inicio ?? "",
    janelaFim: p?.janelaPublicacao?.fim ?? "",
    unidadeNegocioId: "",
    ativo: p?.ativo ?? true,
  };
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function PropriedadesClient({
  propriedadesIniciais,
  unidadesNegocio,
}: {
  propriedadesIniciais: PropriedadeAdmin[];
  unidadesNegocio: UnidadeNegocio[];
}) {
  const [propriedades, setPropriedades] = useState(propriedadesIniciais);
  const [expandidaId, setExpandidaId] = useState<string | null>(null);
  const [criandoNova, setCriandoNova] = useState(false);

  return (
    <div className="max-w-3xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Propriedades Digitais</h1>
        <button
          onClick={() => setCriandoNova(true)}
          disabled={criandoNova}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Nova Propriedade
        </button>
      </div>

      {criandoNova && (
        <CardPropriedade
          propriedade={null}
          unidadesNegocio={unidadesNegocio}
          expandidaDeInicio
          onSalva={(p) => {
            setPropriedades((atual) => [p, ...atual]);
            setCriandoNova(false);
          }}
          onCancelarNova={() => setCriandoNova(false)}
        />
      )}

      {propriedades.map((p) => (
        <CardPropriedade
          key={p.id}
          propriedade={p}
          unidadesNegocio={unidadesNegocio}
          expandida={expandidaId === p.id}
          onExpandir={() => setExpandidaId(expandidaId === p.id ? null : p.id)}
          onSalva={(atualizada) =>
            setPropriedades((atual) => atual.map((x) => (x.id === atualizada.id ? atualizada : x)))
          }
        />
      ))}

      {propriedades.length === 0 && !criandoNova && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma propriedade cadastrada ainda.</p>
      )}
    </div>
  );
}

function CardPropriedade({
  propriedade,
  unidadesNegocio,
  expandida,
  expandidaDeInicio,
  onExpandir,
  onSalva,
  onCancelarNova,
}: {
  propriedade: PropriedadeAdmin | null;
  unidadesNegocio: UnidadeNegocio[];
  expandida?: boolean;
  expandidaDeInicio?: boolean;
  onExpandir?: () => void;
  onSalva: (p: PropriedadeAdmin) => void;
  onCancelarNova?: () => void;
}) {
  const [r, setR] = useState<Rascunho>(() => paraRascunho(propriedade));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const aberta = expandidaDeInicio || expandida;
  const ehNova = propriedade === null;

  async function salvar() {
    setErro(null);

    const maxTentativasNum = Number(r.maxTentativas);
    const postsPorDiaNum = r.postsPorDia.trim() === "" ? null : Number(r.postsPorDia);
    const janela = r.janelaInicio || r.janelaFim ? { inicio: r.janelaInicio, fim: r.janelaFim } : null;

    setSalvando(true);
    const resultado = await salvarPropriedadeAction({
      id: r.id,
      nome: r.nome,
      urlBase: r.urlBase,
      tipoCms: "wordpress",
      maxTentativas: maxTentativasNum,
      postsPorDia: postsPorDiaNum,
      janelaPublicacao: janela,
      unidadeNegocioId: r.unidadeNegocioId || null,
      ativo: r.ativo,
    });
    setSalvando(false);

    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onSalva(resultado.propriedade);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <button
        type="button"
        onClick={onExpandir}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {r.nome || "(nova propriedade)"}
        </span>
        {propriedade && !propriedade.ativo && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
            inativa
          </span>
        )}
        {onExpandir && <span className="text-zinc-400">{aberta ? "▲" : "▼"}</span>}
      </button>

      {aberta && (
        <div className="space-y-4 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <div className="space-y-1">
            <label className={rotulo}>Nome</label>
            <input
              className={campo}
              value={r.nome}
              onChange={(e) => setR({ ...r, nome: e.target.value })}
              placeholder="ex.: ArrudaCred"
            />
          </div>

          <div className="space-y-1">
            <label className={rotulo}>URL base</label>
            <input
              className={campo}
              value={r.urlBase}
              onChange={(e) => setR({ ...r, urlBase: e.target.value })}
              placeholder="https://arrudacred.com.br"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={rotulo}>Tipo de CMS</label>
              <input className={`${campo} opacity-60`} value="WordPress" disabled />
            </div>

            {ehNova && (
              <div className="space-y-1">
                <label className={rotulo}>
                  Unidade de Negócio
                  <Ajuda texto="É o 'dono' da propriedade no banco (constraint do Supabase exige um dono) — obrigatório na criação e não pode ficar em branco. Depois de criada, o dono não é editável por esta tela." />
                </label>
                <select
                  className={campo}
                  value={r.unidadeNegocioId}
                  onChange={(e) => setR({ ...r, unidadeNegocioId: e.target.value })}
                >
                  <option value="">Selecione...</option>
                  {unidadesNegocio.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={rotulo}>
                Máx. tentativas
                <Ajuda texto="Quantas vezes o pipeline tenta reprocessar uma pauta desta propriedade antes de bloqueá-la (circuit breaker)." />
              </label>
              <input
                type="number"
                min={1}
                className={campo}
                value={r.maxTentativas}
                onChange={(e) => setR({ ...r, maxTentativas: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className={rotulo}>
                Posts por dia
                <Ajuda texto="Limita quantos posts o cron PUBLICA por dia nesta propriedade — não afeta quantos posts são gerados/revisados, só a velocidade de publicação. Deixe em branco para sem limite." />
              </label>
              <input
                type="number"
                min={1}
                className={campo}
                value={r.postsPorDia}
                onChange={(e) => setR({ ...r, postsPorDia: e.target.value })}
                placeholder="Sem limite"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className={rotulo}>
              Janela de publicação
              <Ajuda texto="Horário (fuso de Brasília) em que o cron pode publicar posts desta propriedade — limita apenas o momento da publicação, não a geração de conteúdo. Deixe os dois campos em branco para publicar a qualquer hora." />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="time"
                className={campo}
                value={r.janelaInicio}
                onChange={(e) => setR({ ...r, janelaInicio: e.target.value })}
              />
              <input
                type="time"
                className={campo}
                value={r.janelaFim}
                onChange={(e) => setR({ ...r, janelaFim: e.target.value })}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={r.ativo} onChange={(e) => setR({ ...r, ativo: e.target.checked })} />
            Ativa
          </label>

          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

          <div className="flex items-center justify-between pt-1">
            {ehNova ? (
              <button onClick={onCancelarNova} className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
                Cancelar
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-full bg-zinc-900 px-5 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>

          {!ehNova && propriedade && (
            <SecaoCredenciais propriedadeId={propriedade.id} credenciais={propriedade.credenciais} />
          )}
        </div>
      )}
    </div>
  );
}

function SecaoCredenciais({
  propriedadeId,
  credenciais,
}: {
  propriedadeId: string;
  credenciais: PropriedadeAdmin["credenciais"];
}) {
  return (
    <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
      <p className={rotulo}>
        Credenciais
        <Ajuda texto="Usadas pelo pipeline pra publicar automaticamente neste site. A senha fica cifrada no banco e nunca é reexibida aqui — o campo de senha sempre carrega vazio; deixe em branco para manter a senha já salva." />
      </p>
      {CANAIS.map((canal) => (
        <CardCredencial key={canal} propriedadeId={propriedadeId} canal={canal} credencial={credenciais[canal] ?? null} />
      ))}
    </div>
  );
}

function CardCredencial({
  propriedadeId,
  canal,
  credencial,
}: {
  propriedadeId: string;
  canal: string;
  credencial: CredencialCanalAdmin | null;
}) {
  const [usuario, setUsuario] = useState(credencial?.usuario ?? "");
  const [senha, setSenha] = useState("");
  const [configurada, setConfigurada] = useState(credencial?.senhaConfigurada ?? false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resultado = await salvarCredencialAction(propriedadeId, canal, usuario, senha);
    setSalvando(false);

    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    // Nunca reexibe a senha digitada — limpa o campo e só atualiza o indicador de configurada.
    setSenha("");
    if (senha.trim()) setConfigurada(true);
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium capitalize text-zinc-700 dark:text-zinc-300">{canal}</span>
        <span className={configurada ? "text-xs text-emerald-600 dark:text-emerald-400" : "text-xs text-zinc-400 dark:text-zinc-500"}>
          {configurada ? "✓ configurada" : "✗ não configurada"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className={rotulo}>Usuário</label>
          <input className={campo} value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className={rotulo}>Senha</label>
          <input
            type="password"
            className={campo}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder={configurada ? "•••••• (deixe em branco p/ manter)" : ""}
            autoComplete="new-password"
          />
        </div>
      </div>
      {erro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <div className="mt-2 flex justify-end">
        <button
          onClick={salvar}
          disabled={salvando}
          className="rounded-full bg-zinc-900 px-4 py-1 text-xs text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {salvando ? "Salvando..." : "Salvar credenciais"}
        </button>
      </div>
    </div>
  );
}
