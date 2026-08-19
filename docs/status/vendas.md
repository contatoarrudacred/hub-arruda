# Status — Vendas

tarefa: Implementando o redesenho Nova Oportunidade + Kanban de Vendas (novo vocabulário de 8 etapas) via subagent-driven-development — migration do schema novo já escrita, seguindo pras camadas de lógica/repositório
desde: 2026-08-19T12:00:00-03:00
proxima: estagio-venda.ts com o novo vocabulário (TDD)
bloqueio:

## Pendências conhecidas — Asaas Checkout (cartão, Task 10/10b)

- **Reconciliação de parcelas do cartão:** os "títulos a receber" reais do cartão (datas/valores exatos que a Asaas vai creditar por parcela) ainda não são gravados em `contrato_parcelas` — a parcela única criada no submit (Task 13) continua sendo só um placeholder pro valor total. Resolver depende da pesquisa pendente da spec seção 6.1 (onde/como a Asaas expõe o detalhe por parcela de um Checkout pago). Não bloqueia o resto do plano.
- **Possível duplicação de clientes no painel Asaas (baixa prioridade):** a doc oficial do Checkout não confirma se `customerData` (dados soltos, sem id) casa automaticamente com um cliente Asaas já existente pelo CPF/CNPJ ou sempre cria um novo. Se criar um novo a cada Checkout, o dashboard da Asaas acumula clientes duplicados pro mesmo CPF/CNPJ ao longo do tempo — sem impacto funcional pro nosso sistema (a reconciliação usa `externalReference`, não o id do cliente), mas pode confundir o Luiz olhando o painel da Asaas. Não bloqueia.
