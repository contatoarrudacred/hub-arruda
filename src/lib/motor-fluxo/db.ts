import type { ConteudoEtapa } from "./tipos";

// Mapeamento entre o formato genérico do motor (ConteudoEtapa) e a coluna `tipo_etapa` de
// `etapas_fluxo` no banco — usado tanto pelo gerador de seed quanto pelo CRUD do admin, então fica
// isolado aqui (nem fluxo-limpeza-nome.ts nem repositorio.ts deveriam depender um do outro).

export type TipoEtapaDb =
  | "mensagem_sequencial"
  | "pergunta_checkpoint"
  | "condicional"
  | "webhook_espera";

export function tipoEtapaDb(conteudo: ConteudoEtapa): TipoEtapaDb {
  if (conteudo.proximo_condicional || conteudo.proximo_por_dado) return "condicional";
  return conteudo.aguarda_resposta ? "pergunta_checkpoint" : "mensagem_sequencial";
}

export type ModoNavegacao = "linear" | "opcoes" | "condicional_texto" | "condicional_dado" | "terminal";

/** Como esta etapa decide pra onde a conversa vai depois — usado tanto pelo editor visual (ícone/cor) quanto pelo modal de edição (qual sub-formulário mostrar). */
export function modoNavegacao(conteudo: ConteudoEtapa): ModoNavegacao {
  if (conteudo.opcoes && conteudo.opcoes.length > 0) return "opcoes";
  if (conteudo.proximo_condicional) return "condicional_texto";
  if (conteudo.proximo_por_dado) return "condicional_dado";
  if (conteudo.proximo_codigo) return "linear";
  return "terminal";
}

/** Todo código de etapa que este conteúdo referencia (pra onde ele pode levar a conversa) — usado pra validar, antes de salvar, que nenhuma ramificação aponta pra uma etapa inexistente. */
export function referenciasDeConteudo(conteudo: ConteudoEtapa): string[] {
  const codigos: string[] = [];

  if (conteudo.proximo_codigo) codigos.push(conteudo.proximo_codigo);

  for (const opcao of conteudo.opcoes ?? []) {
    if (opcao.proximo_codigo) codigos.push(opcao.proximo_codigo);
  }

  if (conteudo.proximo_condicional) {
    codigos.push(conteudo.proximo_condicional.se_sim, conteudo.proximo_condicional.se_nao);
  }

  if (conteudo.proximo_por_dado) {
    codigos.push(conteudo.proximo_por_dado.entao, conteudo.proximo_por_dado.senao);
  }

  return codigos;
}
