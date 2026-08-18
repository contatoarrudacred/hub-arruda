import { createClient } from "@/lib/supabase/server";

const BUCKET = "pessoa-fotos";

export async function enviarFotoPessoa(pessoaId: string, conteudo: Blob, extensao: string): Promise<{ url: string }> {
  const supabase = await createClient();
  const caminho = `${pessoaId}/${Date.now()}.${extensao}`;

  const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, conteudo);
  if (erroUpload) throw new Error(`Falha ao enviar foto: ${erroUpload.message}`);

  const { data: urlPublica } = supabase.storage.from(BUCKET).getPublicUrl(caminho);

  const { error } = await supabase.from("pessoa_fotos").insert({ pessoa_id: pessoaId, url: urlPublica.publicUrl });
  if (error) throw new Error(`Falha ao registrar foto: ${error.message}`);

  return { url: urlPublica.publicUrl };
}

export async function buscarFotoMaisRecente(pessoaId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pessoa_fotos")
    .select("url")
    .eq("pessoa_id", pessoaId)
    .order("capturada_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar foto: ${error.message}`);
  return data?.url ?? null;
}
