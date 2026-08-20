# Especificação de Automação --- Geração de Capa de Post por Persona

## 1. Objetivo

Este documento define o fluxo que o LLM deve executar para gerar a
**imagem final de capa de um post de WordPress** a partir de apenas três
entradas:

1.  **Título do post**
2.  **Post completo**
3.  **Persona completa**

O sistema deve transformar essas três entradas em uma direção visual
foto-realista, emocional e coerente com o conteúdo e com a psicologia da
persona.

A imagem final deve:

-   conectar-se claramente ao **título e assunto do post**;
-   representar a **dor, desejo, conflito ou emoção da persona** que
    tenha maior relação com aquele post;
-   gerar **identificação emocional e curiosidade**;
-   parecer uma fotografia profissional/editorial, e não uma imagem
    genérica de banco de imagens ou uma ilustração típica de IA;
-   funcionar como **imagem destacada/capa de artigo no WordPress**;
-   não conter título, slogan ou textos longos;
-   usar **português do Brasil** caso algum texto legível apareça
    naturalmente na cena.

------------------------------------------------------------------------

## 2. Entradas obrigatórias

O processo sempre começa com:

``` text
TITULO_POST = {{titulo}}
POST_COMPLETO = {{post_completo}}
PERSONA_COMPLETA = {{persona_completa}}
```

Não é necessário que o usuário forneça resumos. O próprio sistema deve
criá-los nas etapas abaixo.

------------------------------------------------------------------------

# 3. Fluxo obrigatório

Execute nesta ordem:

``` text
TÍTULO + POST COMPLETO + PERSONA COMPLETA
                    ↓
        ETAPA 1 — Analisar o post
                    ↓
        RESUMO ESTRATÉGICO DO POST
                    ↓
        ETAPA 2 — Analisar a persona
                    ↓
        RESUMO PSICOLÓGICO-VISUAL
                    ↓
        ETAPA 3 — Cruzar título + post + persona
                    ↓
        DEFINIR UMA ÚNICA IDEIA VISUAL
                    ↓
        ETAPA 4 — Construir prompt da imagem
                    ↓
        ETAPA 5 — Gerar a imagem final
```

**Regra central:** não gere a imagem diretamente a partir do material
bruto. Primeiro extraia o que é visual e emocionalmente relevante do
post e da persona. Depois cruze essas informações para decidir a cena.

------------------------------------------------------------------------

# 4. ETAPA 1 --- Gerar o resumo estratégico do post

Use internamente a seguinte instrução:

## Prompt interno --- Análise do Post

Você é um especialista em marketing, neuromarketing, comportamento
humano, storytelling e direção criativa.

Analise o artigo completo e produza um **RESUMO ESTRATÉGICO destinado
exclusivamente à criação posterior da imagem de capa**.

### Entradas

``` text
TÍTULO DO POST:
{{titulo}}

POST COMPLETO:
{{post_completo}}
```

### Não faça um resumo convencional.

Extraia somente informações úteis para criar uma imagem foto-realista,
emocional, relevante e capaz de despertar curiosidade no público certo.

Identifique:

### 1. Assunto central

Em uma frase curta, explique sobre o que realmente é o artigo.

### 2. Promessa ou descoberta principal

O que o leitor poderá entender, descobrir, evitar, conquistar ou
resolver ao ler o artigo?

### 3. Problema ou conflito central

Qual situação concreta está levando o leitor a procurar esse conteúdo?

### 4. Emoção de entrada

Qual sentimento provavelmente existe **antes da leitura**?

Exemplos possíveis: medo, vergonha, frustração, ansiedade, insegurança,
dúvida, impotência, indignação, esperança ou curiosidade.

Escolha somente emoções sustentadas pelo artigo.

### 5. Emoção de saída

Como o conteúdo pretende fazer o leitor se sentir diante da
possibilidade apresentada?

Exemplos: esperança, segurança, alívio, controle, confiança,
possibilidade ou desejo de agir.

### 6. Situações visualizáveis

Extraia até **3 situações concretas** relacionadas ao conteúdo que
poderiam ser transformadas em fotografia realista.

Priorize situações humanas e cotidianas em vez de conceitos abstratos.

### 7. Elementos visuais relevantes

Liste somente objetos, ambientes, acontecimentos ou sinais concretos com
relação real com o artigo.

Exemplos: celular mostrando uma negativa, concessionária, cartão
recusado, aplicativo bancário, mesa de trabalho, veículo, família ou
escritório.

### 8. Gancho de curiosidade

Explique em uma frase qual contradição, descoberta, dúvida ou tensão do
artigo poderia fazer alguém olhar para a imagem e pensar:

> "Tem alguma coisa aqui que eu preciso entender."

### Regras da análise do post

-   Não invente fatos.
-   Não escreva copy, headline ou chamada publicitária.
-   Não sugira textos para colocar na imagem.
-   Não descreva ainda a imagem final.
-   Não tente representar todos os assuntos do artigo.
-   Priorize o conflito principal.
-   Priorize o aspecto emocional com maior potencial visual.

### Saída obrigatória da Etapa 1

Além dos campos acima, produza:

#### RESUMO PARA O GERADOR DE IMAGEM

Um único parágrafo de aproximadamente **100 a 180 palavras**, contendo
apenas as informações essenciais para a futura decisão visual.

Armazene esse resultado como:

``` text
RESUMO_POST
```

------------------------------------------------------------------------

# 5. ETAPA 2 --- Gerar o resumo psicológico-visual da persona

Use internamente a seguinte instrução:

## Prompt interno --- Análise da Persona

Você é um especialista em psicologia do consumidor, neuromarketing,
comportamento humano, storytelling e direção criativa.

Analise a persona completa e produza um **RESUMO PSICOLÓGICO-VISUAL
destinado exclusivamente à criação posterior de imagens de capa**.

### Entrada

``` text
PERSONA COMPLETA:
{{persona_completa}}
```

### Não faça um resumo convencional.

Extraia somente características capazes de influenciar:

-   personagem;
-   situação;
-   emoção;
-   expressão;
-   linguagem corporal;
-   ambiente;
-   objetos;
-   relações humanas;
-   narrativa visual.

Identifique:

### 1. Quem é essa pessoa

Idade aproximada, gênero quando relevante, profissão/ocupação, situação
familiar, condição econômica e contexto de vida.

Inclua apenas características úteis à representação visual ou emocional.

### 2. Situação atual

Qual problema concreto ela vive agora?

### 3. Objetivo aparente

O que ela diz querer resolver ou conquistar?

### 4. Desejo profundo

O que essa conquista realmente representa emocionalmente?

Exemplos: independência, dignidade, segurança, reconhecimento, proteção
da família, recomeço, liberdade, pertencimento ou controle.

### 5. Dor emocional central

Qual sentimento mais pesa sobre essa pessoa?

### 6. Medos mais profundos

Selecione no máximo **3** medos com maior influência sobre decisões e
comportamento.

Priorize medos humanos e emocionais.

### 7. Identidade ameaçada

Que imagem a pessoa possui de si mesma e sente que o problema coloca em
risco?

Exemplos: bom pai, provedor, empresário competente, pessoa responsável,
profissional respeitado ou pessoa independente.

### 8. Pessoas emocionalmente importantes

Quem ao redor dela aumenta o peso emocional do problema?

Exemplos: cônjuge, filhos, pais, irmãos, sócios, funcionários, clientes
ou amigos.

### 9. Momentos de maior tensão

Liste até **3 situações concretas** nas quais essa pessoa sente o
problema intensamente.

As situações devem ser potencialmente fotografáveis.

### 10. Momentos de desejo

Liste até **3 situações concretas** que simbolizem a vida que ela deseja
alcançar.

### 11. Ambientes e objetos do universo da persona

Liste ambientes, objetos e elementos cotidianos que possam tornar a
imagem autêntica.

Use somente elementos sustentados pela descrição original.

### 12. Gatilhos de identificação

O que faria essa pessoa olhar para uma fotografia e pensar:

> "Essa situação poderia ser comigo."

### 13. O que evitar

Identifique representações que poderiam gerar rejeição, desconfiança,
vergonha excessiva, artificialidade ou perda de identificação.

### Regras da análise da persona

-   Não invente características ausentes.
-   Não transforme a persona em caricatura.
-   Não escreva anúncio ou copy.
-   Não sugira frases para a imagem.
-   Não descreva ainda a imagem final.
-   Diferencie objetivo funcional de desejo emocional.
-   Preserve contradições psicológicas importantes.
-   Priorize emoções demonstráveis visualmente.
-   Não tente transportar toda a ficha da persona para a imagem.

### Saída obrigatória da Etapa 2

Produza:

#### RESUMO PARA O GERADOR DE IMAGEM

Um único parágrafo de aproximadamente **120 a 200 palavras**, contendo:

-   quem é a pessoa;
-   situação atual;
-   problema;
-   objetivo aparente;
-   desejo profundo;
-   emoção dominante;
-   principais medos;
-   identidade ameaçada;
-   relações importantes;
-   situações cotidianas visualmente relevantes.

Armazene como:

``` text
RESUMO_PERSONA
```

------------------------------------------------------------------------

# 6. ETAPA 3 --- Cruzamento estratégico

Agora utilize simultaneamente:

``` text
TITULO_POST
RESUMO_POST
RESUMO_PERSONA
```

O objetivo desta etapa é encontrar **a interseção entre o assunto do
post e a psicologia da persona**.

Não escolha simplesmente a característica mais dramática da persona.

Não escolha simplesmente uma ilustração literal do título.

Pergunte internamente:

1.  Qual parte do problema tratado pelo post toca mais profundamente
    essa persona?
2.  Qual emoção da persona é ativada especificamente por este assunto?
3.  Em qual situação cotidiana essa combinação poderia acontecer?
4.  Qual momento pode ser entendido visualmente em 1--2 segundos?
5.  Qual cena cria identificação sem revelar toda a resposta do artigo?
6.  Qual detalhe cria uma pequena lacuna de curiosidade?
7.  Essa cena continuaria fazendo sentido sem nenhum texto sobreposto?

Use a seguinte cadeia de decisão:

``` text
EMOÇÃO CENTRAL
      ↓
CONFLITO RELACIONADO AO POST
      ↓
MOMENTO VISUAL
      ↓
PERSONAGEM
      ↓
AMBIENTE
      ↓
OBJETO/SINAL NARRATIVO
      ↓
LACUNA DE CURIOSIDADE
```

Escolha **UMA única ideia visual principal**.

Não tente combinar várias cenas, vários medos ou várias promessas na
mesma imagem.

------------------------------------------------------------------------

# 7. ETAPA 4 --- Criar o prompt final da imagem

Use a seguinte instrução como base para construir o prompt destinado ao
modelo de geração de imagem:

## Prompt Mestre --- Direção da Capa

Você é um diretor de arte, fotógrafo publicitário e especialista em
neuromarketing, comportamento humano e comunicação emocional.

Crie uma imagem **FOTO-REALISTA** para ser usada como capa de um artigo
de blog no WordPress.

### Título

``` text
{{titulo}}
```

### Resumo estratégico do post

``` text
{{RESUMO_POST}}
```

### Resumo psicológico-visual da persona

``` text
{{RESUMO_PERSONA}}
```

Analise as três informações em conjunto.

A imagem **não deve simplesmente ilustrar literalmente o título**.

Ela deve representar visualmente a situação, conflito, desejo ou emoção
mais importante que conecta o conteúdo do artigo à persona.

A pessoa correspondente à persona deve poder olhar para a cena e sentir
algo próximo de:

> "Isso está falando de uma situação que eu vivo."

Ao mesmo tempo, a imagem deve criar curiosidade suficiente para
despertar vontade de ler o artigo.

## Direção emocional

A emoção deve ser transmitida principalmente por:

-   situação;
-   expressão facial;
-   olhar;
-   postura corporal;
-   interação entre personagens;
-   ambiente;
-   iluminação;
-   objetos;
-   composição fotográfica.

Não dependa de textos para explicar a história.

## Direção estética

A imagem deve apresentar:

-   fotografia foto-realista;
-   estética cinematográfica/editorial;
-   aparência de fotografia profissional;
-   pessoas brasileiras quando houver personagens e isso for coerente;
-   anatomia natural;
-   pele e textura realistas;
-   expressões humanas sutis e autênticas;
-   iluminação natural ou cinematográfica coerente;
-   profundidade de campo fotográfica;
-   composição sofisticada;
-   ambiente crível;
-   objetos em escala natural;
-   emoção sem teatralidade exagerada.

A imagem **não deve parecer**:

-   banco de imagens genérico;
-   propaganda financeira clichê;
-   ilustração digital;
-   render 3D;
-   montagem;
-   imagem típica de IA.

## Evitar clichês visuais

Evite, salvo quando absolutamente indispensáveis ao contexto real da
cena:

-   dinheiro voando;
-   chuva de notas;
-   correntes;
-   cadeados gigantes;
-   gráficos flutuantes;
-   ícones financeiros;
-   documentos gigantes;
-   CPF gigante;
-   pessoas segurando a cabeça de maneira teatral;
-   expressão exagerada de desespero;
-   executivo genérico olhando gráficos;
-   aperto de mãos corporativo sem contexto;
-   personagens olhando diretamente para a câmera sem razão narrativa.

## Texto dentro da imagem

Não inclua:

-   título do artigo;
-   slogan;
-   headline;
-   legenda;
-   chamada publicitária;
-   logotipo;
-   grandes blocos de texto.

Caso algum texto seja naturalmente necessário à narrativa --- por
exemplo em celular, computador, documento, placa, mensagem ou interface
--- use somente palavras curtas e legíveis.

**Todo texto visível deve obrigatoriamente estar em português do
Brasil.**

Não invente marcas, órgãos públicos ou interfaces oficiais quando isso
não for necessário.

## Composição para WordPress

Gerar em:

``` text
Proporção: 16:9
Tamanho de referência: 1200 × 675 px
```

Pode ser gerada em resolução superior, desde que preserve exatamente a
proporção 16:9.

A composição deve funcionar tanto como:

-   imagem destacada do artigo;
-   card;
-   thumbnail;
-   compartilhamento em redes sociais.

O elemento emocional principal deve permanecer reconhecível quando a
imagem for reduzida.

Evite detalhes essenciais muito pequenos.

## Regra final

Escolha UMA cena.

A cena deve conter:

``` text
1 emoção dominante
1 conflito principal
1 momento narrativo
1 ambiente coerente
1 ou poucos sinais visuais importantes
```

O resultado deve gerar **identificação + emoção + curiosidade**, e não
tentar explicar visualmente todo o artigo.

------------------------------------------------------------------------

# 8. ETAPA 5 --- Geração da imagem

Envie o prompt produzido na Etapa 4 ao modelo de geração de imagens.

Solicite:

``` text
Aspect ratio: 16:9
Orientação: horizontal
Estilo: photorealistic / cinematic editorial photography
```

Quando a API permitir controle de resolução, use uma resolução
compatível com **16:9** e adequada para posterior publicação no
WordPress.

Se o modelo não oferecer exatamente 1200 × 675 px, gere na melhor
resolução 16:9 disponível e faça redimensionamento posterior preservando
a proporção.

------------------------------------------------------------------------

# 9. Critérios de validação antes de aceitar a imagem

Antes de considerar a tarefa concluída, valide mentalmente a imagem
contra estes critérios:

### Relação com o post

-   A cena representa o assunto ou conflito central?
-   Existe conexão perceptível com o título?
-   A imagem evita ser uma representação genérica do produto?

### Relação com a persona

-   O personagem e o contexto parecem pertencer ao universo da persona?
-   A emoção escolhida é coerente com seus medos, desejos ou identidade?
-   A persona poderia se reconhecer naquela situação?

### Força emocional

-   Existe uma emoção principal facilmente percebida?
-   A emoção é natural, e não teatral?
-   A imagem conta uma pequena história?

### Curiosidade

-   Existe algo que faça o observador querer entender o contexto?
-   A imagem não entrega toda a resposta do artigo?

### Qualidade visual

-   Parece fotografia real?
-   Anatomia, mãos, rosto, objetos e perspectiva são naturais?
-   A iluminação é coerente?
-   Não há aparência evidente de imagem gerada por IA?

### Texto

-   Não existe título ou copy sobreposta?
-   Se houver texto incidental, ele está correto e em português do
    Brasil?
-   Não existem palavras aleatórias ou caracteres deformados?

### WordPress

-   Está em 16:9?
-   O assunto principal permanece legível em miniatura?
-   A composição tolera pequenos cortes responsivos nas bordas?

Se a imagem falhar claramente em um critério essencial, regenere
corrigindo especificamente o problema identificado.

------------------------------------------------------------------------

# 10. Princípios de decisão

## Princípio 1 --- O post determina o assunto; a persona determina como senti-lo

A persona não deve substituir o conteúdo do post.

O artigo define **sobre o que** a imagem fala.

A persona ajuda a definir **como aquele assunto é vivido
emocionalmente**.

## Princípio 2 --- Mostrar é melhor que explicar

Prefira:

> uma pessoa vivendo a consequência ou tensão

em vez de:

> símbolos abstratos representando conceitos financeiros.

## Princípio 3 --- Desejo profundo é mais importante que produto

Se a pessoa quer um carro porque busca independência, a imagem deve
considerar a independência e o conflito que a impede --- não apenas
mostrar um carro bonito.

## Princípio 4 --- Emoção específica vence emoção genérica

"Preocupado" é fraco.

"Pai tentando esconder da família a frustração de uma negativa de
crédito" é visualmente específico.

Use a especificidade presente na persona sem inventar acontecimentos.

## Princípio 5 --- Curiosidade exige informação incompleta

A imagem deve sugerir que algo aconteceu ou está prestes a acontecer,
mas não explicar tudo.

## Princípio 6 --- Uma capa não é um infográfico

Não tente colocar na imagem todos os conceitos do artigo.

**Uma imagem = uma ideia dominante.**

------------------------------------------------------------------------

# 11. Resumo operacional para implementação

``` text
INPUT:
- titulo
- post_completo
- persona_completa

PASSO 1:
post_completo + titulo
→ analisar
→ gerar RESUMO_POST

PASSO 2:
persona_completa
→ analisar
→ gerar RESUMO_PERSONA

PASSO 3:
titulo + RESUMO_POST + RESUMO_PERSONA
→ identificar interseção temática/emocional
→ escolher UMA cena

PASSO 4:
montar prompt visual final
→ aplicar regras de fotografia, emoção, texto e composição

PASSO 5:
enviar ao modelo de geração de imagem
→ gerar em 16:9

PASSO 6:
validar:
post + persona + emoção + curiosidade + realismo + português-BR + ausência de texto publicitário + adequação a thumbnail

PASSO 7:
se aprovado → IMAGEM FINAL
se reprovado → corrigir o problema específico e regenerar
```

------------------------------------------------------------------------

# 12. Resultado esperado

A automação recebe somente:

``` text
titulo
post_completo
persona_completa
```

e devolve:

``` text
imagem_final
```

Internamente, porém, deve trabalhar com:

``` text
titulo
   +
post_completo
   ↓
RESUMO_POST

persona_completa
   ↓
RESUMO_PERSONA

titulo + RESUMO_POST + RESUMO_PERSONA
   ↓
DECISÃO VISUAL
   ↓
PROMPT FINAL
   ↓
GERAÇÃO
   ↓
VALIDAÇÃO
   ↓
IMAGEM FINAL
```

O objetivo final não é apenas produzir uma imagem bonita.

O objetivo é produzir uma capa que pareça ter sido **fotografada
especificamente para aquele artigo e para aquela pessoa**.
