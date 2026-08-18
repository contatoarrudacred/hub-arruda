"use client";

import { useMemo, useState } from "react";
import { Ajuda } from "@/components/marketing/ajuda";
import type { MatrizAdmin } from "@/lib/marketing/tipos";
import { salvarMatrizAction } from "./actions";

type Propriedade = { id: string; nome: string };

type Rascunho = {
  id: string | null;
  propriedadeId: string;
  nome: string;
  ativo: boolean;
};

function paraRascunho(m: MatrizAdmin | null, propriedadeIdPadrao: string): Rascunho {
  return {
    id: m?.id ?? null,
    propriedadeId: m?.propriedadeId ?? propriedadeIdPadrao,
    nome: m?.nome ?? "",
    ativo: m?.ativo ?? true,
  };
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function MatrizesClient({
  matrizesIniciais,
  propriedades,
}: {
  matrizesIniciais: MatrizAdmin[];
  propriedades: Propriedade[];
}) {
  const [matrizes, setMatrizes] = useState(matrizesIniciais);
  const [expandidaId, setExpandidaId] = useState<string | null>(null);
  const [criandoNova, setCriandoNova] = useState(false);
  const [filtroPropriedadeId, setFiltroPropriedadeId] = useState("");

  const nomePropriedade = useMemo(() => {
    const mapa = new Map(propriedades.map((p) => [p.id, p.nome]));
    return (id: string) => mapa.get(id) ?? "(propriedade desconhecida)";
  }, [propriedades]);

  const matrizesFiltradas = filtroPropriedadeId
    ? matrizes.filter((m) => m.propriedadeId === filtroPropriedadeId)
    : matrizes;

  return (
    <div className="max-w-3xl space-y-3 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Matrizes de Conteúdo</h1>
        <button
          onClick={() => setCriandoNova(true)}
          disabled={criandoNova || propriedades.length === 0}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          + Nova Matriz
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label className={rotulo}>Propriedade</label>
        <select
          className={`${campo} max-w-xs`}
          value={filtroPropriedadeId}
          onChange={(e) => setFiltroPropriedadeId(e.target.value)}
        >
          <option value="">Todas</option>
          {propriedades.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      {propriedades.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Cadastre uma propriedade digital antes de criar uma matriz de conteúdo.
        </p>
      )}

      {criandoNova && (
        <CardMatriz
          matriz={null}
          propriedades={propriedades}
          propriedadeIdPadrao={filtroPropriedadeId || propriedades[0]?.id || ""}
          expandidaDeInicio
          onSalva={(m) => {
            setMatrizes((atual) => [m, ...atual]);
            setCriandoNova(false);
          }}
          onCancelarNova={() => setCriandoNova(false)}
        />
      )}

      {matrizesFiltradas.map((m) => (
        <CardMatriz
          key={m.id}
          matriz={m}
          propriedades={propriedades}
          propriedadeIdPadrao={m.propriedadeId}
          expandida={expandidaId === m.id}
          onExpandir={() => setExpandidaId(expandidaId === m.id ? null : m.id)}
          onSalva={(atualizada) =>
            setMatrizes((atual) => atual.map((x) => (x.id === atualizada.id ? atualizada : x)))
          }
        />
      ))}

      {matrizesFiltradas.length === 0 && !criandoNova && propriedades.length > 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {filtroPropriedadeId
            ? `Nenhuma matriz cadastrada para ${nomePropriedade(filtroPropriedadeId)} ainda.`
            : "Nenhuma matriz cadastrada ainda."}
        </p>
      )}
    </div>
  );
}

function CardMatriz({
  matriz,
  propriedades,
  propriedadeIdPadrao,
  expandida,
  expandidaDeInicio,
  onExpandir,
  onSalva,
  onCancelarNova,
}: {
  matriz: MatrizAdmin | null;
  propriedades: Propriedade[];
  propriedadeIdPadrao: string;
  expandida?: boolean;
  expandidaDeInicio?: boolean;
  onExpandir?: () => void;
  onSalva: (m: MatrizAdmin) => void;
  onCancelarNova?: () => void;
}) {
  const [r, setR] = useState<Rascunho>(() => paraRascunho(matriz, propriedadeIdPadrao));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const aberta = expandidaDeInicio || expandida;
  const ehNova = matriz === null;
  const nomePropriedadeAtual = propriedades.find((p) => p.id === r.propriedadeId)?.nome ?? "(propriedade desconhecida)";

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resultado = await salvarMatrizAction({
      id: r.id,
      propriedadeId: r.propriedadeId,
      nome: r.nome,
      ativo: r.ativo,
    });
    setSalvando(false);

    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onSalva(resultado.matriz);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <button type="button" onClick={onExpandir} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {r.nome || "(nova matriz)"}
        </span>
        {matriz && !matriz.ativo && (
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
              placeholder="ex.: Matriz Principal"
            />
          </div>

          <div className="space-y-1">
            <label className={rotulo}>
              Propriedade dona
              {!ehNova && (
                <Ajuda texto="Só nome e ativo/inativo são editáveis nesta tela (repositório salvarMatriz, Task 3) — o dono não muda por aqui depois de criada." />
              )}
            </label>
            {ehNova ? (
              <select
                className={campo}
                value={r.propriedadeId}
                onChange={(e) => setR({ ...r, propriedadeId: e.target.value })}
              >
                {propriedades.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            ) : (
              <input className={`${campo} opacity-60`} value={nomePropriedadeAtual} disabled />
            )}
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

          {!ehNova && matriz && <SecaoEixos matriz={matriz} />}
        </div>
      )}
    </div>
  );
}

function SecaoEixos({ matriz }: { matriz: MatrizAdmin }) {
  return (
    <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
      <p className={rotulo}>
        Temas, ângulos, geografias e sazonalidade
        <Ajuda texto="Só leitura por enquanto: quem gera/edita estes eixos é o Construtor de Matriz de Conteúdo (agente conversacional de pesquisa de palavra-chave), uma ferramenta ainda não construída — ver seção 6 do MODULO_MARKETING_CONTEUDO_ARRUDACRED.md. Até lá, estes campos só são populados direto no banco. Editar aqui prometeria uma funcionalidade que esta tela não tem." />
      </p>

      <ListaSoLeitura titulo="Temas" itens={matriz.temas} />
      <ListaSoLeitura titulo="Ângulos" itens={matriz.angulos} />
      <ListaSoLeitura titulo="Geografias" itens={matriz.geografias} />
      <ListaSoLeitura titulo="Sazonalidade" itens={matriz.sazonalidade} />
    </div>
  );
}

function ListaSoLeitura({ titulo, itens }: { titulo: string; itens: string[] | null }) {
  return (
    <div className="space-y-1">
      <p className={rotulo}>{titulo}</p>
      {itens && itens.length > 0 ? (
        <ul className="list-inside list-disc space-y-0.5 text-sm text-zinc-700 dark:text-zinc-300">
          {itens.map((item, i) => (
            <li key={`${item}-${i}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">Nenhum cadastrado ainda.</p>
      )}
    </div>
  );
}
