# Vendas — Detalhes da Venda: quadros de informação completa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans pra implementar task a task. Steps usam checkbox (`- [ ]`).

**Goal:** Reorganizar a parte inferior da tela "Detalhes da Venda" pra mostrar todas as informações disponíveis da venda em cards sempre visíveis, em vez da lógica atual que esconde cards inteiros fora de estágios específicos do Kanban.

**Architecture:** `page.tsx` (Server Component) ganha uma segunda leva de buscas em paralelo (endereço, signatário ArrudaCred, representante legal, fornecedor, template, pacote de documentos) e repassa tudo como props pro Client Component `detalhes-venda-client.tsx`, que troca a lógica condicional-por-status por uma grade de cards sempre renderizados (cada um decide sozinho o que mostrar quando o dado está ausente — "não informado", "aguardando emissão", etc. — em vez do card inteiro sumir).

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind, Supabase — mesmo stack do resto do módulo Vendas. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-08-20-vendas-detalhes-venda-quadros-design.md`

## Global Constraints

- `pnpm exec tsc --noEmit` e `pnpm exec eslint src` limpos antes de cada commit.
- **Sem migration nesta rodada** — todo dado usado já existe no banco. Nenhuma reserva de timestamp em `docs/COORDENACAO_AGENTES_ARRUDACRED.md` necessária.
- **Convenção de teste do módulo Vendas** (repetida de todas as specs/plans anteriores desta sessão, confirmada na spec seção 7): I/O e apresentação (Server/Client Components lendo dado já buscado) **não ganham teste Vitest** — verificação é manual no navegador. Só lógica pura ganharia teste, e este plano não introduz nenhuma. Não escreva teste-primeiro pras tasks abaixo — implemente direto, rode `tsc`/`eslint`, verifique manualmente, e comite.
- Nomenclatura/RLS/auditoria já estabelecidos no módulo — nenhuma tabela nova é criada, então não se aplica aqui.
- Antes de dar push da branch de worktree pra fora: seguir o protocolo de sincronização já estabelecido no projeto (`git fetch origin`, comparar com `origin/main`, `git merge origin/main` local, resolver conflito mantendo os dois lados, rodar testes de novo, só então empurrar).

---

## Task 1: `buscarRepresentanteCompleto`

**Files:**
- Modify: `src/lib/vendas/pessoa-representantes.ts`

**Interfaces:**
- Consumes: `buscarRepresentante(pessoaJuridicaId: string): Promise<{ pessoaFisicaId: string } | null>` (já existe, mesmo arquivo). `buscarPessoaCompleta(pessoaId: string): Promise<PessoaCompleta | null>` de `@/lib/vendas/pessoas` (já existe).
- Produces: `buscarRepresentanteCompleto(pessoaJuridicaId: string): Promise<PessoaCompleta | null>` — usado pela Task 2 (`page.tsx`).

- [ ] **Step 1: Adicionar a função**

Abra `src/lib/vendas/pessoa-representantes.ts` e adicione o import e a função no final do arquivo:

```ts
import { createClient } from "@/lib/supabase/server";
import { buscarPessoaCompleta, type PessoaCompleta } from "./pessoas";
```

(troque a linha `import { createClient } from "@/lib/supabase/server";` existente por essas duas linhas — mantém o import de `createClient` e adiciona o de `pessoas`)

```ts
/** Composição de buscarRepresentante + buscarPessoaCompleta — usado pela tela Detalhes da Venda
 * pra mostrar o representante legal (nome, e-mail, RG etc.) sem espalhar essa junção em quem chama.
 * `null` tanto quando não há representante vinculado quanto quando o vínculo aponta pra uma Pessoa
 * que não existe mais (não deveria acontecer, mas não é motivo pra lançar erro numa tela de leitura). */
export async function buscarRepresentanteCompleto(pessoaJuridicaId: string): Promise<PessoaCompleta | null> {
  const representante = await buscarRepresentante(pessoaJuridicaId);
  if (!representante) return null;
  return buscarPessoaCompleta(representante.pessoaFisicaId);
}
```

O arquivo completo depois desta mudança:

```ts
import { createClient } from "@/lib/supabase/server";
import { buscarPessoaCompleta, type PessoaCompleta } from "./pessoas";

/** Busca o representante legal (Pessoa Física) ativo de uma Pessoa Jurídica — a "representação"
 * não tem data_fim quando ainda vigente. Uma PJ pode ter mais de um representante ao longo do
 * tempo; pra contrato usamos sempre o mais recente sem data_fim. */
export async function buscarRepresentante(pessoaJuridicaId: string): Promise<{ pessoaFisicaId: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pessoa_representantes")
    .select("pessoa_fisica_id")
    .eq("pessoa_juridica_id", pessoaJuridicaId)
    .is("data_fim", null)
    .order("data_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar representante: ${error.message}`);
  if (!data) return null;
  return { pessoaFisicaId: data.pessoa_fisica_id };
}

/** Vincula uma Pessoa Física como representante legal de uma Pessoa Jurídica — idempotente
 * (se o vínculo já existir e estiver ativo, não duplica). */
export async function definirRepresentante(pessoaJuridicaId: string, pessoaFisicaId: string): Promise<void> {
  const supabase = await createClient();
  const existente = await buscarRepresentante(pessoaJuridicaId);
  if (existente?.pessoaFisicaId === pessoaFisicaId) return;

  const { error } = await supabase
    .from("pessoa_representantes")
    .insert({ pessoa_juridica_id: pessoaJuridicaId, pessoa_fisica_id: pessoaFisicaId });
  if (error) throw new Error(`Falha ao definir representante: ${error.message}`);
}

/** Composição de buscarRepresentante + buscarPessoaCompleta — usado pela tela Detalhes da Venda
 * pra mostrar o representante legal (nome, e-mail, RG etc.) sem espalhar essa junção em quem chama.
 * `null` tanto quando não há representante vinculado quanto quando o vínculo aponta pra uma Pessoa
 * que não existe mais (não deveria acontecer, mas não é motivo pra lançar erro numa tela de leitura). */
export async function buscarRepresentanteCompleto(pessoaJuridicaId: string): Promise<PessoaCompleta | null> {
  const representante = await buscarRepresentante(pessoaJuridicaId);
  if (!representante) return null;
  return buscarPessoaCompleta(representante.pessoaFisicaId);
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add src/lib/vendas/pessoa-representantes.ts
git commit -m "feat(vendas): buscarRepresentanteCompleto compõe representante + dados completos"
```

---

## Task 2: `page.tsx` — busca de dados completa

**Files:**
- Modify: `src/app/admin/(shell)/vendas/[oportunidadeId]/page.tsx`

**Interfaces:**
- Consumes: `buscarRepresentanteCompleto` (Task 1). `buscarEnderecoPorPessoa(pessoaId: string, tipo?: TipoEndereco): Promise<EnderecoPessoa | null>` de `@/lib/vendas/endereco` (já existe). `buscarTemplateDocumentoPorId(templateId: string): Promise<TemplateDocumentoCompleto | null>` de `@/lib/vendas/contrato-templates` (já existe). `listarDocumentosPacote(oportunidadeId: string): Promise<DocumentoPacoteLinha[]>` de `@/lib/vendas/oportunidades` (já existe). `buscarPessoaCompleta` (já existe, já importado hoje).
- Produces: passa 6 props novas pro `DetalhesVendaClient` (Task 3): `enderecoCliente: EnderecoPessoa | null`, `pessoaArrudaCred: PessoaCompleta | null`, `representante: PessoaCompleta | null`, `fornecedor: PessoaCompleta | null`, `template: TemplateDocumentoCompleto | null`, `documentosPacote: DocumentoPacoteLinha[]`.

- [ ] **Step 1: Substituir o arquivo inteiro**

O arquivo atual tem `console.log("[DEBUG ...")` de depuração que vazam dado pessoal (nome/documento) nos logs do servidor — removidos nesta mudança junto (achado ao ler o código, mesmo tipo de limpeza já feita em `pessoas.ts` nesta sessão).

Substitua `src/app/admin/(shell)/vendas/[oportunidadeId]/page.tsx` inteiro por:

```tsx
import { notFound } from "next/navigation";
import { buscarContratoPorOportunidade } from "@/lib/vendas/contratos";
import { buscarTemplateDocumentoPorId } from "@/lib/vendas/contrato-templates";
import { buscarEnderecoPorPessoa } from "@/lib/vendas/endereco";
import { buscarOportunidadeParaFechamento, listarDocumentosPacote } from "@/lib/vendas/oportunidades";
import { buscarPessoaCompleta } from "@/lib/vendas/pessoas";
import { buscarRepresentanteCompleto } from "@/lib/vendas/pessoa-representantes";
import { listarTimelineVenda } from "@/lib/vendas/timeline";
import { listarComissoesDaVenda } from "@/lib/vendas/comissoes";
import { gerarUrlAssinadaContrato } from "@/lib/vendas/geracao-pdf";
import { DetalhesVendaClient } from "./detalhes-venda-client";

export default async function DetalhesVendaPage({ params }: { params: Promise<{ oportunidadeId: string }> }) {
  const { oportunidadeId } = await params;

  const oportunidade = await buscarOportunidadeParaFechamento(oportunidadeId);
  if (!oportunidade) notFound();

  const [pessoa, contrato] = await Promise.all([
    buscarPessoaCompleta(oportunidade.pessoaId),
    buscarContratoPorOportunidade(oportunidadeId),
  ]);
  if (!pessoa) notFound();

  const [timeline, comissoes, pdfUrlAssinada] = await Promise.all([
    contrato ? listarTimelineVenda(contrato, oportunidadeId) : Promise.resolve([]),
    oportunidade.produtoTipo === "comissionado" ? listarComissoesDaVenda(oportunidadeId) : Promise.resolve([]),
    contrato?.pdfUrl ? gerarUrlAssinadaContrato(contrato.pdfUrl) : Promise.resolve(null),
  ]);

  // Achado real (Luiz, 20/08/2026): a tela só mostrava assinatura/parcelas/etc. condicionado ao
  // estágio atual do contrato — numa venda já concluída não dava mais pra ver quem assinou, por
  // exemplo. Busca tudo aqui sempre; a tela decide como exibir (ver detalhes-venda-client.tsx).
  const [enderecoCliente, pessoaArrudaCred, representante, fornecedor, template, documentosPacote] = await Promise.all([
    buscarEnderecoPorPessoa(pessoa.id),
    contrato?.pessoaArrudaCredSignatarioId ? buscarPessoaCompleta(contrato.pessoaArrudaCredSignatarioId) : Promise.resolve(null),
    pessoa.tipoPessoa === "pj" ? buscarRepresentanteCompleto(pessoa.id) : Promise.resolve(null),
    contrato?.fornecedorId ? buscarPessoaCompleta(contrato.fornecedorId) : Promise.resolve(null),
    contrato?.contratoTemplateId ? buscarTemplateDocumentoPorId(contrato.contratoTemplateId) : Promise.resolve(null),
    listarDocumentosPacote(oportunidadeId),
  ]);

  return (
    <DetalhesVendaClient
      oportunidade={oportunidade}
      pessoa={pessoa}
      contrato={contrato}
      timeline={timeline}
      comissoes={comissoes}
      pdfUrlAssinada={pdfUrlAssinada}
      enderecoCliente={enderecoCliente}
      pessoaArrudaCred={pessoaArrudaCred}
      representante={representante}
      fornecedor={fornecedor}
      template={template}
      documentosPacote={documentosPacote}
    />
  );
}
```

- [ ] **Step 2: Verificar tipos (vai falhar até a Task 3 atualizar o Props do client — esperado)**

Run: `pnpm exec tsc --noEmit`
Expected: erro em `detalhes-venda-client.tsx` reclamando que `DetalhesVendaClient` não aceita essas props novas — é esperado, a Task 3 resolve. Confirme que o erro é exatamente esse (props não reconhecidas), não outra coisa (import errado, nome de campo digitado errado, etc.).

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(shell)/vendas/[oportunidadeId]/page.tsx"
git commit -m "feat(vendas): Detalhes da Venda busca endereco/representante/fornecedor/template/pacote"
```

---

## Task 3: `detalhes-venda-client.tsx` — cards sempre visíveis em grade

**Files:**
- Modify: `src/app/admin/(shell)/vendas/[oportunidadeId]/detalhes-venda-client.tsx`

**Interfaces:**
- Consumes: as 6 props novas produzidas pela Task 2. `EnderecoPessoa` de `@/lib/vendas/endereco`. `DocumentoPacoteLinha`, `TipoProduto` de `@/lib/vendas/oportunidades`. `TemplateDocumentoCompleto` de `@/lib/vendas/contrato-templates`. `formatarCep`, `formatarTelefone` de `@/lib/vendas/mascaras` (`formatarCpfCnpj` já é importado hoje).
- Produces: nada consumido por outra task — é a ponta final da cadeia desta feature.

- [ ] **Step 1: Substituir o arquivo inteiro**

Substitua `src/app/admin/(shell)/vendas/[oportunidadeId]/detalhes-venda-client.tsx` inteiro por:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import type { AssinafyDocumento, AssinafySignatarioStatus } from "@/lib/assinafy/cliente";
import type { CobrancaStatus } from "@/lib/asaas/cliente";
import type { ComissaoFornecedor } from "@/lib/vendas/comissoes";
import type { TemplateDocumentoCompleto } from "@/lib/vendas/contrato-templates";
import type { Contrato, ContratoParcela, FormaPagamento, MetodoPagamento } from "@/lib/vendas/contratos";
import type { EnderecoPessoa } from "@/lib/vendas/endereco";
import { corEstagio, rotuloEstagio } from "@/lib/vendas/estagio-venda";
import { formatarCep, formatarCpfCnpj, formatarTelefone } from "@/lib/vendas/mascaras";
import type { DocumentoPacoteLinha, OportunidadeFechamento, TipoProduto } from "@/lib/vendas/oportunidades";
import type { PessoaCompleta } from "@/lib/vendas/pessoas";
import type { EventoTimeline } from "@/lib/vendas/timeline";
import {
  buscarStatusAssinaturaAction,
  buscarStatusCobrancasAction,
  cancelarVendaDetalhesAction,
  marcarComissaoRecebidaAction,
  reenviarLinkAction,
  tentarNovamenteAction,
} from "./actions";

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const cardBase = "rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900";
const botaoSecundario =
  "rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

const TIPO_PRODUTO_LABEL: Record<TipoProduto, string> = {
  proprio: "Próprio",
  subcontratado: "Subcontratado",
  comissionado: "Comissionado",
};
// Record<FormaPagamento/MetodoPagamento, string> em vez de Record<string, string> — tipagem
// exaustiva de propósito (achado real registrado em docs/status/vendas.md: um Record<string,string>
// sem exaustividade em emissao-contrato.ts ficou como Minor pendente; aqui já nasce corrigido).
const FORMA_PAGAMENTO_LABEL: Record<FormaPagamento, string> = { avista: "À vista", parcelado: "Parcelado" };
const METODO_PAGAMENTO_LABEL: Record<MetodoPagamento, string> = { boleto_pix: "Boleto/Pix", cartao: "Cartão de crédito" };

function formatarValor(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(data: string): string {
  return new Date(data).toLocaleDateString("pt-BR");
}

function formatarEndereco(endereco: EnderecoPessoa | null): string | null {
  if (!endereco) return null;
  const partes = [
    `${endereco.logradouro}, ${endereco.numero}`,
    endereco.complemento,
    endereco.bairro,
    `${endereco.cidade}/${endereco.uf}`,
    formatarCep(endereco.cep),
  ].filter((parte): parte is string => Boolean(parte && parte.trim()));
  return partes.join(" — ");
}

function LinkCopiavel({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(link);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
      className={botaoSecundario}
    >
      {copiado ? "Copiado!" : "Copiar link"}
    </button>
  );
}

function BotoesReenvio({
  pessoaId,
  contexto,
  link,
}: {
  pessoaId: string;
  contexto: "assinatura" | "pagamento";
  link: string;
}) {
  const [enviando, setEnviando] = useState<"whatsapp" | "email" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<"whatsapp" | "email" | null>(null);

  async function enviar(canal: "whatsapp" | "email") {
    setEnviando(canal);
    setErro(null);
    const resultado = await reenviarLinkAction(pessoaId, canal, contexto, link);
    setEnviando(null);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setEnviado(canal);
    setTimeout(() => setEnviado(null), 2500);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => enviar("whatsapp")} disabled={enviando !== null} className={botaoSecundario}>
        {enviando === "whatsapp" ? "Enviando..." : enviado === "whatsapp" ? "Enviado!" : "WhatsApp"}
      </button>
      <button type="button" onClick={() => enviar("email")} disabled={enviando !== null} className={botaoSecundario}>
        {enviando === "email" ? "Enviando..." : enviado === "email" ? "Enviado!" : "E-mail"}
      </button>
      <LinkCopiavel link={link} />
      {erro && <p className="w-full text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}

function LinhaDado({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <p className="text-sm text-zinc-600 dark:text-zinc-400">
      <span className="text-zinc-900 dark:text-zinc-50">{rotulo}:</span> {valor && valor.trim() ? valor : "não informado"}
    </p>
  );
}

function CardDadosCliente({ pessoa, endereco }: { pessoa: PessoaCompleta; endereco: EnderecoPessoa | null }) {
  return (
    <div className={cardBase}>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Dados do Cliente</h3>
      <div className="mt-2 space-y-1">
        <LinhaDado rotulo="Nome/Razão social" valor={pessoa.nomeRazaoSocial} />
        <LinhaDado rotulo="Documento" valor={formatarCpfCnpj(pessoa.documento)} />
        <LinhaDado rotulo="Tipo" valor={pessoa.tipoPessoa === "pf" ? "Pessoa Física" : "Pessoa Jurídica"} />
        <LinhaDado rotulo="E-mail" valor={pessoa.email} />
        <LinhaDado rotulo="WhatsApp" valor={pessoa.whatsapp ? formatarTelefone(pessoa.whatsapp) : null} />
        <LinhaDado rotulo="Endereço" valor={formatarEndereco(endereco)} />
        {pessoa.tipoPessoa === "pf" && (
          <>
            <LinhaDado rotulo="RG" valor={pessoa.rg} />
            <LinhaDado rotulo="Estado civil" valor={pessoa.estadoCivil} />
            <LinhaDado rotulo="Profissão" valor={pessoa.profissao} />
          </>
        )}
      </div>
    </div>
  );
}

function CardDadosDaVenda({
  oportunidade,
  fornecedor,
  template,
}: {
  oportunidade: OportunidadeFechamento;
  fornecedor: PessoaCompleta | null;
  template: TemplateDocumentoCompleto | null;
}) {
  return (
    <div className={cardBase}>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Dados da Venda</h3>
      <div className="mt-2 space-y-1">
        <LinhaDado rotulo="Produto" valor={oportunidade.produtoNome} />
        <LinhaDado rotulo="Tipo" valor={TIPO_PRODUTO_LABEL[oportunidade.produtoTipo]} />
        <LinhaDado rotulo="Fornecedor" valor={fornecedor?.nomeRazaoSocial ?? null} />
        <LinhaDado rotulo="Template do contrato" valor={template?.nome ?? "nenhum template ativo pra este produto"} />
      </div>
    </div>
  );
}

type ParteContrato = { papel: string; nome: string; email: string | null };

function montarPartes(
  pessoa: PessoaCompleta,
  representante: PessoaCompleta | null,
  pessoaArrudaCred: PessoaCompleta | null,
): ParteContrato[] {
  const partes: ParteContrato[] = [{ papel: "Cliente", nome: pessoa.nomeRazaoSocial, email: pessoa.email }];
  if (representante) partes.push({ papel: "Representante legal", nome: representante.nomeRazaoSocial, email: representante.email });
  if (pessoaArrudaCred) partes.push({ papel: "Signatário ArrudaCred", nome: pessoaArrudaCred.nomeRazaoSocial, email: pessoaArrudaCred.email });
  return partes;
}

function CardPartesDoContrato({
  contrato,
  pessoa,
  representante,
  pessoaArrudaCred,
}: {
  contrato: Contrato;
  pessoa: PessoaCompleta;
  representante: PessoaCompleta | null;
  pessoaArrudaCred: PessoaCompleta | null;
}) {
  const [documento, setDocumento] = useState<AssinafyDocumento | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const partes = montarPartes(pessoa, representante, pessoaArrudaCred);

  async function verificar() {
    if (!contrato.assinafyDocumentId) return;
    setCarregando(true);
    setErro(null);
    const resultado = await buscarStatusAssinaturaAction(contrato.assinafyDocumentId);
    setCarregando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    setDocumento(resultado.documento);
  }

  function statusDaParte(email: string | null): AssinafySignatarioStatus | null {
    if (!documento || !email) return null;
    return documento.signatarios.find((s) => s.email === email) ?? null;
  }

  return (
    <div className={cardBase}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Partes do Contrato</h3>
        {contrato.assinafyDocumentId && (
          <button type="button" onClick={verificar} disabled={carregando} className={botaoSecundario}>
            {carregando ? "Verificando..." : "Verificar assinaturas agora"}
          </button>
        )}
      </div>
      {!contrato.assinafyDocumentId && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Aguardando emissão do contrato.</p>
      )}
      {contrato.assinafyDocumentId && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Estágio salvo no banco: {contrato.assinafyDocumentStatus ?? "ainda não sincronizado"}. Clique em &quot;Verificar&quot; pra ver o
          status exato na Assinafy neste instante.
        </p>
      )}
      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <ul className="mt-3 space-y-3">
        {partes.map((parte) => {
          const status = statusDaParte(parte.email);
          return (
            <li key={parte.papel} className="rounded border border-zinc-200 p-2 text-sm dark:border-zinc-700">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{parte.papel}</p>
              <p className="text-zinc-900 dark:text-zinc-50">
                {parte.nome} {parte.email && <span className="text-xs text-zinc-500 dark:text-zinc-400">({parte.email})</span>}
              </p>
              {status && (
                <p className={status.completo ? "text-xs text-emerald-600 dark:text-emerald-400" : "text-xs text-amber-600 dark:text-amber-400"}>
                  {status.completo ? "Já assinou" : "Ainda não assinou"}
                </p>
              )}
              {/* Reenvio só pro cliente — o signatário da ArrudaCred não tem pessoaId conhecido aqui
                  (é o id do signatário na Assinafy, não um pessoas.id nosso), e não faz sentido
                  reenviar por WhatsApp/e-mail pra alguém da própria equipe. */}
              {status && !status.completo && status.url && parte.email === pessoa.email && (
                <div className="mt-2">
                  <BotoesReenvio pessoaId={pessoa.id} contexto="assinatura" link={status.url} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CardFinanceiro({ contrato, pessoa }: { contrato: Contrato; pessoa: PessoaCompleta }) {
  const [status, setStatus] = useState<Map<string, CobrancaStatus>>(new Map());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const parcelasComCobranca = contrato.parcelas.filter((p) => p.status !== "previsto");

  async function verificar() {
    setCarregando(true);
    setErro(null);
    const ids = parcelasComCobranca.map((p) => p.id);
    const resultado = await buscarStatusCobrancasAction(ids);
    setCarregando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    const mapa = new Map<string, CobrancaStatus>();
    resultado.cobrancas.forEach((c, i) => mapa.set(ids[i], c));
    setStatus(mapa);
  }

  return (
    <div className={cardBase}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Financeiro</h3>
        <button
          type="button"
          onClick={verificar}
          disabled={carregando || parcelasComCobranca.length === 0}
          className={botaoSecundario}
        >
          {carregando ? "Verificando..." : "Verificar cobranças agora"}
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {contrato.formaPagamento ? FORMA_PAGAMENTO_LABEL[contrato.formaPagamento] : "—"} —{" "}
        {contrato.metodoPagamento ? METODO_PAGAMENTO_LABEL[contrato.metodoPagamento] : "—"} — valor total {formatarValor(contrato.valorTotal)}
      </p>
      {parcelasComCobranca.length === 0 && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Ainda não há cobrança gerada na Asaas.</p>
      )}
      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <th className="py-1">Parcela</th>
            <th className="py-1">Vencimento</th>
            <th className="py-1">Valor</th>
            <th className="py-1">Status</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {contrato.parcelas.map((parcela: ContratoParcela) => {
            const cobranca = status.get(parcela.id);
            return (
              <tr key={parcela.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="py-1">{parcela.numero}</td>
                <td className="py-1">{formatarData(parcela.vencimentoPrevisto)}</td>
                <td className="py-1">{formatarValor(parcela.valor)}</td>
                <td className="py-1">{cobranca ? `${parcela.status} (Asaas: ${cobranca.status})` : parcela.status}</td>
                <td className="py-1">
                  {cobranca && parcela.status !== "pago" && (
                    <BotoesReenvio pessoaId={pessoa.id} contexto="pagamento" link={cobranca.invoiceUrl} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CardPacoteDocumentos({ documentos }: { documentos: DocumentoPacoteLinha[] }) {
  return (
    <div className={cardBase}>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Pacote de Documentos</h3>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <th className="py-1">Documento</th>
            <th className="py-1">Nome/Razão social</th>
          </tr>
        </thead>
        <tbody>
          {documentos.map((d) => (
            <tr key={d.id} className="border-b border-zinc-100 dark:border-zinc-800">
              <td className="py-1">{formatarCpfCnpj(d.documento)}</td>
              <td className="py-1">{d.nomeRazaoSocial}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PainelComissoes({ comissoes, onMudou }: { comissoes: ComissaoFornecedor[]; onMudou: () => void }) {
  const [processando, setProcessando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function marcarRecebida(id: string) {
    setProcessando(id);
    setErro(null);
    const resultado = await marcarComissaoRecebidaAction(id, new Date().toISOString());
    setProcessando(null);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onMudou();
  }

  return (
    <div className={cardBase}>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Comissão do fornecedor</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Sem link de pagamento aqui — quem paga é o fornecedor pra ArrudaCred. Marque manualmente quando o valor cair.
      </p>
      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <th className="py-1">Parcela</th>
            <th className="py-1">Previsão</th>
            <th className="py-1">Valor</th>
            <th className="py-1">Status</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {comissoes.map((c) => (
            <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-800">
              <td className="py-1">{c.numero}</td>
              <td className="py-1">{formatarData(c.dataPrevista)}</td>
              <td className="py-1">{formatarValor(c.valor)}</td>
              <td className="py-1">{c.status === "recebido" ? `Recebida em ${formatarData(c.recebidoEm!)}` : "Prevista"}</td>
              <td className="py-1">
                {c.status === "previsto" && (
                  <button type="button" onClick={() => marcarRecebida(c.id)} disabled={processando === c.id} className={botaoSecundario}>
                    {processando === c.id ? "Marcando..." : "Marcar recebida"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BotaoCancelar({ contratoId, onCancelado }: { contratoId: string; onCancelado: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    if (!motivo.trim()) {
      setErro("Descreva o motivo do cancelamento.");
      return;
    }
    setEnviando(true);
    const resultado = await cancelarVendaDetalhesAction(contratoId, motivo.trim());
    setEnviando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onCancelado();
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-full border border-amber-300 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
      >
        Cancelar venda
      </button>
    );
  }

  return (
    <div className="space-y-1 rounded border border-amber-300 p-2 dark:border-amber-700">
      <label className="text-xs text-zinc-600 dark:text-zinc-400">Motivo do cancelamento</label>
      <input className={campo} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente desistiu antes de assinar" />
      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <button type="button" onClick={confirmar} disabled={enviando} className="text-xs font-medium text-amber-700 dark:text-amber-400">
        {enviando ? "Cancelando..." : "Confirmar cancelamento"}
      </button>
    </div>
  );
}

function PainelErroTentativas({ contrato, onTentou }: { contrato: Contrato; onTentou: () => void }) {
  const [tentando, setTentando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function tentar() {
    setTentando(true);
    setErro(null);
    const resultado = await tentarNovamenteAction(contrato.id);
    setTentando(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro);
      return;
    }
    onTentou();
  }

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm dark:border-red-700 dark:bg-red-950">
      <p className="text-red-700 dark:text-red-400">{contrato.ultimoErro}</p>
      {/* Não existe retentativa automática de verdade hoje (só uma tentativa por etapa, ver
         progressao.ts) — então qualquer erro já é candidato a retentativa manual, não só depois de
         3 falhas (achado real da revisão final da branch: com o gate >= 3, um contrato com 1 erro
         ficava preso pra sempre, sem essa ação nem aparecer). */}
      <button
        type="button"
        onClick={tentar}
        disabled={tentando}
        className="mt-2 text-xs font-medium text-red-700 underline dark:text-red-400"
      >
        {tentando ? "Tentando..." : "Tentar novamente"}
      </button>
      {erro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}

type Props = {
  oportunidade: OportunidadeFechamento;
  pessoa: PessoaCompleta;
  contrato: Contrato | null;
  timeline: EventoTimeline[];
  comissoes: ComissaoFornecedor[];
  pdfUrlAssinada: string | null;
  enderecoCliente: EnderecoPessoa | null;
  pessoaArrudaCred: PessoaCompleta | null;
  representante: PessoaCompleta | null;
  fornecedor: PessoaCompleta | null;
  template: TemplateDocumentoCompleto | null;
  documentosPacote: DocumentoPacoteLinha[];
};

export function DetalhesVendaClient({
  oportunidade,
  pessoa,
  contrato,
  timeline,
  comissoes,
  pdfUrlAssinada,
  enderecoCliente,
  pessoaArrudaCred,
  representante,
  fornecedor,
  template,
  documentosPacote,
}: Props) {
  function recarregarPagina() {
    window.location.reload();
  }

  const ehComissionado = oportunidade.produtoTipo === "comissionado";

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {pessoa.nomeRazaoSocial} <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">({formatarCpfCnpj(pessoa.documento)})</span>
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {oportunidade.produtoNome} — {formatarValor(oportunidade.valorEstimado)}
          </p>
        </div>
        <Link href="/admin/vendas" className="text-xs text-zinc-500 underline dark:text-zinc-400">
          ← Painel de Vendas
        </Link>
      </div>

      {!contrato && (
        <div className={cardBase}>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Essa venda ainda não foi registrada.</p>
          <Link
            href={
              ehComissionado
                ? `/admin/vendas/${oportunidade.id}/confirmar-comissionada`
                : `/admin/vendas/${oportunidade.id}/fechamento`
            }
            className="mt-2 inline-block rounded-full bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            {ehComissionado ? "Confirmar venda" : "Ir para Fechamento de Venda"}
          </Link>
        </div>
      )}

      {contrato && (
        <>
          {contrato.ultimoErro && <PainelErroTentativas contrato={contrato} onTentou={recarregarPagina} />}

          <div className={cardBase}>
            <div className="flex items-center justify-between">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: corEstagio(contrato.status) }}
              >
                {rotuloEstagio(contrato.status)}
              </span>
              {contrato.status !== "cancelada" && contrato.status !== "concluida" && (
                <BotaoCancelar contratoId={contrato.id} onCancelado={recarregarPagina} />
              )}
            </div>
            {pdfUrlAssinada && (
              <a href={pdfUrlAssinada} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-zinc-900 underline dark:text-zinc-50">
                Ver PDF do contrato
              </a>
            )}
            {contrato.status === "cancelada" && contrato.motivoCancelamento && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Motivo: {contrato.motivoCancelamento}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CardDadosCliente pessoa={pessoa} endereco={enderecoCliente} />
            <CardDadosDaVenda oportunidade={oportunidade} fornecedor={fornecedor} template={template} />

            {!ehComissionado && (
              <div className="md:col-span-2">
                <CardPartesDoContrato contrato={contrato} pessoa={pessoa} representante={representante} pessoaArrudaCred={pessoaArrudaCred} />
              </div>
            )}

            {!ehComissionado && (
              <div className="md:col-span-2">
                <CardFinanceiro contrato={contrato} pessoa={pessoa} />
              </div>
            )}

            {documentosPacote.length > 0 && <CardPacoteDocumentos documentos={documentosPacote} />}

            {ehComissionado && comissoes.length > 0 && <PainelComissoes comissoes={comissoes} onMudou={recarregarPagina} />}
          </div>

          {timeline.length > 0 && (
            <div className={cardBase}>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Histórico</h3>
              <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                {timeline.map((evento, i) => (
                  <li key={i}>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatarData(evento.data)}</span> — {evento.texto}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

Nota: `max-w-2xl` virou `max-w-4xl` no container principal — a grade de 2 colunas não cabe legivelmente na largura antiga.

- [ ] **Step 2: Verificar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sem erro (isso também confirma que a Task 2 está correta — os dois arquivos se encaixam).

- [ ] **Step 3: Verificar lint**

Run: `pnpm exec eslint "src/app/admin/(shell)/vendas/[oportunidadeId]/detalhes-venda-client.tsx" "src/app/admin/(shell)/vendas/[oportunidadeId]/page.tsx" src/lib/vendas/pessoa-representantes.ts`
Expected: sem erro.

- [ ] **Step 4: Rodar a suite completa (garante que nada em Vendas quebrou)**

Run: `pnpm exec vitest run`
Expected: mesma contagem de testes verde de antes desta mudança — este plano não adiciona nem remove teste nenhum.

- [ ] **Step 5: Verificação manual no navegador**

Abra `/admin/vendas/<oportunidadeId>` de uma venda real (produto próprio ou subcontratado, com contrato já criado) e confira:
- Os cards Dados do Cliente e Dados da Venda aparecem lado a lado com os dados certos.
- Partes do Contrato aparece mesmo se a venda já estiver concluída (não só durante "Aguardando Assinaturas").
- Financeiro aparece mesmo se a venda ainda estiver em "Emitindo Contrato" (mostra "ainda não há cobrança gerada").
- Se o produto exigir pacote de documentos, o card aparece com a lista certa; se não, o card não aparece.
- Abra também uma venda comissionada: Partes do Contrato e Financeiro não aparecem (mesma exclusão de antes), Comissão do Fornecedor aparece normalmente.
- Testar os botões que já existiam (cancelar, tentar novamente, verificar assinatura/cobrança, reenviar link, marcar comissão recebida) continuam funcionando.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/(shell)/vendas/[oportunidadeId]/detalhes-venda-client.tsx"
git commit -m "feat(vendas): Detalhes da Venda mostra todos os quadros sempre, sem gate por estagio"
```

---

## Verification

- `pnpm exec tsc --noEmit`, `pnpm exec eslint src`, `pnpm exec vitest run` — todos limpos/verdes.
- Verificação manual da Task 3, Step 5, repetida uma última vez depois de todas as tasks juntas.
- Confirma contra a spec (seção 5): os 6 cards existem com o conteúdo exato descrito, sem gate de status nos que antes tinham.
- Seção 8 da spec ("drill-down por item") **não vira código nesta rodada** — confirmar que nenhuma task acima introduziu um botão "Ver detalhes" ou tela nova; é só o texto da spec que registra a intenção.
