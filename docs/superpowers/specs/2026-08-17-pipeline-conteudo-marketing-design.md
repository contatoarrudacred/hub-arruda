# Pipeline de Conteúdo Marketing — Design de Implementação

**Data:** 17/08/2026
**Status:** Spec aprovada em conversa, aguardando revisão do arquivo antes de virar plano de implementação.
**Documento irmão:** `docs/MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` — este arquivo é a arquitetura de engenharia; o outro é a estratégia de conteúdo/negócio. Onde os dois se sobrepõem (modelo de dados, catálogos), o `MODULO_MARKETING` é a fonte de verdade viva; este documento aprofunda a implementação.

---

## 1. Objetivo

Motor que gera, revisa, publica e distribui conteúdo (posts de blog, páginas de site, teasers multi-canal) para múltiplas propriedades digitais, **sem depender de aprovação humana no loop**, respeitando o modelo de dados e os catálogos generalizados já definidos em `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md`.

Fora de escopo desta spec (ver pendências do documento irmão): Construtor de Matriz de Conteúdo (é uma ferramenta de setup semi-interativa, não um estágio do pipeline automático), geração de criativos originais por IA (fase 2), Agente de Backlinks (mantém aprovação humana, sem mudança de arquitetura).

---

## 2. Por que sem aprovação humana é seguro

Nada fica público até passar por dois gates de qualidade:

1. **Revisão pré-publicação** (estágio 2) — valida o rascunho antes de qualquer coisa ir pro WordPress.
2. **Distribuição e aprovação** (estágio 4) — só roda depois do post já estar publicado de verdade no WordPress com URL real; gera e confere os derivados por canal antes de publicá-los.

Reprovação em qualquer um dos dois gates significa **regenerar e reavaliar em loop** — nunca "despublicar", porque nada externo ao pipeline ficou visível antes da aprovação final. Um limite de tentativas (circuit breaker) evita loop infinito de custo.

---

## 3. Arquitetura

### 3.1 Orquestração — fila simples no Supabase (revisado 17/08/2026, substitui o Vercel Workflow SDK)

**Decisão revertida:** a primeira versão desta spec escolhia o Vercel Workflow SDK. Na implementação (Task 8), o empacotamento de steps do SDK (via esbuild, dependência transitiva `builtin-modules`) esbarrou numa incompatibilidade com Node 24 (`ERR_IMPORT_ATTRIBUTE_MISSING`) sem correção viável sem mexer na versão de Node do projeto/Vercel — mudança que afetaria todos os módulos já em produção (atendimento, WhatsApp), não só o Marketing. Luiz decidiu (17/08/2026) migrar pra fila simples no Supabase, reaproveitando o mesmo padrão **já validado em produção** pelo cron de follow-up do WhatsApp (`src/lib/motor-fluxo/motor-followup.ts` / `dispararItemFollowup`): sem dependência nova, sem risco de versão de Node, "terreno conhecido".

**O insight que simplifica tudo:** os repositórios da Task 3 (`selecionarProximaPautaPendente`, `marcarPautaEmProducao`, `registrarReprovacaoPauta`, `marcarPautaBloqueada`) já foram desenhados de forma orientada a estado/status desde o início — nenhum deles é específico do Workflow SDK. `registrarReprovacaoPauta` já devolve a pauta pro status `pendente` (incrementando `tentativas`), então o **próximo ciclo do cron naturalmente re-seleciona a mesma pauta pra nova tentativa** — não precisa de uma máquina de estados nova nem coluna `etapa_atual`. Cada execução do cron processa **uma tentativa completa** (gerar → revisar → publicar) de uma pauta por matriz, não o loop inteiro de até 3 tentativas de uma vez — isso mantém cada execução curta (bem dentro do limite de tempo de função), ao custo de o pipeline avançar "tentativa por tentativa, tick por tick do cron" em vez de tudo numa chamada só.

```typescript
// src/lib/marketing/processar-pauta.ts
export async function processarProximaPauta(matrizConteudoId: string, propriedadeId: string) {
  const propriedade = await carregarPropriedade(propriedadeId);
  const pauta = await selecionarPauta(matrizConteudoId); // Estrategista: seleciona + marca em_producao
  if (!pauta) return { status: "sem_pauta" as const };

  if (pauta.tentativas >= propriedade.maxTentativas) {
    await marcarPautaBloqueada(pauta.id, pauta.motivoUltimaReprovacao ?? "Limite de tentativas esgotado.");
    return { status: "bloqueada" as const, pautaId: pauta.id };
  }

  const checklist = await carregarChecklistAtivo(propriedadeId);
  const conteudo = await gerarConteudo(pauta, checklist);
  const revisao = await revisarConteudo(conteudo, checklist);

  if (!revisao.aprovado) {
    await registrarReprovacaoPauta(pauta.id, revisao.motivo ?? "Reprovado sem motivo detalhado.");
    return { status: "reprovado" as const, pautaId: pauta.id }; // próximo tick do cron tenta de novo
  }

  const post = await criarPost({ pautaId: pauta.id, propriedadeId, conteudo, scoreQa: revisao.score });
  const adaptador = criarAdaptadorWordPress(propriedade.urlBase);
  const rascunho = await adaptador.criarRascunho({
    titulo: conteudo.titulo, corpoHtml: conteudo.conteudoHtml, slug: conteudo.slug,
    metaTitle: conteudo.metaTitle, metaDescription: conteudo.metaDescription,
  });
  const verificacao = await adaptador.verificarRascunho(rascunho.idRemoto);
  if (!verificacao.ok) {
    await atualizarStatusPost(post.id, "falhou");
    await registrarReprovacaoPauta(pauta.id, verificacao.detalhes ?? "Rascunho não conforme no WordPress.");
    return { status: "reprovado" as const, pautaId: pauta.id };
  }

  const publicado = await adaptador.aprovarPublicar(rascunho.idRemoto);
  await atualizarStatusPost(post.id, "publicado", {
    canais: { wordpress: { rascunho_id: rascunho.idRemoto, status: "publicado", url: publicado.urlPublicada } },
    publicadoEm: new Date().toISOString(),
  });
  await marcarPautaPublicada(pauta.id);
  return { status: "publicado" as const, url: publicado.urlPublicada };
}
```

Função comum, sem `"use step"`/`"use workflow"`, testável diretamente sem nenhum empacotamento — mocka os repositórios/adaptador com `vi.spyOn`, igual às Tasks 3-7.

### 3.2 Gatilho — cron-job.org (sem mudança de infraestrutura)

Mesmo padrão de `src/app/api/cron/followups/route.ts` — cron-job.org bate na rota (Vercel Hobby não libera cron nativo com frequência > 1x/dia), protegida por `CRON_SECRET`.

```typescript
// src/app/api/cron/marketing-pipeline/route.ts
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("Não autorizado", { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: matrizes } = await supabase
    .from("matrizes_conteudo")
    .select("id, propriedade_id")
    .eq("ativo", true);

  const resultados: Record<string, string> = {};
  for (const matriz of matrizes ?? []) {
    // Lock por matriz — não um lock global como o do followup, matrizes rodam em paralelo
    const { data: obtido } = await supabase.rpc("fn_tentar_lock_cron", {
      p_id: `marketing-pipeline-${matriz.id}`,
      p_duracao_segundos: 240, // uma tentativa completa (gerar+revisar+publicar) — bem mais curto que o loop inteiro
    });
    if (!obtido) continue;

    try {
      const resultado = await processarProximaPauta(matriz.id, matriz.propriedade_id);
      resultados[matriz.id] = resultado.status;
    } finally {
      await supabase.rpc("fn_liberar_lock_cron", { p_id: `marketing-pipeline-${matriz.id}` });
    }
  }

  return Response.json({ resultados });
}
```

Reaproveita `cron_locks`/`fn_tentar_lock_cron`/`fn_liberar_lock_cron` já existentes — só o `p_id` muda pra ser por matriz. Diferença central em relação à v1 desta spec: a rota agora `await`s o processamento inteiro de uma tentativa (síncrono, dentro da mesma invocação de função) — não dispara nada em background. Isso é seguro porque cada tentativa é curta (uma chamada de geração + uma de revisão + no máximo uma publicação), bem dentro do limite de execução de função da Vercel.

### 3.3 Adaptadores de canal

`src/lib/marketing/canais/`, um módulo por plataforma, mesmo padrão de `src/lib/whatsapp/enviar.ts` — camada fina que traduz um formato canal-agnóstico pra API de cada provedor.

```typescript
// src/lib/marketing/canais/tipos.ts
export type ConteudoCanal = {
  titulo: string;
  corpo: string; // HTML completo (WordPress/Medium) ou texto curto (resumo)
  imagemUrl: string;
  linkOriginal?: string; // presente só nos canais de "resumo + CTA"
};

export type ResultadoRascunho = { idRemoto: string; status: "rascunho" | "publicado" | "falhou" };

export interface AdaptadorCanal {
  criarRascunho(conteudo: ConteudoCanal): Promise<ResultadoRascunho>;
  verificarRascunho(idRemoto: string): Promise<{ ok: boolean; detalhes?: string }>;
  aprovarPublicar(idRemoto: string): Promise<{ urlPublicada: string }>;
}
```

Implementações: `wordpress.ts` (posts e páginas — endpoints `/wp/v2/posts` e `/wp/v2/pages`, Application Password), `google-business-profile.ts` (Google Business Profile API, conta de serviço), `meta.ts` (Instagram + Facebook, Graph API), `linkedin.ts` (posts de feed + LinkedIn Articles — dois métodos diferentes, ver seção 3.3 do documento irmão), `pinterest.ts`, `medium.ts` (republicação com canonical, não usa `verificarRascunho`/`aprovarPublicar` do mesmo jeito — é publicação direta).

### 3.4 Processamento de imagem por canal

Sem geração de imagem nova (fase 2) — recorte/redimensionamento determinístico da imagem de capa já gerada pro WordPress. Biblioteca de processamento de imagem (ex.: `sharp`, já comum em ambiente Node/Vercel) rodando dentro de um step (`"use step"`, acesso a Node.js completo). Tabela de dimensões por canal está na seção 3.3 do documento irmão.

```typescript
async function gerarVarianteImagem(imagemOriginalUrl: string, formato: FormatoCanal) {
  "use step";
  // sharp: fetch → resize/crop conforme dimensões do canal → upload pro Storage → retorna URL
}
```

---

## 4. Modelo de dados — deltas sobre `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md`

O documento irmão já descreve as entidades completas (seção 2, com os campos já incorporando estas mudanças). Resumo dos campos que este pipeline introduz:

- `POSTS.canais` (jsonb) — estado por plataforma, chave por canal (`wordpress`, `gmb`, `instagram`, `facebook`, `linkedin`, `pinterest`, `medium`), cada um com `{ rascunho_id, status, url }`
- `POSTS.tentativas`, `PAUTAS.tentativas` — contador do circuit breaker
- `PAUTAS.motivo_ultima_reprovacao` — texto livre, alimenta o próximo ciclo de geração com o motivo da reprovação
- `PROPRIEDADES_DIGITAIS.config_pipeline` (jsonb) — `{ max_tentativas: number, canais_distribuicao: string[] }`

---

## 5. Tratamento de erro

| Situação | Tratamento |
|---|---|
| Geração/revisão reprova o rascunho | `registrarReprovacaoPauta` volta o status pra `pendente` + incrementa `tentativas` — o próximo tick do cron re-seleciona a mesma pauta e tenta de novo |
| API de canal externo falha (rate limit, timeout) | Exceção sobe, a tentativa deste tick falha sem marcar reprovação — a pauta continua `em_producao`/`pendente` conforme o ponto da falha, próximo tick tenta de novo naturalmente |
| API de canal externo rejeita definitivamente (credencial inválida, conta suspensa) | Mesmo caminho da reprovação por enquanto (registra motivo, conta como tentativa) — não há distinção fina entre erro transiente/definitivo no MVP deste pipeline, aceito como simplificação |
| Circuit breaker esgotado (`max_tentativas`) | `marcarPautaBloqueada` — pauta sai da fila, cron segue pra próxima no próximo tick |
| Duas execuções do cron sobrepostas na mesma matriz | Lock por `matriz_conteudo_id` evita duplicidade (mesmo mecanismo de sempre) |

---

## 6. Segurança

- Nenhuma credencial (WordPress Application Password, tokens Meta/LinkedIn/Pinterest, conta de serviço Google) em texto no repositório ou em documentação — só via `vercel env`.
- Cada propriedade com Pixel/GA4/GTM próprios (decisão registrada no documento irmão) — evita fingerprint de rede compartilhada entre sites.
- Ação manual pendente de Luiz, já registrada no documento irmão: trocar senha do usuário `claude-auditoria` do WordPress (exposta em PDF fornecido nesta sessão).

---

## 7. Plano de testes

- **Unitário:** `processarProximaPauta` é uma função comum — testável direto com `vi.spyOn` nos repositórios/Estrategista/Escritor/Revisor/adaptador WordPress, sem nenhum plugin/empacotamento especial. Cenários: publica quando aprovado de primeira; reprova sem publicar (revisão ou WordPress); bloqueia quando `tentativas >= maxTentativas` antes mesmo de gerar.
- **Rota de cron:** mock do Supabase (`rpc` do lock) + mock de `processarProximaPauta`, mesmo padrão de teste já usado em `src/app/api/cron/followups/route.ts` se existir um, ou o padrão xUnit simples já usado nas Tasks 1-7.
- **Custo:** o documento irmão já registra que este pipeline consome muito mais tokens que o atendimento comercial (artigos de 1.800+ palavras várias vezes ao dia) — instrumentar custo real desde o primeiro mês (painel de custo, seção 7 do documento irmão), não só depois que virar problema.

---

## Pendências desta spec

- Definir `max_tentativas` padrão (proposta: 3) e se cada propriedade pode sobrescrever livremente ou se existe um teto global
- Schema exato do JSON em `POSTS.canais` por tipo de canal (resumo+CTA vs. republicação com canonical têm campos diferentes) — detalhar no plano de implementação
- **Cadência do cron-job.org:** com uma tentativa por tick, o intervalo entre execuções (a definir por Luiz no painel do cron-job.org) determina quanto tempo leva pra uma pauta ir de pendente a publicada em caso de reprovações — não é mais instantâneo dentro de uma chamada só, é gradual entre ticks. Aceitável pra este caso de uso (conteúdo de blog, não é latência crítica), mas vale deixar claro.
