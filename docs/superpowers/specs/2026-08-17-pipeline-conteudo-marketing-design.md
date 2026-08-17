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

### 3.1 Orquestração — Vercel Workflow SDK

Escolhido em vez de eve (framework de agentes mais amplo, dependência nova) ou cron+fila manual no Supabase (reimplementaria retry/durabilidade que o Workflow SDK já dá pronto). O pipeline é uma sequência fixa de passos com loops de retry — não uma conversa aberta — encaixa bem no modelo de step functions duráveis.

```typescript
// src/lib/marketing/workflows/gerar-publicar-conteudo.ts
export async function gerarPublicarConteudoWorkflow(matrizId: string) {
  "use workflow";

  let pauta = await selecionarProximaPauta(matrizId);
  let tentativas = 0;
  const maxTentativas = await obterMaxTentativas(matrizId);

  while (tentativas < maxTentativas) {
    const rascunho = await gerarConteudo(pauta);
    const revisao = await revisarConteudo(rascunho, pauta.propriedade_id);

    if (!revisao.aprovado) {
      tentativas++;
      pauta = { ...pauta, motivo_ultima_reprovacao: revisao.motivo };
      continue; // volta pro estágio 1, nada foi publicado
    }

    const publicado = await publicarWordPress(rascunho, pauta.propriedade_id);
    const distribuicao = await distribuirEAprovar(publicado, pauta.propriedade_id);

    if (!distribuicao.aprovado) {
      tentativas++;
      pauta = { ...pauta, motivo_ultima_reprovacao: distribuicao.motivo };
      continue;
    }

    return { status: "publicado", url: publicado.url, canais: distribuicao.canais };
  }

  await marcarPautaBloqueada(pauta.id, pauta.motivo_ultima_reprovacao);
  return { status: "bloqueada", pautaId: pauta.id };
}
```

Cada função chamada (`selecionarProximaPauta`, `gerarConteudo`, `revisarConteudo`, `publicarWordPress`, `distribuirEAprovar`, `marcarPautaBloqueada`) é um `"use step"` — acesso completo a Node.js/npm, resultado persistido e retryable automaticamente. O corpo acima é só orquestração, roda no sandbox do workflow.

### 3.2 Gatilho — cron-job.org (não Vercel Cron)

Vercel Hobby só libera cron nativo 1x/dia (rejeita deploy com frequência maior) — mesmo motivo pelo qual o cron de follow-up já migrou pro cron-job.org (`src/app/api/cron/followups/route.ts`).

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

  const disparados: string[] = [];
  for (const matriz of matrizes ?? []) {
    // Lock por matriz — não um lock global como o do followup, matrizes rodam em paralelo
    const { data: obtido } = await supabase.rpc("fn_tentar_lock_cron", {
      p_id: `marketing-pipeline-${matriz.id}`,
      p_duracao_segundos: 1800, // gerar+revisar+publicar+distribuir pode levar minutos
    });
    if (!obtido) continue;

    try {
      await start(gerarPublicarConteudoWorkflow, [matriz.id]);
      disparados.push(matriz.id);
    } finally {
      await supabase.rpc("fn_liberar_lock_cron", { p_id: `marketing-pipeline-${matriz.id}` });
    }
  }

  return Response.json({ disparados });
}
```

Reaproveita `cron_locks`/`fn_tentar_lock_cron`/`fn_liberar_lock_cron` já existentes — só muda o `p_id` pra ser por matriz em vez de fixo. `start()` só retorna o `runId` (não espera o workflow terminar) — o lock protege contra duas execuções do cron disparando a mesma matriz de novo antes da anterior sair do estágio de geração/revisão, mas o workflow em si roda em background depois de disparado.

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
| Geração/revisão reprova o rascunho | `RetryableError` implícito no loop do workflow — regenera com o motivo, incrementa tentativa |
| API de canal externo falha (rate limit, timeout) | `RetryableError` com `retryAfter`, o Workflow SDK re-executa o step |
| API de canal externo rejeita definitivamente (credencial inválida, conta suspensa) | `FatalError` — não adianta tentar de novo; marca a propriedade/canal com alerta no painel de custo/status, segue sem aquele canal específico (não trava os outros) |
| Circuit breaker esgotado (`max_tentativas`) | Pauta marcada, workflow encerra normalmente (não é erro do sistema) |
| Duas execuções do cron sobrepostas na mesma matriz | Lock por `matriz_conteudo_id` evita duplicidade |

---

## 6. Segurança

- Nenhuma credencial (WordPress Application Password, tokens Meta/LinkedIn/Pinterest, conta de serviço Google) em texto no repositório ou em documentação — só via `vercel env`.
- Cada propriedade com Pixel/GA4/GTM próprios (decisão registrada no documento irmão) — evita fingerprint de rede compartilhada entre sites.
- Ação manual pendente de Luiz, já registrada no documento irmão: trocar senha do usuário `claude-auditoria` do WordPress (exposta em PDF fornecido nesta sessão).

---

## 7. Plano de testes

- **Unitário:** funções de step isoladas (seleção de pauta, geração de conteúdo, validação de checklist, adaptadores de canal com API mockada) — sem o plugin do Workflow SDK, `"use step"`/`"use workflow"` são no-op fora do compilador.
- **Integração (`@workflow/vitest`):** o workflow completo, incluindo o loop de retry — usar `waitForHook`/`waitForSleep` se algum estágio precisar de espera; testar cenário de reprovação (verifica que regenera em vez de publicar) e cenário de esgotamento do circuit breaker.
- **Custo:** o documento irmão já registra que este pipeline consome muito mais tokens que o atendimento comercial (artigos de 1.800+ palavras várias vezes ao dia) — instrumentar custo real desde o primeiro mês (painel de custo, seção 7 do documento irmão), não só depois que virar problema.

---

## Pendências desta spec

- Definir `max_tentativas` padrão (proposta: 3) e se cada propriedade pode sobrescrever livremente ou se existe um teto global
- Schema exato do JSON em `POSTS.canais` por tipo de canal (resumo+CTA vs. republicação com canonical têm campos diferentes) — detalhar no plano de implementação
- Confirmar limites de tempo de execução do Workflow SDK em Vercel Hobby (o projeto está em Hobby hoje) — pode exigir Pro Trial como já aconteceu com o cron de follow-up
