# Régua de Cobrança — ArrudaCred (uso futuro)
**Status:** Registrado em 11/08/2026, extraído de `regua_cobança_arrudacred.xlsx` enviada por Luiz.
**Uso previsto:** módulo Financeiro/PaySmart, para cobrança de parcelas em atraso **após contrato assinado** — não faz parte do MVP1 (que trata do atendimento comercial pré-venda). Guardado aqui para não se perder até a hora de detalhar o módulo Financeiro.

Régua multicanal (SMS + WhatsApp + E-mail + Roteiro de Ligação humana) acionada a partir do vencimento de uma parcela em atraso.

---

## D+1 — Primeiro aviso

**SMS:**
```
[Contrato ArrudaCred] ⚠️ Em atraso. Multa e juros ativos. Regularize: [link] ou informe data.
```

**WhatsApp (mensagem automática):**
```
Olá, [Nome]. Identificamos atraso no seu Contrato ArrudaCred e, conforme previsto, multa e juros já estão sendo aplicados.

Quanto antes regularizar, menores serão os encargos.
👉 Pagar: [link]

* Atenção: informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação.

👉 Para responder ou informar a data de pagamento prevista, envie uma mensagem para o WhatsApp de atendimento da ArrudaCred: [Link]
```

**E-mail:**
```
Assunto: ⚠️ Encargos já estão sendo aplicados — Contrato ArrudaCred

Olá, [Nome].

Seu Contrato ArrudaCred está em atraso e multa e juros já estão sendo aplicados conforme previsto. Nos primeiros dias, ainda é possível evitar o aumento significativo da dívida. Quanto mais tempo em aberto, maiores serão os encargos.

👉 Link de pagamento: [link]

* Atenção: informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação.

👉 Para responder ou informar a data de pagamento prevista, envie uma mensagem para o WhatsApp de atendimento da ArrudaCred: [Link]
```

**Roteiro de ligação:** — (nenhum nesta etapa)

---

## D+4

**SMS:**
```
[Contrato ArrudaCred] ⚠️ Evite aumento da dívida. Regularize: [link] ou informe data.
```

**WhatsApp (mensagem automática):**
```
[Nome], seu Contrato ArrudaCred permanece em aberto.
Os encargos continuam aumentando e o valor final pode ficar maior que o original.
👉 Pagar: [link]
👉 Informar data
Informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação.
Para responder ou informar a data de pagamento prevista, envie uma mensagem para o WhatsApp de atendimento da ArrudaCred: [Link]
```

**E-mail:**
```
Assunto: O valor da dívida pode aumentar rapidamente

Olá, [Nome]. Seu Contrato ArrudaCred segue em atraso.
Com a continuidade do atraso, encargos adicionais podem ser aplicados, elevando o valor total devido.
👉 Regularizar: [link]
👉 Ou informe a data
Informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação.
Dica: resolver cedo evita crescimento da dívida.
```

**Roteiro de ligação:** — (nenhum nesta etapa)

---

## D+7

**SMS:**
```
[Contrato ArrudaCred] ⚠️ Atraso pode comprometer seu crédito. [link] ou informe data.
```

**WhatsApp (mensagem humana, não automática):**
```
Olá, [Nome]. Falo do atendimento da ArrudaCred.
O atraso do seu Contrato ArrudaCred continua e já começa a comprometer seu crédito, dificultando aprovações e oportunidades financeiras.
Podemos te ajudar a regularizar.
👉 Pagar: [link]
👉 Informar data
Informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação.
```

**E-mail:**
```
Assunto: Seu crédito pode ser comprometido

Olá, [Nome]. O atraso do seu Contrato ArrudaCred continua gerando encargos.
A inadimplência pode comprometer seu histórico financeiro e dificultar acesso a crédito.
👉 Pagar agora: [link]
👉 Ou informe a data
Informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação.
Dica: histórico recente é decisivo na análise de crédito.
```

**Roteiro de ligação:** — (nenhum nesta etapa)

**⚠️ Nota:** diferente de D+1/D+4, a mensagem de WhatsApp de D+7 não está marcada como "mensagem automática" na planilha original — sugere que pode ser um humano enviando, não a IA. Vale confirmar isso quando este módulo for detalhado.

---

## D+10

**SMS:**
```
[Contrato ArrudaCred] ⚠️ Crédito em risco. Regularize hoje: [link] ou informe data.
```

**WhatsApp (mensagem automática):**
```
[Nome], seu Contrato ArrudaCred permanece em atraso e seu crédito já pode estar sendo impactado.
Isso dificulta cartões, financiamentos e aprovações.
👉 Pagar: [link]
👉 Informar data
Informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação.
Para responder ou informar a data de pagamento prevista, envie uma mensagem para o WhatsApp de atendimento da ArrudaCred: [Link]
```

**E-mail:**
```
Assunto: Seu crédito já pode estar sendo afetado

Olá, [Nome]. O atraso do seu Contrato ArrudaCred já pode impactar sua reputação financeira.
Isso reduz suas chances de aprovação de crédito e pode gerar condições menos favoráveis.
👉 Regularizar: [link]
👉 Ou informe a data
Informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação.
Dica: resolver pendências rapidamente protege seu histórico.
```

**Roteiro de ligação (objetivo: obter compromisso):**
```
• Confirmar recebimento das mensagens
• Explicar impacto no crédito
• Perguntar motivo do atraso
• Solicitar pagamento ou data
• Reforçar observação (*)
```

---

## D+16

**SMS:**
```
[Contrato ArrudaCred] 🚨 Após 15 dias: cobrança extrajudicial ativa. [link] ou informe data.
```

**WhatsApp (mensagem automática):**
```
[Nome], seu Contrato ArrudaCred ultrapassou 15 dias de atraso.
Encargos de cobrança extrajudicial podem ser aplicados e há risco real de negativação.
👉 Pagar: [link]
👉 Informar data
Informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação.
Para responder ou informar a data de pagamento prevista, envie uma mensagem para o WhatsApp de atendimento da ArrudaCred: [Link]
```

**E-mail:**
```
Assunto: 🚨 Risco de negativação e encargos extrajudiciais

Olá, [Nome]. Seu Contrato ArrudaCred ultrapassou 15 dias em atraso.
Nesta fase, podem ser aplicados encargos de cobrança extrajudicial e existe risco de negativação do seu nome.
👉 Regularizar: [link]
👉 Ou informe a data
Informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação.
Dica: negativação pode impactar sua vida financeira por meses.
```

**Roteiro de ligação:** — (nenhum nesta etapa)

---

## D+22

**SMS:**
```
[Contrato ArrudaCred] 🚨 Evite negativação. Pode ser mais difícil limpar o nome. [link] ou informe data.
```

**WhatsApp (mensagem humana, não automática):**
```
Olá, [Nome]. Aqui é o atendimento oficial da ArrudaCred.
Seu Contrato ArrudaCred ainda não foi regularizado e existe risco de nova negativação, o que pode tornar mais difícil limpar seu nome novamente.
Estamos à disposição para te ajudar a resolver.
👉 Pagar: [link]
👉 Informar data
Informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação.
```

**E-mail:**
```
Assunto: Seu nome pode voltar a ficar negativado

Olá, [Nome]. Seu Contrato ArrudaCred permanece em aberto.
Uma nova negativação pode reduzir ainda mais seu score e dificultar futuras regularizações.
👉 Pagar agora: [link]
👉 Ou informe a data
Informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação.
Dica: múltiplas negativações reduzem drasticamente o score.
```

**Roteiro de ligação:** — (nenhum nesta etapa)

---

## D+29 — Última tentativa antes de cobrança judicial

**SMS:**
```
[Contrato ArrudaCred] 🚨 Último aviso antes da cobrança judicial. [link] ou informe data.
```

**WhatsApp (mensagem automática):**
```
[Nome], este é o último aviso antes da cobrança judicial do seu Contrato ArrudaCred.
O processo pode resultar em oficial de justiça, bloqueio de contas e penhora de bens, conforme decisão judicial.
👉 Pagar: [link]
👉 Informar data
Informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação.
Para responder ou informar a data de pagamento prevista, envie uma mensagem para o WhatsApp de atendimento da ArrudaCred: [Link]
```

**E-mail:**
```
Assunto: 🚨 Cobrança judicial e medidas legais possíveis

Olá, [Nome]. Este é o último aviso antes do envio do seu Contrato ArrudaCred para cobrança judicial.
Medidas judiciais podem incluir bloqueio de contas, penhora de bens e visita de oficial de justiça, gerando custos adicionais.
👉 Regularizar hoje: [link]
👉 Ou informe a data
Informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação.
Dica: resolver antes da via judicial evita custos e transtornos.
```

**Roteiro de ligação (objetivo: última tentativa):**
```
1. Informar envio ao jurídico
2. Explicar consequências reais
3. Solicitar pagamento imediato ou data
4. Reforçar observação (*)
5. Registrar resposta
```

---

## Observações gerais para quando este módulo for detalhado
- Alterna entre mensagem **automática** (D+1, D+4, D+10, D+16, D+29) e mensagem que parece ser de **atendente humano** (D+7, D+22) — vale confirmar essa alternância intencional quando formos desenhar o módulo
- A observação "(*)" repetida em quase toda mensagem — **"informar a previsão não suspende juros ou cobranças, mas nos ajuda a defender você junto à associação"** — é um texto padrão que provavelmente deveria ser um bloco de conteúdo único reaproveitado (mesmo princípio já registrado no `FAQ_LIMPANOME_SERASA_SPC.md` sobre blocos de conhecimento compartilhado), não repetido em cada mensagem individualmente
- Roteiros de ligação humana existem em D+10 e D+29 — pontos de escalonamento pra ligação ativa de cobrança
- Escalada de tom: aviso simples → risco ao score/crédito → risco de negativação → cobrança extrajudicial → aviso final pré-judicial
