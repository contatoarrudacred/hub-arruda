# Script de Atendimento — Limpa Nome Serasa/SPC
**Status:** Em levantamento (Luiz está passando o script real em partes)
**Objetivo:** capturar o script tal como ele é hoje, para depois derivar as etapas do Kanban e os checkpoints de avanço automático do Agente Maestro/especialista.

> Convenção: texto entre `[colchetes]` são comentários/orientações de Luiz para o Claude, não fazem parte da fala da atendente virtual.
>
> Convenção de formatação: toda mensagem real (o que a Malala envia) fica dentro de um **bloco de código**, não como texto comum — isso preserva exatamente os caracteres de formatação do WhatsApp (`*negrito*`, `_itálico_`, `~tachado~`) sem o Markdown reinterpretar, e mantém as quebras/espaços em branco exatamente como no original, pronto pra copiar e colar direto no WhatsApp.
>
> Convenção visual: quando várias mensagens são enviadas em sequência, uma logo depois da outra, **sem esperar resposta do lead**, elas aparecem separadas por uma barra vertical (│) entre os blocos.

---

## Premissa geral
- É sempre o **lead que inicia** a conversa (ele chama primeiro)
- No início, o lead **às vezes já passa informação espontaneamente** — pode já dizer o produto que procura, pode já se apresentar com nome e até CPF. Varia muito.
- **Implicação de design:** o fluxo não pode assumir "estado zero" sempre — precisa checar o que o lead já informou de cara antes de perguntar de novo (evitar perguntar algo que ele já respondeu).
- **Regra de desvio (vale para TODO checkpoint do fluxo, não só a abertura):** o fluxo só avança para o próximo passo depois que o lead responder exatamente o que foi perguntado. Se o lead responder outra coisa (pergunta lateral, dúvida, comentário), a IA deve responder essa pergunta lateral — gerada dinamicamente, seguindo prompt de persona/tom de voz (ainda a definir) — e em seguida **retomar a pergunta pendente**, sem perder o checkpoint em aberto. Exemplo dado por Luiz: pergunta "Com quem eu falo?" → lead responde "Qual o site de vocês?" → IA responde o site e imediatamente repete "Mas para eu poder dar continuidade ao atendimento, me responda: *Com quem eu falo?*"
- **Regra de checkpoint já respondido (vale para TODO checkpoint):** antes de fazer qualquer pergunta do script, o Agente Maestro extrai as informações que o lead já deu espontaneamente (na primeira mensagem ou ao longo da conversa) e guarda num "estado da conversa". Se a informação daquele checkpoint específico já é conhecida, a pergunta correspondente **não é enviada** — pula direto pro próximo passo.
- **Regra de follow-up e perda de oportunidade (motor único, vale para todo o fluxo):**
  - **Reagendamento combinado:** quando o lead dá um horário específico ("me chama depois", "só à noite"), Malala agenda e retoma sozinha o atendimento naquele horário, de onde parou.
  - **Agenda padrão de follow-up:** quando o lead simplesmente para de responder (sem combinar horário), existe uma **agenda configurável de novas tentativas** de retomada (intervalos a definir — ex.: X horas, X dias).
  - **Desfecho (igual para os dois casos):** se chegar ao fim da agenda sem resposta nenhuma, **ou** se em algum momento o lead der uma resposta **negativa explícita**, Malala marca a oportunidade como **Perdida** no funil, salvando o motivo (lista aberta): `LEAD DESISTIU`, `LEAD PAROU DE RESPONDER`, etc.
  - *(Nota de arquitetura: os dois tipos de reagendamento podem rodar no mesmo motor de agendamento por trás, só com gatilhos de origem diferentes.)*
  - **Janela de horário comercial (configurável):** todo follow-up precisa respeitar uma janela de atendimento normal — ex.: 9h às 22h. Fora dessa janela, reprograma automaticamente pro próximo horário válido. Mesma lógica vale para domingos e feriados. Tudo configurável pelo admin.
  - **Agenda de follow-up configurável POR CHECKPOINT:** a mensagem de proposta (Passo 15) tem agenda de retomada própria, diferente das mensagens comuns. O sistema precisa suportar agenda configurável por checkpoint desde o início.
  - **Agenda padrão — DECIDIDO em 11/08/2026** (para qualquer checkpoint sem agenda própria definida), extraída da planilha `regua_cobança_arrudacred.xlsx` (aba "REGUA FOLLOW-UP"):

    | # | Intervalo | Canal | Janela | Conteúdo |
    |---|---|---|---|---|
    | 1 | 10 min | WhatsApp | qualquer horário ⚠️ *(ver nota abaixo)* | "🙋‍♂️🙋‍♂️ [Primeiro_Nome] ??" |
    | 2 | 45 min | WhatsApp | 09h-21h | "👀 Oi, está por aí ainda? conseguiu ver minha mensagem?" |
    | 3 | 4 horas | WhatsApp | 09h-21h | "👋 Lembrando: estou por aqui te aguardando..." |
    | 4 | 24 horas | WhatsApp | 09h-21h | "🙂 [Primeiro_Nome], sei que nem sempre é o melhor momento para falar, caso você tenha decidido não continuar com este atendimento, basta me dizer que encerro agora, ok?" |
    | 5 | 3 dias | WhatsApp | 09h-21h | "📌 Como você não respondeu nada, vou tentar mais uma vez: você ainda tem interesse em continuar este atendimento? Se não tiver, por gentileza me informe..." |
    | 6 | 7 dias | WhatsApp | 09h-21h | "🔔 Última tentativa de contato: Você está por aí?" |
    | Encerramento | 10 dias | WhatsApp | 09h-21h | "⛔ Este atendimento foi encerrado automaticamente devido falta de resposta. Se precisar, você pode chamar novamente a qualquer momento... Até mais!" → marca **Oportunidade Perdida**, motivo `LEAD PAROU DE RESPONDER` |
    | Nutrição 1 | 30 dias | E-mail | horário comercial | Reengajamento educativo (riscos de nome negativado) |
    | Nutrição 2 | 60 dias | E-mail | horário comercial | Reengajamento educativo (nem todo acordo limpa o nome de verdade) |
    | Nutrição 3 | 90 dias | E-mail | horário comercial | Última tentativa de reativação |

    **Janela comercial confirmada: 09h-21h** (ajusta o valor genérico "9h-22h" usado como exemplo anteriormente neste documento).

    ✅ Confirmado: o passo 1 (10 min, fora da janela comercial) é intencional.

    **Importante:** mesmo após "Oportunidade Perdida" (dia 10), a régua **não para** — continua com 3 tentativas de reativação via e-mail (30/60/90 dias), conteúdo educativo em vez de venda direta. "Perdida" não é 100% terminal — existe fase de nutrição pós-perda que precisa de suporte no sistema (sub-estado ou flag "em nutrição").

    **Pendência ainda em aberto:** a agenda específica da **mensagem de proposta** (Passo 15) ainda não foi enviada.
- **Dois tipos de "call" diferentes, não confundir:**
  1. **Call de proposta (alto valor):** acima de R$ 500 mil, Malala oferece e quase insiste para apresentar a proposta por ligação com Luiz.
  2. **Call de tira-dúvidas (qualquer lead):** ferramenta de quebra de objeção prévia ("somos uma empresa séria, disponíveis até por telefone"). Vale para qualquer lead.
- **Editor de fluxo pelo admin (requisito estrutural):** todo o fluxo precisa ser editável por um admin autenticado, sem depender de programador/deploy — nova etapa, remover etapa, trocar texto, trocar mídia, reordenar passos.
- **Transcrição de áudio (novo, 11/08/2026):** o lead pode responder ou perguntar por áudio — antes de qualquer interpretação (parser determinístico ou IA), o áudio precisa ser **transcrito para texto** (ex.: via Whisper). Depois de transcrito, segue o mesmo pipeline normal de interpretação de qualquer resposta em texto.

---

## Parte 1 — Abertura padrão

**Passo 1-2:** duas mensagens em sequência, sem esperar resposta:

*(foto de uma atendente — mascote/avatar da empresa — ver anexo de exemplo, a integrar depois)*

│

```
🙋‍♂️🙋‍♂️ Olá, eu sou Malala, consultora digital especializada em recuperação e acesso a crédito aqui na ArrudaCred!

👉 *Com quem eu falo?*
```

**Observações para o desenho do fluxo:**
- Persona da atendente virtual: **"Malala"** (confirmado)
- Abertura combina imagem + texto
- Primeira pergunta objetiva: nome do lead

**Referência visual do avatar (exemplo enviado por Luiz):** foto em moldura circular, borda navy/dourado (paleta de marca ArrudaCred), foto profissional centralizada, logo "ArrudaCred Assessoria e Crédito" na base, selo de credibilidade integrado. Para a Malala, mesma linha visual, com foto de mulher.

**Passo 2.5 — Saudação personalizada (corrigido em 14/08/2026 — antes vivia por engano como "Parte 3, Passo 1"):**

```
Oi [Primeiro_Nome], [saudação]! É um prazer atender você!
```

**Observações para o desenho do fluxo:**
- **Correção de desenho (14/08/2026):** esta mensagem estava duplicada — existia uma vez aqui (implícita, junto do Passo 1-2) e de novo como "Passo 1" do fluxo de cada produto (Parte 3). Ela só faz sentido **uma vez por conversa**, assim que o nome é conhecido — não de novo toda vez que o lead entra num fluxo de produto. Corrigido: agora mora só aqui, na abertura.
- Dispara assim que `nome` é conhecido — tanto faz se o lead acabou de responder "Com quem eu falo?" quanto se o nome já veio de graça na própria primeira mensagem (ver regra de checkpoint já respondido, abaixo).
- `[saudação]` é dinâmica por horário de envio (bom dia / boa tarde / boa noite).

**Passo 2.6 — Telefone de contato (novo, 14/08/2026, condicional por canal):**

```
Pra eu continuar seu atendimento, me confirma um WhatsApp ou telefone de contato:
```

**Observações para o desenho do fluxo:**
- Só é perguntado quando o canal **não** fornece o telefone de forma nativa (ex.: widget do site, Instagram Direct). No WhatsApp e Telegram, o número já vem do próprio canal — o checkpoint é pulado automaticamente.

**Passo 3 (abertura) — Captura de e-mail (novo, 11/08/2026):**

```
Para te atender melhor, preciso que me informe o seu e-mail:
```

**Observações para o desenho do fluxo:**
- **Motivo do requisito:** a régua de follow-up padrão (ver premissas gerais) tem 3 etapas de nutrição por e-mail (30/60/90 dias) — sem o e-mail do lead essas etapas não funcionam. Por isso a captura precisa acontecer cedo, na identificação inicial, não só no Passo 17 (dados do contrato).
- **Validação obrigatória:** ao receber a resposta, validar formato de e-mail **antes** de dar o checkpoint como concluído. Se inválido, retorna pedindo para o lead conferir e reenviar.
- ✅ Confirmado: este checkpoint de e-mail vem **primeiro**, logo após o nome — antes da pergunta de "corte de produção" (seção 8.11 do plano mestre), quando as duas existirem juntas no fluxo.
- **Nota para reaproveitamento futuro — implementada em 14/08/2026:** o checkpoint de telefone (Passo 2.6 acima) resolve exatamente isso — condicional por canal, não fixo.

**Regra de checkpoint já respondido — implementada em 14/08/2026:** antes de perguntar nome ou produto de interesse, o sistema roda uma extração determinística (regex) sobre a primeira mensagem do lead (ex.: "Oi, sou Luiz e quero limpar meu nome" já preenche nome e produto de uma vez, pulando as perguntas correspondentes em silêncio). Cobre os padrões mais comuns; casos que a extração não reconhece continuam perguntando normalmente (e, quando a interpretação por IA for ligada — Fase 5 —, esses casos passam a cair nela antes de perguntar).

---

## Parte 2 — Triagem (menu de opções)

**Regra de exibição:** só aparece se o interesse do lead ainda não for conhecido.

```
Para agilizar seu atendimento, informe o número da opção:

1️⃣ Limpeza de Nome (CPF/CNPJ)
2️⃣ Aumento de Score / Rating
3️⃣ BACEN / SCR / CCF
4️⃣ Jusbrasil / Escavador
5️⃣ Conta Protegida (Bloqueio Judicial)
6️⃣ Consórcio
7️⃣ Crédito / Financiamento
8️⃣ Outro assunto

👉 *É só responder com o número da opção* 😊
```

**Observações para o desenho do fluxo:**
- Cada uma das 8 opções vira um agente/fluxo especializado próprio
- **Confirmado:** "BACEN/SCR/CCF" é produto separado de "Limpeza de Nome"
- **Produtos novos:** "Jusbrasil/Escavador" e "Conta Protegida (Bloqueio Judicial)"
- Opção 8 "Outro assunto" é catch-all — precisa de tratamento próprio

---

## Parte 3 — Fluxo do produto: Limpeza de Nome (CPF/CNPJ)

> ⚠️ **Correção de desenho (14/08/2026):** o antigo "Passo 1" desta parte ("Oi [Primeiro_Nome], bom dia! É um prazer atender você!") foi removido daqui — duplicava a saudação personalizada que já acontece uma vez na abertura (Parte 1, Passo 2.5), antes mesmo da triagem. O fluxo do produto agora começa direto no pedido de permissão para qualificar.

**Passo 2 — Pedido de permissão para qualificar:**

```
🤔 Se você responder 4 perguntas rápidas, em menos de um minuto eu já consigo informar o valor exato para limpar o seu nome. Depois disso, tiro todas as suas dúvidas e, se preferir, também podemos conversar por ligação.

👉 *Podemos começar?*
```

**Observações para o desenho do fluxo:**
- Checkpoint sim/não antes das 4 perguntas de qualificação
- Já avisa que são **4 perguntas**
- Resposta negativa → Malala agenda horário melhor e retoma sozinha depois

**Passo 3 — Explicação do serviço (3 mensagens em sequência, sem esperar resposta):**

```
✅ A proposta do nosso trabalho é remover as restrições que estão negativando seu CPF ou CNPJ — independentemente da origem: contas não pagas, cartão de crédito, empréstimos, financiamentos, protestos, cheques devolvidos ou ações de cobrança.

👉 O objetivo é que seu nome fique limpo, permitindo que você recupere sua reputação financeira e consiga voltar a pleitear acesso a crédito no mercado.
```

│

```
⚖️ O procedimento é realizado por meio de ação judicial coletiva via associação de proteção ao consumidor, garantindo direitos previstos em lei, removendo as restrições no SERASA, SPC Brasil, SCPC Boa Vista e CENPROT (Central Nacional de Protestos).

📌 O serviço conta com seguro-garantia de manutenção do nome limpo pelo período de 1 ANO, conforme condições contratuais (após 12 meses as restrições podem retornar se não forem negociadas ou pagas neste período).
```

│

```
⚠️ Importante entender: RESTRIÇÃO é uma coisa, DÍVIDA é outra! As restrições que hoje estão negativando seu nome nestes orgãos serão 100% removidas. Já as dívidas, continuarão existindo de forma interna no credor e nos sistemas do Banco Central.

✅ Em resumo: uma forma rápida e legal de obter CPF ou CNPJ limpo no sistema Serasa/SPC por um custo menor do que se fosse pagar as dívidas.
```

**Passo 4 — Pergunta de fechamento do bloco explicativo (aguarda resposta):**

```
👉 Você precisa limpar o *CPF* ou *CNPJ*?
```

**Observações para o desenho do fluxo:**
- Fatos de negócio: remove restrições em SERASA, SPC Brasil, SCPC Boa Vista, CENPROT; seguro-garantia 1 ano; restrição vs. dívida
- **Padrões de resposta a suportar:** um CPF, um CNPJ, mais de um CPF, composição CPF+CNPJ, pacote (X CPFs + Y CNPJs) → é uma **lista de itens**, não valor único

**Passo 5 — Confirmação (com variações conforme o Passo 4):**

```
Ótimo! Podemos auxiliar sim com o processo limpa nome para seu CPF.
```

*(Variações: "...seu CNPJ", "...seu CPF e CNPJ", "...seu pacote de CPF", etc. — gerada dinamicamente.)*

│

**Passo 6 — Faixa de valor da restrição (enviada em seguida, sem esperar resposta do Passo 5):**

```
👉 *Em qual das faixas abaixo melhor se enquadra o valor das restrições neste CPF atualmente?* (tudo bem se não tiver certeza - depois faremos uma consulta)

1️⃣ Menos de 10 mil
2️⃣ Entre 10 e 30 mil
3️⃣ Entre 30 e 50 mil
4️⃣ Entre 50 e 100 mil
5️⃣ Mais de 100 mil
```

**Refinamento se a resposta for a opção 1 (menos de 10 mil):**

```
Entendo, para eu conseguir te orientar melhor me responda:

1️⃣ Menos de 3 Mil
2️⃣ Entre 3 e 10 Mil
```

**Refinamento se a resposta for a opção 5 (mais de 100 mil):**

```
Entendi que são mais de 100 mil reais, para eu conseguir te orientar melhor, preciso que me informe o valor aproximado das restrições - pode escrever... (tudo bem se não tiver certeza - depois faremos uma consulta)
```

**Observações para o desenho do fluxo:**
- ✅ Confirmado: ramificação "mais de 100 mil" abre com resposta 5
- Só avança com a faixa aproximada de **cada** CPF/CNPJ capturada
- IA precisa interpretar valores livres ("10mil", "5000") e o "não sei" (tranquiliza e segue)

**Passo 7 — Orientação para restrição de baixo valor (menos de R$ 3.000):**

```
😊 Aqui na ArrudaCred nós sempre buscamos orientar o cliente da forma que entendemos ser mais vantajosa para ele.

Como o valor total das restrições é inferior a R$ 3.000, vale a pena considerar que nosso serviço de limpeza de nome tem um investimento mínimo de R$ 899 à vista ou 6x de R$ 299. Além disso, é importante lembrar que as dívidas continuam existindo, ou seja, a ação remove as restrições, mas não quita os débitos.

Por isso, nesse cenário, nossa recomendação é que você avalie a possibilidade de negociar e quitar diretamente essas dívidas, pois, financeiramente, essa costuma ser a opção mais vantajosa.

Se, ainda assim, você preferir seguir com a ação para remover as restrições do seu nome, será um prazer ajudar.
```

**Observações para o desenho do fluxo:**
- Ramificação: continua → mantém fluxo; não responde/concorda em negociar direto → **Perdida** (`LEAD OPTOU POR NEGOCIAR DÍVIDA DIRETAMENTE`)
- **Valor configurável:** R$ 899 / 6x R$ 299 — campo editável pelo admin, reutilizado em outros pontos

**Passo 8 — Experiência anterior e como conheceu a ArrudaCred:**

```
👍 Entendido! Me conta: você já contratou algum serviço de limpeza de nome antes? E como conheceu a ArrudaCred? Foi indicação de alguém? 🤔
```

**Observações:** pergunta estratégica de quebra de objeção (medo de golpe é a maior objeção do mercado).

**Passo 9 — Mensagem condicional (só se encontrou pela internet/Google/redes sociais):**

```
Obrigado por nos informar, estamos bem posicionados nos mecanismos de busca justamente por conta da nossa reputação e boa avaliação de clientes que já nos contrataram...
```

*(Se não foi pela internet, é pulada.)*

│

**Passo 10 — Mensagem sobre relacionamento (sempre enviada, em seguida sem esperar resposta):**

```
Pergunto porque para nós a relação com nossos clientes vale mais que uma venda isolada, assim ganhamos indicações com a confiança estabelecida. Entendemos a preocupação de quem ainda não nos conhece e tem medo de cair num golpe ou na mão de gente desonesta...
```

│

**Passo 11 — Bloco de credibilidade (4 mensagens em sequência, sem esperar resposta):**

```
⭐⭐⭐⭐⭐
Somos uma empresa com 5 anos de atuação no mercado de recuperação de crédito, trabalhando sempre com contrato para prestação de serviços, que deixa claro os direitos e deveres tanto do cliente quanto da empresa.

👉 *Não existe milagre. O que existe é processo dentro da lei, contrato, prazo e compromisso.*
👉 No último ano, auxiliamos mais de 5 mil clientes em processos de regularização de crédito.
👉 Atualmente temos avaliação 4,9 no Google (o máximo é nota 5,0) e avaliação 9,5 no Reclame Aqui (máximo é nota 10).
```

│

```
📌 Dados da empresa:
ARRUDACRED – HUB ARRUDA DE NEGÓCIOS E SERVIÇOS
L.H. DE ARRUDA D. DO VALLE SERVIÇOS LTDA
CNPJ: 40.342.851/0001-37

🌐 Site: https://www.arrudacred.com.br

📷 Instagram:
https://instagram.com/arrudacred.br

*Trabalhamos com foco em transparência e segurança para o cliente, oferecendo*:

✅ Contrato de prestação de serviços
✅ Google com avaliação 5 estrelas
✅ Reclame Aqui com avaliação 9,5 (ótima)
✅ Mais de 5 mil clientes atendidos
✅ Seguro Garantia de 12 meses incluso
```

│

```
(envia imagem do selo Prêmio Reclame Aqui 2026)

A *ARRUDACRED* está concorrendo ao *Prêmio Reclame AQUI*. Nossa empresa foi indicada na categoria RECUPERAÇÃO DE CRÉDITO, junto de outras grandes no segmento, como CENPROT NACIONAL E SPC BRASIL.

Veja você mesmo:
📌 https://www.reclameaqui.com.br/premio/classificadas-indicadas/financeiras/
```

**Observações sobre o selo (imagem enviada por Luiz):** círculo em fundo verde escuro, "Melhores empresas para o consumidor 2026", "Prêmio ReclameAQUI" — mesma linha de design institucional do avatar.

**Status (14/08/2026):** placeholder de imagem já criado no sistema (etapa `ln_passo11`, painel admin → editor de fluxo) — falta só Luiz subir o arquivo/URL pela tela. Mesma coisa para a foto da Malala (Parte 1, Passo 1-2, etapa `saudacao_inicial`).

**Passo 12 — Urgência (última mensagem do bloco, aguarda resposta):**

```
📣 *Para eu conseguir te orientar melhor me diz: para quando você tem necessidade do CPF limpo?*

1️⃣ Só está pesquisando
2️⃣ Urgente
3️⃣ Em 30-45 dias
4️⃣ 3 a 6 meses
5️⃣ Outro, me explique!
```

**Observações para o desenho do fluxo:**
- Pergunta dinâmica conforme tipo capturado (CPF/CNPJ/pacote)
- Opção 5 sem explicação → não avança, Malala pede a explicação
- **Persistência:** respostas (experiência anterior, como conheceu, urgência) salvas na oportunidade, configurável no editor de fluxo (nome do campo por checkpoint)

**Passo 13 — Mensagem de prazo (padrão/fixa, independente da resposta de urgência):**

```
Vejo que não tem tempo sobrando, o prazo normal para o resultado é de 7 a 45 dias úteis mas depende de um processo judicial, portanto pode variar. Entender que, quanto antes der entrada mais rápido sai o resultado, pode ajudar na sua situação...
```

│

**Passo 14 — Escassez/urgência do voucher (em seguida, sem esperar resposta do Passo 13):**

```
📌 Nós recebemos alguns vouchers da Associação que nos permitem oferecer uma condição especial muito expressiva. Como são limitados, para liberar a proposta com a melhor condição possível, precisamos saber:

👉 *É prioridade para você já entrar com o CPF para ser limpo e começar a contar o prazo hoje?*
1️⃣ Sim
2️⃣ Não
```

**Observações para o desenho do fluxo:**
- Resposta salva na oportunidade
- **Ramificação:** Sim → proposta + condição especial (voucher, válida 24h); Não → proposta sem condição especial
- Gatilho de escassez precisa ser genuíno (vouchers realmente limitados)

**Passo 15 — Bloco da proposta (5 mensagens em sequência, sem esperar resposta até a última):**

```
A proposta é elaborada de acordo com as suas restrições e as condições de pagamento variam ao longo do mês.  Se você já decidiu limpar seu nome, aproveite a condição especial que conseguimos liberar hoje utilizando por conta do fechamento da nossa meta
```

│

```
📎 PROPOSTA LIMPA NOME - SPC/SERASA
Pacote fechado para limpar seu nome nos 4 maiores órgãos de proteção de crédito: SERASA, SPC BOA VISTA, SPC BRASIL e CENPROT. Todos os tipos de restrições inclusos: boletos, duplicadas, ações judicias, protestos, cartões de crédito e restrições bancárias. Preço já engloba custas processuais, honorários, despesas gerais e blindagem:

👉 Prazo: De 7 até 45 dias úteis
👉 Seguro-Garantia: 1 ano
👉 Bacen: não incluso.
```

│

```
👉 *PREÇO JÁ COM DESCONTO 50% para pagamento Boleto/Pix sendo primeira parcela imediata junto com a assinatura do contrato*:

📌 *Especial à vista*:
~De: R$ 3600,00~
Por: R$ 1.800,00 parcela única

ou

📌 *Parcelado Boleto/Pix*:
6 vezes 600,00 ou ainda em até 12 vezes no cartão.
```

│

```
💥💥 *Condição Especial*
_Fechando agora com voucher especial (válido por 24h):_

👉 *1.290,00* à vista ou 6 vezes de *399,00* 🤩
```
*(somente se o lead respondeu "Sim" no Passo 14 — prioridade em fechar hoje)*

│

```
🙋‍♂️Como fica melhor para você fechar HOJE?

👉 *À vista ou parcelado?*
```

**Observações para o desenho do fluxo:**
- ⚠️ Valores fictícios/exemplo — valor real calculado pela faixa (Passos 6-7). Ver "Estrutura da tabela de preços" ao final deste documento.
- 3 camadas de preço: cheio (ancoragem, tachado) → desconto 50% (à vista/parcelado) → voucher (se aplicável)
- Gatilho de "meta de fechamento da empresa" — outro gatilho de urgência/escassez
- Bacen explicitamente **não incluso**
- Pergunta final aguarda resposta do lead

**Passo 16 — Perguntas frequentes antes do fechamento (FAQ) e retomada do checkpoint de pagamento:**

Na prática, o lead raramente responde a pergunta de pagamento direto — vêm perguntas antes: garantia, confiabilidade, cartão de crédito, quando pagar, minuta do contrato, etc.

**Regra:** Malala tem base de FAQ no contexto de treinamento; responde e **retoma o checkpoint de pagamento** (regra de desvio, aplicada de forma mais intensa aqui).

**Observações para o desenho do fluxo:**
- Forma de pagamento é a única informação que falta para avançar pra coleta de dados
- **Base de FAQ estruturada e editável pelo admin** — ver `FAQ_LIMPANOME_SERASA_SPC.md`
- **Pendência:** agendas de follow-up (normal e de proposta) ainda a enviar por Luiz

**Passo 16.1 — Malala como negociadora (papel adicional):**

Depois da proposta, Malala também negocia a **data da primeira parcela** (padrão é "hoje"), deixando claro que **o processo só dá entrada após o pagamento** confirmado.

**Observações para o desenho do fluxo:**
- Margem de negociação real (não é sim/não fechado) — hoje limitada só à data (não parcelas/valor)
- **Crítico:** calendário de pagamento acordado precisa ser capturado com precisão, vira cláusula do contrato — checkpoint antes da geração do PDF (Passo 19)

**Passo 17 — Coleta de dados para o contrato:**

```
👍 Entendido! Agora vou enviar os dados necessários para a emissão do contrato, em 2 minutinhos vc consegue preencher:
```

│

```
📌 *DADOS PARA LIMPEZA DE NOME:*

CPF:
Nome Completo:
```

*(Depois de obter os dados de quem será limpo, envia a mensagem seguinte — espera o preenchimento anterior, não é enviada junto:)*

```
📌 *DADOS DE QUEM VAI ASSINAR CONTRATO:*

** CPF: 
** Nome Completo: 
** RG: 
** Estado Civil: 
** Profissão: 
** Nacionalidade: 
** Data Nascimento: 
** E-mail: 
** Whatsapp: 
** Endereço completo com cep: 
```

**Observações para o desenho do fluxo:**
- **Dois blocos distintos:** dados de quem será limpo (pode repetir se houver mais de um CPF/CNPJ) e dados de quem assina (pode ser pessoa diferente)
- Dado sensível LGPD começa a fluir aqui de verdade — reforça criptografia/RBAC/auditoria (seção 2 do plano mestre)
- Conecta com módulo Jurídico: alimenta geração do contrato via Assinafy

**Passo 18 — Solicitação de documentos (não bloqueia o fluxo se não enviado na hora):**

```
Estamos quase concluindo! Agora falta somente a foto ou PDF de um documento válido (RG ou CNH) + comprovante de residência da pessoa que vai assinar o contrato. (se não tiver em mãos para enviar neste momento, me avise que anotamos aqui para você enviar depois.)
```

**Observações para o desenho do fluxo:**
- Não trava o fluxo — precisa de mecanismo de "pendência a cobrar depois"
- Documentos de identidade são LGPD altamente sensíveis — exige armazenamento seguro de arquivo

**Passo 19 — Geração do contrato (PDF) e envio para Assinafy:**

```
😊 Aguarde um momento, seu contrato já está sendo preparado... Nós avisaremos aqui assim que estiver pronto para que você leia e realize a assinatura digital usando seu celular ou computador.
```

**Passo 20 — Contrato pronto para assinatura (disparado por WEBHOOK da Assinafy, não é resposta síncrona do chat):**

```
🎗️ *O Contrato de prestação de serviços da ArrudaCred foi enviado para o seu e-mail!*
(Se tiver dificuldade para localizar, pesquise pela palavra ASSINAFY - não esqueça de olhar na caixa de spam também)

👉 *Para realizar assinatura siga os passos:*

1) Localize o email recebido sobre o contrato, copie ou anote o código de acesso e clique no botão azul "ABRIR DOCUMENTO"
2) Na tela que se abrirá, digite ou cole o código que você anotou e clique no botão "ACESSAR DOCUMENTO"
3) Confirme seus dados pessoais e clique no botão azul.
4) Leia o contrato completamente e depois clique no botão "ASSINAR CONTRATO"
5) Desenhe sua assinatura no espaço indicado e confirme! O processo de assinatura só finaliza quando aparecer a mensagem "ASSINATURA FEITA COM SUCESSO"

📌 *Favor me avisar aqui depois que tiver assinado!*
```

**Passo 21 — Assinatura confirmada (também WEBHOOK da Assinafy, independente do lead avisar):**

```
👍 *Confirmada assinatura do contrato!*
```

**Observações para o desenho do fluxo (Passos 19-21):**
- Motor de atendimento não é 100% síncrono — precisa suportar passos disparados por webhook externo (genérico para futuras integrações, ex.: Asaas)
- Webhook é a fonte de verdade, não o lead avisando manualmente
- Ponto de transição "Negociação" → "Fechado" no Kanban

**Passo 22 — Pós-assinatura: geração financeira e envio do link de pagamento:**

Após a assinatura (webhook Assinafy — Passo 21):
1. Gera **parcelas financeiras** no sistema (conforme calendário do Passo 16.1)
2. Sincroniza com a **Asaas**
3. Envia **link de pagamento da primeira parcela**

**Passo 23 — Confirmação de pagamento (WEBHOOK da Asaas) → oportunidade vira "Ganha":**

Webhook da Asaas conclui a venda e transforma a oportunidade em "Ganha" (não é o lead avisando).

```
👍 *Processo Contratação Concluído!*

O contrato já foi assinado por ambas as partes e você pode baixar sua via final do contrato assinado no e-mail que acaba de receber! Já estamos dando sequência nos trâmites necessários para limpar seu nome, agora basta aguardar... 

🙌 Não esqueça: o prazo para limpeza do nome é entre 7 e 45 dias úteis, podendo ser renovado por igual período em caso de recursos ou agravos durante o processo. Assim que iniciarem as baixas, você poderá acompanhar pelo seu app do Serasa ou SPC; de qualquer forma nós vamos avisar assim que concluir a ação junto aos orgãos!
```

**Observações para o desenho do fluxo (Passos 22-23):**
- Fonte de verdade é o evento externo (webhook), não a palavra do lead
- Prazo pode ser renovado por igual período em caso de recursos/agravos
- Cliente acompanha pelo app Serasa/SPC além do aviso da ArrudaCred
- Fechamento do ciclo de vida: mapeado em `KANBAN_COMERCIAL_LIMPANOME.md`

---

*(Script de vendas do produto Limpeza de Nome Serasa/SPC praticamente completo — restam mensagens intermediárias/pontuais, ex.: envio de link de pagamento, conforme Luiz for enviando.)*

---

## Estrutura da tabela de preços por faixa

**⚠️ Requisito reforçado por Luiz (11/08/2026):** não é só o preço de cada faixa que precisa ser editável pelo admin — **as próprias faixas de restrição disponíveis para o lead escolher** (os limites de cada faixa no menu do Passo 6) também precisam ser configuráveis. Ou seja, o admin deve poder alterar tanto os valores de preço quanto os intervalos (de-até) que definem cada faixa, sem depender de código.

| Faixa de restrição | Preço cheio ("De") | Preço à vista c/ desconto ("Por") | Parcelado Boleto/Pix (nº x valor) | Parcelado Cartão (até Nx) | Voucher à vista | Voucher parcelado (nº x valor) |
|---|---|---|---|---|---|---|
| Menos de R$ 3 mil | *(N/A — ver Passo 7, valor fixo R$ 899 à vista / 6x R$ 299)* | | | | | |
| R$ 3 mil – R$ 10 mil | R$ 2.580,00 | R$ 1.290,00 | 6x R$ 430,00 | até 12x | R$ 899,00 | 6x R$ 299,00 |
| R$ 10 mil – R$ 30 mil | R$ 3.600,00 | R$ 1.800,00 | 6x R$ 600,00 | até 12x | R$ 1.290,00 | 6x R$ 399,00 |
| R$ 30 mil – R$ 50 mil | R$ 3.600,00 | R$ 1.800,00 | 6x R$ 600,00 | até 12x | R$ 1.290,00 | 6x R$ 399,00 |
| R$ 50 mil – R$ 100 mil | R$ 4.800,00 | R$ 2.400,00 | 6x R$ 800,00 | até 12x | R$ 1.790,00 | 6x R$ 599,00 |
| R$ 100 mil – R$ 500 mil | R$ 6.000,00 | R$ 3.000,00 | 6x R$ 1.000,00 | até 12x | R$ 2.390,00 | 6x R$ 799,00 |
| Acima de R$ 500 mil | *(N/A — usa fórmula: R$ 7.680 + 1,5% do valor da restrição)* | | | | | |

✅ Confirmado por Luiz: as faixas "R$ 10-30 mil" e "R$ 30-50 mil" têm o mesmo preço intencionalmente neste momento (não é erro de preenchimento).
