// Gatilho do pipeline de conteúdo, via cron-job.org (Vercel Hobby não libera cron nativo com
// frequência > 1x/dia) — mesmo padrão de src/app/api/cron/followups/route.ts, mas com lock POR
// MATRIZ em vez de lock global: cada matriz roda em paralelo sem travar as outras. Cada tick
// processa uma tentativa completa (gerar→revisar→publicar) de uma pauta por matriz — ver
// docs/superpowers/specs/2026-08-17-pipeline-conteudo-marketing-design.md seção 3.1.

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processarProximaPauta } from "@/lib/marketing/processar-pauta";

const DURACAO_LOCK_SEGUNDOS = 240; // uma tentativa completa — bem mais curto que o loop inteiro de retries

// Mesma duração do lock: se a função for morta por timeout, o lock já teria expirado de qualquer
// forma. Sem isto, a duração máxima default da plataforma poderia matar a função no meio do
// processamento — a pauta ficaria presa em "em_producao" (reclaim cobre isso, ver
// selecionarProximaPautaPendente em repositorio.ts, mas evitar o timeout no primeiro lugar é melhor).
export const maxDuration = 240;

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("Não autorizado", { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: matrizes, error: erroMatrizes } = await supabase.from("matrizes_conteudo").select("id, propriedade_id").eq("ativo", true);

  if (erroMatrizes) {
    return Response.json({ erro: `Falha ao carregar matrizes de conteúdo: ${erroMatrizes.message}` }, { status: 500 });
  }

  // Responde IMEDIATAMENTE (via after(), mesmo padrão já usado nos webhooks — ver
  // src/app/api/webhooks/zapster/route.ts) — achado real de produção (21/08/2026): o plano
  // gratuito do cron-job.org desiste de esperar depois de só 30s, bem menos que os até 240s que
  // uma tentativa completa de verdade pode legitimamente levar (a geração inicial do Escritor
  // sozinha já foi vista consumindo 160-200s) — todo disparo aparecia como "Failed (timeout)" na
  // tela do cron-job.org mesmo com o pipeline rodando certinho no servidor. after() mantém a
  // função viva em background via waitUntil do Vercel, até o maxDuration acima — dissociado da
  // espera (curta) do cliente que disparou o request.
  after(async () => {
    for (const matriz of matrizes ?? []) {
      const idLock = `marketing-pipeline-${matriz.id}`;
      const { data: obtido } = await supabase.rpc("fn_tentar_lock_cron", {
        p_id: idLock,
        p_duracao_segundos: DURACAO_LOCK_SEGUNDOS,
      });
      if (!obtido) continue;

      try {
        await processarProximaPauta(matriz.id, matriz.propriedade_id);
      } finally {
        await supabase.rpc("fn_liberar_lock_cron", { p_id: idLock });
      }
    }
  });

  return Response.json({ disparado: true, matrizes: (matrizes ?? []).length });
}
