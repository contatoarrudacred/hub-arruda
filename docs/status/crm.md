# Status — CRM

tarefa: Desenho da comunicação centralizada via CRM (seção 4 item 7 do quadro-branco) discutido em conversa com Luiz e escrito em spec: `docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md`. Cobre: módulo `src/lib/comunicacao/` (função `enviarComunicacao`, chamada direta — não API interna), regra de nunca iniciar conversa pelo WhatsApp oficial (instância secundária com aviso+cartão de contato em TODA mensagem, resposta automática se o lead responder lá mesmo assim, atendente humano pode responder manual mas vê aviso na Tela de Atendimento), e-mail reaproveitando o layout padrão já existente (`EmailLayout`), categoria de mensagem como tabela nova `categorias_comunicacao` com tela de admin (mesmo padrão de FAQs/objeções), idempotência opcional por chave. Aguardando revisão do Luiz antes de virar plano de implementação.
desde: 2026-08-22T11:35:00-03:00
proxima: Luiz revisar a spec escrita. Depois: plano de implementação (writing-plans) + execução. Na sequência: os 3 pedidos de melhoria no fluxo de Limpeza de Nome (inversão ln_passo17b/18, checkpoint inteligente de nomes pra limpar, novo passo de confirmação de contratação). Depois disso: nova bateria de testes completa (achados pendentes registrados em docs/superpowers/specs/2026-08-21-achados-bateria-testes-malala.md).
bloqueio: nenhum.
turno_fim: 2026-08-22T11:35:00-03:00
