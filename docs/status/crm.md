# Status — CRM

tarefa: Spec de comunicação centralizada via CRM aprovada pelo Luiz (`docs/superpowers/specs/2026-08-22-comunicacao-centralizada-crm-design.md`). Antes de escrever o plano, chequei a doc real da Zapster (`llms.txt` + referência de envio) e corrigi 2 imprecisões que eu tinha assumido sem checar: (1) cartão de contato/vCard NÃO é enviável pela API deles hoje (só text/media/buttons/send_at/template/reply_to) — o aviso da instância secundária vira texto simples + link wa.me, não um cartão de verdade; (2) `conversas.canal` JÁ existe no schema hoje (não é coluna nova) e já é genérico (whatsapp/instagram/messenger/widget/telegram/simulador) — só falta adicionar 'email' ao CHECK. Escrevendo agora o plano de implementação (writing-plans).
desde: 2026-08-22T12:40:00-03:00
proxima: Terminar o plano de implementação e começar a execução (migration primeiro, sempre mandada pro Luiz rodar). Depois: os 3 pedidos de melhoria no fluxo de Limpeza de Nome (inversão ln_passo17b/18, checkpoint inteligente de nomes pra limpar, novo passo de confirmação de contratação). Depois disso: nova bateria de testes completa (achados pendentes registrados em docs/superpowers/specs/2026-08-21-achados-bateria-testes-malala.md).
bloqueio: nenhum.
turno_fim: 2026-08-22T12:40:00-03:00
