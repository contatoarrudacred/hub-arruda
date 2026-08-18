"use client";

import { useState } from "react";
import { Ajuda } from "@/components/marketing/ajuda";
import type { NivelConhecimento, PersonaFormulario } from "@/lib/marketing/tipos";
import type { MatrizParaPersona } from "./page";
import { salvarPersonaAction } from "./actions";

const NIVEIS: { valor: NivelConhecimento; rotulo: string }[] = [
  { valor: "iniciante", rotulo: "Iniciante" },
  { valor: "intermediario", rotulo: "Intermediário" },
  { valor: "avancado", rotulo: "Avançado" },
];

const PERSONA_VAZIA: PersonaFormulario = {
  nome: "",
  perfilDemografico: "",
  tomDeVoz: "",
  nivelConhecimento: "iniciante",
  doresNecessidades: "",
  objecoesTipicas: [],
  vocabularioPreferido: [],
  vocabularioEvitar: [],
};

// Uma linha em branco por item (textarea) — decisão de UI mais simples que tags, sem exigir um
// componente novo de input, e fácil de editar (colar uma lista, apagar uma linha).
function linhasParaLista(texto: string): string[] {
  return texto
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);
}

function listaParaLinhas(lista: string[]): string {
  return lista.join("\n");
}

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function PersonasClient({
  matrizes,
  personasPorMatrizId,
}: {
  matrizes: MatrizParaPersona[];
  personasPorMatrizId: Record<string, PersonaFormulario | null>;
}) {
  const [matrizSelecionadaId, setMatrizSelecionadaId] = useState(matrizes[0]?.id ?? "");
  const [personas, setPersonas] = useState(personasPorMatrizId);

  const matrizSelecionada = matrizes.find((m) => m.id === matrizSelecionadaId) ?? null;

  return (
    <div className="max-w-3xl space-y-4 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Personas</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Uma persona por matriz de conteúdo — na prática, por site quando o site tem uma matriz só.
        </p>
      </div>

      {matrizes.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nenhuma matriz de conteúdo cadastrada ainda — crie uma em Matrizes de Conteúdo antes de definir a persona.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <label className={rotulo}>Matriz</label>
            <select
              className={`${campo} max-w-md`}
              value={matrizSelecionadaId}
              onChange={(e) => setMatrizSelecionadaId(e.target.value)}
            >
              {matrizes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.propriedadeNome ? `${m.propriedadeNome} — ${m.nome}` : m.nome}
                </option>
              ))}
            </select>
          </div>

          {matrizSelecionada && (
            <FormularioPersona
              key={matrizSelecionada.id}
              matrizId={matrizSelecionada.id}
              personaInicial={personas[matrizSelecionada.id] ?? null}
              onSalva={(persona) => setPersonas((atual) => ({ ...atual, [matrizSelecionada.id]: persona }))}
            />
          )}
        </>
      )}
    </div>
  );
}

function FormularioPersona({
  matrizId,
  personaInicial,
  onSalva,
}: {
  matrizId: string;
  personaInicial: PersonaFormulario | null;
  onSalva: (persona: PersonaFormulario) => void;
}) {
  const [p, setP] = useState<PersonaFormulario>(personaInicial ?? PERSONA_VAZIA);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  async function salvar() {
    setErro(null);
    setSucesso(false);
    setSalvando(true);
    const resultado = await salvarPersonaAction({ matrizId, persona: p });
    setSalvando(false);

    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setP(resultado.persona);
    setSucesso(true);
    onSalva(resultado.persona);
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center gap-1">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Como esta persona é usada</p>
        <Ajuda texto="Alimenta o prompt do Agente Escritor ao gerar conteúdo para esta matriz — tom de voz, vocabulário, objeções e nível de conhecimento assumido moldam o texto gerado. A extensão do Escritor que de fato cruza esta persona com a pauta/checklist ainda não foi feita (é trabalho de código separado, ainda não construído) — cadastrar aqui já deixa os dados prontos para quando essa integração existir." />
      </div>

      <div className="space-y-1">
        <label className={rotulo}>Nome da persona</label>
        <input
          className={campo}
          value={p.nome}
          onChange={(e) => setP({ ...p, nome: e.target.value })}
          placeholder="ex.: Marcos, o autônomo endividado"
        />
      </div>

      <div className="space-y-1">
        <label className={rotulo}>Perfil demográfico/comportamental</label>
        <textarea
          className={campo}
          rows={3}
          value={p.perfilDemografico}
          onChange={(e) => setP({ ...p, perfilDemografico: e.target.value })}
          placeholder="Idade, renda, ocupação, hábitos relevantes..."
        />
      </div>

      <div className="space-y-1">
        <label className={rotulo}>Tom de voz</label>
        <textarea
          className={campo}
          rows={2}
          value={p.tomDeVoz}
          onChange={(e) => setP({ ...p, tomDeVoz: e.target.value })}
          placeholder="ex.: acolhedor, direto, sem jargão técnico"
        />
      </div>

      <div className="space-y-1">
        <label className={rotulo}>Nível de conhecimento assumido</label>
        <select
          className={campo}
          value={p.nivelConhecimento}
          onChange={(e) => setP({ ...p, nivelConhecimento: e.target.value as NivelConhecimento })}
        >
          {NIVEIS.map((n) => (
            <option key={n.valor} value={n.valor}>
              {n.rotulo}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className={rotulo}>Dores e necessidades principais</label>
        <textarea
          className={campo}
          rows={3}
          value={p.doresNecessidades}
          onChange={(e) => setP({ ...p, doresNecessidades: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <label className={rotulo}>
          Objeções típicas
          <Ajuda texto="Uma por linha." />
        </label>
        <textarea
          className={`${campo} font-mono`}
          rows={4}
          value={listaParaLinhas(p.objecoesTipicas)}
          onChange={(e) => setP({ ...p, objecoesTipicas: linhasParaLista(e.target.value) })}
          placeholder={"ex.: \"Já tentei e não funcionou\"\n\"Não confio em empresa de limpa nome\""}
        />
      </div>

      <div className="space-y-1">
        <label className={rotulo}>
          Vocabulário preferido
          <Ajuda texto="Um termo por linha." />
        </label>
        <textarea
          className={`${campo} font-mono`}
          rows={3}
          value={listaParaLinhas(p.vocabularioPreferido)}
          onChange={(e) => setP({ ...p, vocabularioPreferido: linhasParaLista(e.target.value) })}
          placeholder={"ex.: negociação\nregularizar o nome"}
        />
      </div>

      <div className="space-y-1">
        <label className={rotulo}>
          Vocabulário a evitar
          <Ajuda texto="Um termo por linha." />
        </label>
        <textarea
          className={`${campo} font-mono`}
          rows={3}
          value={listaParaLinhas(p.vocabularioEvitar)}
          onChange={(e) => setP({ ...p, vocabularioEvitar: linhasParaLista(e.target.value) })}
          placeholder={"ex.: dívida\ninadimplente"}
        />
      </div>

      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
      {sucesso && !erro && <p className="text-sm text-emerald-600 dark:text-emerald-400">Persona salva.</p>}

      <div className="flex justify-end pt-1">
        <button
          onClick={salvar}
          disabled={salvando}
          className="rounded-full bg-zinc-900 px-5 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
