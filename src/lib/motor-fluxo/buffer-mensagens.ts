// Parte pura do mecanismo de debounce de mensagens seguidas do lead (19/08/2026, Luiz: "vamos
// corrigir tudo mas de forma global"). Sem `server-only` de propósito — só junta texto, não fala
// com nada, testável direto (mesmo motivo de interpretar-*-validacao.ts).
//
// Problema real (log de produção, 19/08/2026): o lead respondeu em 2 mensagens seguidas ("só meu
// cpf e o cnpj dela" / "nome dela está limpo") — cada uma virou um turno do motor separado, cego
// pra outra, e a segunda sozinha não fazia sentido nenhum pro checkpoint. O webhook (route.ts)
// espera alguns segundos depois de cada mensagem antes de rodar o motor; se mais mensagens
// chegarem nesse meio tempo, quem realmente processa o turno usa TODAS elas concatenadas — é isso
// que a função abaixo monta.

/** Uma linha de `mensagens` relevante pra concatenação — só os campos que a função usa. */
export type MensagemLeadParaConcatenar = {
  conteudo: string | null;
  enviado_em: string;
};

/**
 * Junta o texto de várias mensagens do lead (já ordenadas por `enviado_em` crescente) numa
 * resposta só, como se o lead tivesse mandado tudo de uma vez — descarta linhas sem texto (mídia
 * sem legenda, por exemplo) e espaços sobrando. Vazio quando não há texto nenhum.
 */
export function concatenarMensagensLead(mensagens: MensagemLeadParaConcatenar[]): string {
  return mensagens
    .map((m) => m.conteudo?.trim() ?? "")
    .filter((texto) => texto.length > 0)
    .join("\n");
}
