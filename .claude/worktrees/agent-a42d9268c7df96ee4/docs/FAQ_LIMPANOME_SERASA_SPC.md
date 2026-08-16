# FAQ — Limpeza de Nome Serasa/SPC
**Status:** Em levantamento (Luiz está passando as perguntas/respostas reais usadas hoje)
**Objetivo:** virar a base de conhecimento que a Malala usa para responder dúvidas laterais sem alucinar, seguindo a regra de desvio já registrada no script.

**Papel exato da FAQ na arquitetura de IA (esclarecido por Luiz, 14/08/2026):** a FAQ é a base de consulta que a Malala usa quando o lead pergunta algo que **não está coberto implicitamente pelo prompt de sistema/persona dela** (identidade, tom, técnicas comerciais — ver nota abaixo). Ou seja: primeiro a IA tenta responder com o que já faz parte de "quem ela é" (instrução de sistema); se a pergunta for específica demais pra estar ali (garantia, contrato, valor, processo jurídico), ela consulta a FAQ antes de responder — nunca inventa. **✅ Atualização (15/08/2026): o prompt de sistema da Malala já foi escrito** — `docs/PERSONA_MALALA_PROMPT_SISTEMA.md` (persona, tom de voz, técnicas comerciais, regras de escalonamento), hoje na v5.

**Requisito confirmado por Luiz (11/08/2026):** as FAQs precisam viver num banco de dados **gerenciável pelo admin** — editar, desativar, excluir, criar novas — sem depender de código. Isso é parte do mesmo "editor de fluxo/conteúdo" já registrado no plano mestre (seção 8.9), agora com um caso concreto: CRUD completo de FAQ. **✅ Construído em 15/08/2026** (`/admin/faqs`, junto com `/admin/objecoes`) — ver PLANO_MESTRE, item #9 do backlog.

**⚠️ Nota de transparência:** as FAQs 1 a 5 abaixo foram registradas com o **conteúdo resumido/reescrito por mim**, não no texto literal que você mandou (diferente das FAQs 6 a 10, que já estão em bloco de código com o texto exato). Se você quiser que 1-5 também fiquem no texto literal exato (para copiar direto pra base de conhecimento sem risco de eu ter alterado alguma nuance), me avise que eu ajusto.

---

### FAQ 1 — "É certeza que vou conseguir aprovação de crédito após limpar meu nome?"

A maioria dos clientes consegue aprovação de crédito/financiamento algumas semanas após a conclusão do processo, mas lojas e principalmente instituições financeiras usam outros critérios além do nome limpo para aprovar crédito — nome limpo não é garantia de aprovação.

**A única certeza absoluta:** solicitar crédito com nome sujo (situação atual) **será negado**. A ArrudaCred não controla a avaliação de crédito de terceiros, então não garante aprovação — o que ela **garante em contrato** é a remoção das restrições no SERASA, SPC Brasil, SPC Boa Vista e CENPROT.

### FAQ 2 — Sobre aumento de Score

Score é o resultado de um cálculo matemático sobre a situação financeira: restrição = score baixo; nome limpo = tendência de melhora. **Sim, o score vai melhorar** conforme as dívidas são pagas ou as restrições removidas — de forma gradativa. Exceção: se o cliente tiver contas do mês atual atrasadas/vencidas, o score pode ficar travado ou até cair.

### FAQ 3 — Quando e quanto o Score aumenta

Não é possível precisar quanto nem quando — depende do algoritmo do Serasa (hoje usa IA e muda constantemente). Regra geral: se o CPF não tiver contas atrasadas nos últimos 30 dias, já sobe um pouco de cara. O aumento mais relevante é gradativo ao longo dos **próximos 90 dias**, desde que o cliente mantenha hábitos de bom pagador e poucas consultas no nome.

### FAQ 4 — Restrições podem voltar / Seguro-garantia

O processo é judicial, então é normal os órgãos de proteção ao crédito apresentarem recursos ao longo do tempo — isso pode fazer restrições voltarem (parcial ou totalmente). **Não é falha no serviço**, é andamento normal do processo.

**Seguro-garantia de 12 meses incluso** no valor da contratação cobre:
- Reinserção parcial das restrições
- Reinserção total das restrições
- Inserção de restrição nova referente a nova dívida

**Acionamento do seguro:** a associação entra com novo pedido de remoção, conforme regras do contrato. **Taxa: R$ 250,00 por CPF/CNPJ**, cobrada sempre que o seguro for acionado (valor a marcar como configurável, mesma lógica dos outros valores monetários do sistema).

### FAQ 5 — Restrição vs Dívida (base legal)

**Restrição** = anotação negativa referente à dívida que prejudica o nome — a ArrudaCred consegue baixar isso via ação judicial com base em:
- Decreto nº 2.181/97 (art. 13, incisos XIII e XIV)
- Art. 42 do Código de Defesa do Consumidor
- Súmula 359 do STJ

**Dívida** = continua existindo internamente na loja/banco onde foi contraída (e no Banco Central) — o cliente pode negociar isso depois, quando tiver fôlego financeiro ou achar melhor.

### FAQ 6 — Pergunta sobre BACEN no meio de uma oportunidade Serasa/SPC (regra de sequenciamento comercial)

**Contexto de uso:** quando o lead está numa oportunidade de Limpeza de Nome Serasa/SPC e pergunta sobre Bacen no meio do caminho. **A mesma lógica vale para CCF, Aumento de Rating e Jusbrasil/Escavador** — sempre vender Serasa/SPC primeiro.

> Para dar entrada na ação de atualização do Registrato SCR (Banco Central - BACEN) removendo anotações negativas na coluna "VENCIDOS", é necessário estar com nome limpo no SERASA, SPC Brasil, SCPC Boa Vista e CENPROT, já que isso faz parte da defesa utilizada no processo.

```
*Bacen depois da proposta Limpa Nome SERASA/SPC!!*

Para dar entrada na ação de atualização do Registrato SCR (Banco Central - BACEN) removendo anotações negativas na coluna "VENCIDOS", é necessário estar com nome limpo no SERASA, SPC Brasil, SCPC Boa Vista e CENPROT já que isso faz parte da defesa utilizado no processo.

O caminho é *realizar primeiro* as baixas nas restrições Serasa/SPC para na sequência, tirar um relatório atualizado do SCR e aí sim, orçar e contratar o serviço correspondente no BACEN, ok?
```

**⚠️ Isso não é só uma FAQ — é uma regra de negócio de sequenciamento comercial** que também afeta o Agente Maestro (seção 8.3 do plano mestre): quando um lead demonstra interesse em mais de um produto ao mesmo tempo (ex.: Serasa/SPC + Bacen), existe uma **ordem correta de venda** (Serasa/SPC primeiro, sempre) — isso deveria ser uma regra configurável no roteamento entre produtos, não só uma resposta de FAQ isolada.

### FAQ 7 — "Quais as garantias que eu tenho contratando a ArrudaCred?"

```
Quais as garantias que eu tenho contratando a ArrudaCred?

Essa é uma ótima pergunta, e eu também faria essa pergunta no seu lugar. 😊

A sua principal garantia é que você está contratando uma empresa com anos de atuação, milhares de clientes atendidos, excelente reputação no Google e no Reclame Aqui, além de um contrato formal de prestação de serviços.

Além disso, nosso contrato prevê que, caso não consigamos entregar o serviço dentro do prazo máximo contratado, você tem direito ao reembolso previsto contratualmente.
```

**Fato de negócio importante:** existe **cláusula de reembolso contratual** caso o serviço não seja entregue dentro do prazo máximo — vale registrar isso como regra formal (possivelmente relevante para o módulo Financeiro/Jurídico também, não só a FAQ).

### FAQ 8 — "Posso ver uma minuta do contrato?"

```
Posso ver uma minuta do contrato?

Claro! 😊 Antes da assinatura você receberá o contrato completo para analisar com calma. Como ele é elaborado com os dados do cliente e do serviço contratado, não trabalhamos com uma minuta padrão. Se surgir qualquer dúvida, faço questão de explicar cada cláusula antes da assinatura.
```

### FAQ 9 — "Como funciona o processo de limpeza de nome?"

```
Como funciona o processo de limpeza de nome?

A limpeza de nome é realizada por meio de uma ação judicial coletiva, promovida por associações de defesa dos direitos do consumidor, com fundamento no Decreto nº 2.181/97 (art. 13, incisos XIII e XIV), no art. 42 do Código de Defesa do Consumidor e na Súmula 359 do Superior Tribunal de Justiça (STJ).
O objetivo da ação é buscar a remoção das restrições dos órgãos de proteção ao crédito, sem quitar ou extinguir as dívidas, que continuam existindo normalmente.

Por envolver uma ação coletiva e dados pessoais sensíveis dos associados (como documentos, informações financeiras e registros de dívidas), o processo tramita sob segredo de justiça, conforme a legislação aplicável. Por esse motivo, não é permitido divulgar o número do processo, fornecer cópias dos autos, decisões judiciais ou permitir consulta às peças processuais, preservando a privacidade e a segurança de todos os participantes.

Após a contratação, nossa equipe acompanha todo o processo até a conclusão e mantém você informado durante as etapas do serviço.
```

**⚠️ Nota importante sobre esta FAQ:** a explicação do **segredo de justiça** (por que não é possível fornecer número do processo, cópias dos autos, etc.) é uma peça de **credibilidade crítica** — sem essa explicação, a recusa em fornecer esses dados pode soar evasiva/suspeita para um lead desconfiado (lembrando do contexto do episódio Fantástico/TV Globo sobre fraudes no setor, já registrado em conversas anteriores). A Malala precisa sempre entregar essa explicação **junto** com a recusa, nunca a recusa sozinha.

### FAQ 10 — "Existe chance das restrições voltarem?"

```
Existe chande das restrições voltarem?

Sim, essa possibilidade existe. 😊

Como a remoção das restrições ocorre por meio de uma ação judicial, é perfeitamente normal que, ao longo do processo, os órgãos de proteção ao crédito apresentem recursos ou outras manifestações processuais. Em alguns casos, isso pode fazer com que as restrições voltem a aparecer, parcial ou totalmente.

Isso não significa que houve falha no serviço, mas sim que faz parte do andamento normal de um processo judicial. Pensando nisso, a ArrudaCred oferece uma solução específica para proporcionar ainda mais tranquilidade ao cliente, conforme as condições previstas em contrato.
```

*(Mesmo conteúdo de fundo da FAQ 4 — seguro-garantia — reforçado aqui numa formulação mais suave, evitando mencionar "seguro" logo de cara. Possível candidata a ficar como uma resposta "padrão" vs. uma resposta "detalhada com valores", dependendo de quão fundo o lead quer ir.)*

---

## Base de conhecimento geral (não é FAQ de pergunta-resposta — é contexto de apoio)

Luiz identificou que parte do conteúdo que já está no **script de vendas** (documento `SCRIPT_LIMPANOME_SERASA_SPC.md`) também precisa estar disponível como **conhecimento geral** da Malala, para ela puxar se precisar formular uma resposta fora do fluxo linear — não é só uma mensagem sequencial, é fato que ela pode precisar buscar a qualquer momento.

**Blocos identificados até agora (idênticos ao que já está no script):**
- **Bloco "proposta do Limpa Nome"** — mesmo conteúdo do Passo 3 do script (o que é removido, como funciona a ação coletiva, seguro-garantia de 1 ano, distinção restrição vs. dívida)
- **Bloco "sobre a ArrudaCred"** — mesmo conteúdo do Passo 11 do script (5 anos de mercado, avaliações Google/Reclame Aqui, dados da empresa/CNPJ, prêmio Reclame Aqui 2026)

**⚠️ Implicação de arquitetura importante:** esse conteúdo **não deve ser duplicado** entre "passo do script" e "entrada de conhecimento geral" — é a mesma informação usada de duas formas diferentes (uma vez como mensagem sequencial disparada num momento específico do fluxo, outra vez como conhecimento que a IA consulta livremente quando precisa). O desenho correto é ter **uma única fonte de verdade** para cada bloco de conteúdo, referenciada tanto pelo script quanto pela base de conhecimento — evita o mesmo problema já identificado com os valores monetários configuráveis (seção 8.9 do plano mestre): se o dado de avaliação no Google mudar (ex.: de 4,9 para 4,95), teria que atualizar em um lugar só, não em vários.

---

*(Continua — próximas FAQs serão adicionadas conforme Luiz for enviando.)*
