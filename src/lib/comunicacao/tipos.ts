// Tipos do módulo de comunicação centralizada — ver
// docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md.

export type ConteudoWhatsapp = { texto: string };

/** `corpo` é texto/parágrafos simples — o layout padrão de e-mail (EmailLayout) cuida do resto (cabeçalho, rodapé, identidade visual). Nunca HTML cru vindo de quem chama. */
export type ConteudoEmail = { assunto: string; corpo: string };

export type ParametrosComunicacao = {
  pessoaId: string;
  categoriaId: string;
  chaveIdempotencia?: string;
} & ({ canal: "whatsapp"; conteudo: ConteudoWhatsapp } | { canal: "email"; conteudo: ConteudoEmail });

export type ResultadoComunicacao =
  | { status: "enviado"; mensagemId: string; instancia?: "oficial" | "secundaria" }
  | { status: "idempotente_repetido"; mensagemId: string };
