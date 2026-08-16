# Agenda de Comunicação Pós-venda — ArrudaCred (uso futuro)
**Status:** Registrado em 15/08/2026, extraído de `Script - Indicação Premiada ArrudaCred.pdf` (Luiz) — mecânica ainda **não construída**, este documento só registra a necessidade.
**Escopo do documento-fonte:** produto Limpa Nome Serasa/SPC. Outros produtos (Bacen, CCF, Aumento de Rating, Jusbrasil/Escavador) provavelmente vão precisar de uma agenda equivalente própria, mas isso não foi tratado ainda — a validar com Luiz quando chegar a hora.

> **Não confundir com dois outros documentos parecidos:**
> - `REGUA_COBRANCA_ARRUDACRED.md` — régua pra cliente **em atraso de pagamento** (parcela vencida), tom de cobrança.
> - `motor-followup.ts` / seção "Fase 6" do `PLANO_MESTRE` — régua **pré-venda**, pra lead que ainda não fechou negócio.
> - **Este documento** — régua **pós-venda, cliente em dia**, enquanto o serviço contratado (ex.: processo judicial de limpeza de nome) ainda está sendo executado. Objetivo: o cliente não se sentir esquecido entre a assinatura do contrato e a conclusão do serviço.

---

## Por que existe

Entre o cliente assinar o contrato e o processo de fato terminar (pode levar semanas), não existe hoje nenhum contato programado — o cliente fica "no escuro". Esta agenda cobre esse vácuo com uma combinação de WhatsApp (dois pontos-chave) e e-mail (conteúdo educativo recorrente), até o processo concluir.

## Linha do tempo

| Quando | Canal | Conteúdo |
|---|---|---|
| **Dia Zero**, 30 min após assinatura do contrato (e pagamento da 1ª parcela, se PRÉ-PAGO) | WhatsApp | Campanha "Indicação Premiada" — ver `MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` seção 6 (documentada separadamente, é aquisição de leads, não relacionamento) |
| **Dia 1** | E-mail | **#ON BOARDING** — boas-vindas + reforça que o cliente pode chamar o WhatsApp de suporte sempre que precisar/tiver dúvida + informa que dá pra acompanhar o andamento do contrato por um link (sugestão do script: pedir pro cliente salvar o link nos favoritos) |
| **A cada 7 dias** a partir do Dia 1, **só enquanto o processo não tiver concluído** | E-mail | Rodízio de dicas educativas (#DICA, lista abaixo) — mantém o cliente engajado sem parecer venda |
| **Dia Êxito** (quando o processo conclui) | WhatsApp | Ver seção "Dia Êxito" abaixo |

### Dicas educativas (#DICA) — pool inicial de 4, com rodízio a cada 7 dias

1. "Não solicite crédito neste período e leia a cartilha do nome limpo quando concluir a limpeza do seu nome"
2. "Cuidado com propostas de bancos para quitação de dívidas com desconto: Risco lista negra BACEN"
3. "Evite atrasos em boletos e faturas no seu nome – Hábitos de um bom pagador -> Score sempre crescente"
4. "Organize suas finanças para evitar novas restrições"

**Nota do próprio script-fonte:** "preparar outras dicas caso processo demore mais do que 4 semanas" — o pool de 4 dura ~4 semanas no ritmo de 1 a cada 7 dias; processos mais longos vão esgotar o pool e precisam de mais conteúdo. Ainda não escrito.

### Regra de segurança de entrega (do próprio script-fonte)

Se o Resend indicar **3 e-mails seguidos sem abertura/leitura**, dispara uma mensagem de checagem via WhatsApp avisando que estamos enviando e-mails e não temos certeza se estão chegando — mesma lógica de "canal alternativo quando o principal parece não estar funcionando" já usada no e-mail de boas-vindas do fluxo comercial (ali é o oposto: e-mail como reforço do WhatsApp; aqui é WhatsApp como reforço do e-mail).

### Dia Êxito (processo concluído)

Mensagem via WhatsApp, depois de estabelecida a conversa:
1. Informa que o nome já está limpo, "conforme consulta oficial anexa" (anexa um comprovante/print da consulta).
2. Pede pro cliente ler com atenção a **"cartilha nome limpo"** — material com os primeiros passos importantes pra quem está sem restrições no CPF/CNPJ.
3. **Se o plano for PÓS-PAGO:** informa que a fatura da primeira parcela já está disponível pra pagamento, com link.
4. Conclui pedindo avaliação no Google.

---

## O que falta pra isso virar sistema (nada construído ainda)

1. **Evento "processo concluído"** — não existe hoje. É o gatilho de "Dia Êxito" e também o que decide se as dicas de #DICA continuam sendo enviadas ("apenas se o processo ainda não foi concluído"). Depende do módulo Jurídico (acompanhamento do processo judicial), que ainda não foi desenhado.
2. **"Cartilha nome limpo"** — material citado duas vezes no script (dica #1 e Dia Êxito) que ainda não existe como asset no projeto. Precisa ser escrito/produzido e hospedado (mesmo padrão do resto — Supabase Storage).
3. **Link de acompanhamento do contrato** ("link XXX", citado no e-mail de onboarding) — pressupõe algum tipo de portal/página de status pro cliente ver o andamento do próprio processo. Não existe hoje.
4. **Link de pagamento da fatura** (citado no Dia Êxito, caso PÓS-PAGO) — depende do módulo Financeiro, que ainda não foi desenhado (`MODELAGEM_DADOS_ARRUDACRED.md`).
5. **Rastreio de abertura de e-mail via Resend** (pra regra dos "3 e-mails seguidos sem abertura") — o Resend expõe isso via webhook de eventos (`email.opened`), mas o projeto ainda não tem nenhuma integração de webhook do Resend — hoje só usamos o SDK pra enviar (`src/lib/email/resend.ts`).
6. **Pool de dicas educativas maior que 4** — só serve pra processos de até ~4 semanas; precisa de mais conteúdo pra processos mais longos, ainda não escrito.
7. Assim como a "Indicação Premiada" (`MODULO_MARKETING_CONTEUDO_ARRUDACRED.md` seção 6.1), o gatilho de "Dia Zero" depende de um evento de "contrato assinado" que hoje não existe — **mesma decisão de Luiz vale aqui: só documentar por enquanto, decidir a automação junto quando for viável.**

**Atravessa Comercial (quem conduz o WhatsApp), Marketing (é conteúdo/nutrição) e Financeiro/Jurídico (eventos de gatilho que ainda não existem)** — mesmo padrão de dependência cruzada já visto na campanha de indicação.
