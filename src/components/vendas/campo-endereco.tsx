"use client";

import { formatarCep, normalizarCep } from "@/lib/vendas/mascaras";
import { buscarEnderecoPorCepAction } from "./campo-endereco-actions";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export type ValorEndereco = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export const enderecoVazio: ValorEndereco = { cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" };

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const rotulo = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function CampoEndereco({ value, onChange }: { value: ValorEndereco; onChange: (v: ValorEndereco) => void }) {
  async function aoMudarCep(cepDigitado: string) {
    const cepFormatado = formatarCep(cepDigitado);
    onChange({ ...value, cep: cepFormatado });

    if (normalizarCep(cepFormatado).length !== 8) return;
    const encontrado = await buscarEnderecoPorCepAction(cepFormatado);
    if (encontrado) {
      onChange({
        ...value,
        cep: cepFormatado,
        logradouro: encontrado.logradouro,
        bairro: encontrado.bairro,
        cidade: encontrado.cidade,
        uf: encontrado.uf,
      });
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <label className={rotulo} title="Digite o CEP primeiro — o resto do endereço preenche sozinho">
          CEP
        </label>
        <input className={campo} value={value.cep} onChange={(e) => aoMudarCep(e.target.value)} placeholder="00000-000" maxLength={9} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className={rotulo}>Logradouro</label>
          <input className={campo} value={value.logradouro} onChange={(e) => onChange({ ...value, logradouro: e.target.value })} />
        </div>
        <div>
          <label className={rotulo}>Número</label>
          <input className={campo} value={value.numero} onChange={(e) => onChange({ ...value, numero: e.target.value })} />
        </div>
      </div>
      <div>
        <label className={rotulo}>Complemento</label>
        <input className={campo} value={value.complemento} onChange={(e) => onChange({ ...value, complemento: e.target.value })} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={rotulo}>Bairro</label>
          <input className={campo} value={value.bairro} onChange={(e) => onChange({ ...value, bairro: e.target.value })} />
        </div>
        <div>
          <label className={rotulo}>Cidade</label>
          <input className={campo} value={value.cidade} onChange={(e) => onChange({ ...value, cidade: e.target.value })} />
        </div>
        <div>
          <label className={rotulo}>UF</label>
          <select className={campo} value={value.uf} onChange={(e) => onChange({ ...value, uf: e.target.value })}>
            <option value="">--</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
