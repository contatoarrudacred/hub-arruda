// Gatilho do pipeline de conteúdo, via cron-job.org (Vercel Hobby não libera cron nativo com
// frequência > 1x/dia) — mesmo padrão de src/app/api/cron/followups/route.ts, mas com lock POR
// MATRIZ em vez de lock global: cada matriz roda em paralelo sem travar as outras. Cada tick
// processa uma tentativa completa (gerar→revisar→publicar) de uma pauta por matriz — ver
// docs/superpowers/specs/2026-08-17-pipeline-conteudo-marketing-design.md seção 3.1.

import { createAdminClient } from "@/lib/supabase/admin";
import { processarProximaPauta } from "@/lib/marketing/processar-pauta";

const DURACAO_LOCK_SEGUNDOS = 240; // uma tentativa completa — bem mais curto que o loop inteiro de retries

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("Não autorizado", { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: matrizes } = await supabase.from("matrizes_conteudo").select("id, propriedade_id").eq("ativo", true);

  const resultados: Record<string, string> = {};
  for (const matriz of matrizes ?? []) {
    const idLock = `marketing-pipeline-${matriz.id}`;
    const { data: obtido } = await supabase.rpc("fn_tentar_lock_cron", {
      p_id: idLock,
      p_duracao_segundos: DURACAO_LOCK_SEGUNDOS,
    });
    if (!obtido) continue;

    try {
      const resultado = await processarProximaPauta(matriz.id, matriz.propriedade_id);
      resultados[matriz.id] = resultado.status;
    } finally {
      await supabase.rpc("fn_liberar_lock_cron", { p_id: idLock });
    }
  }

  return Response.json({ resultados });
}
