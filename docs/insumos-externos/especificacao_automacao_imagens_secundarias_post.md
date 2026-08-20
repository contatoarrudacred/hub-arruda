# Especificação de Automação --- Imagens Secundárias Informativas para Posts

## 1. Objetivo

Este documento define o fluxo que o LLM deve executar para decidir **se
um post realmente merece imagens secundárias** e, somente quando houver
ganho editorial concreto, gerar até **3 imagens internas informativas**.

As imagens secundárias NÃO existem para decorar, quebrar blocos de texto
ou simplesmente deixar o artigo mais bonito.

Elas só devem ser geradas quando forem capazes de:

-   ensinar;
-   esclarecer;
-   organizar;
-   comparar;
-   resumir;
-   demonstrar uma relação;
-   explicar uma sequência;
-   tornar uma informação complexa significativamente mais fácil de
    compreender.

Um post pode receber **3, 2, 1 ou nenhuma imagem secundária**.

**ZERO imagens é uma resposta válida e desejável quando não houver
oportunidade realmente útil.**

------------------------------------------------------------------------

# 2. Entrada disponível

O processo recebe:

``` text
TITULO_POST = {{titulo}}
POST_COMPLETO = {{post_completo}}
```

A persona não é necessária neste fluxo. A função destas imagens é
**informativa/editorial**, enquanto a imagem de capa possui função
emocional e de identificação.

------------------------------------------------------------------------

# 3. Fluxo obrigatório

``` text
TÍTULO + POST COMPLETO
        ↓
ETAPA 1 — Ler e compreender o artigo inteiro
        ↓
ETAPA 2 — Procurar oportunidades VISUAIS realmente úteis
        ↓
ETAPA 3 — Aplicar filtro de utilidade
        ↓
0 a 3 OPORTUNIDADES APROVADAS
        ↓
Para cada oportunidade:
TRECHO-FONTE INTEGRAL + TIPO VISUAL + ORIENTAÇÃO
        ↓
ETAPA 4 — Planejar a representação
        ↓
ETAPA 5 — Conferir fidelidade ao trecho-fonte
        ↓
ETAPA 6 — Gerar imagem
        ↓
ETAPA 7 — Validar
```

------------------------------------------------------------------------

# 4. PROMPT 1 --- Identificação de oportunidades de imagens secundárias

## Prompt

Você é um editor-chefe, especialista em comunicação visual, arquitetura
da informação, UX editorial, SEO e produção de conteúdo didático.

Sua tarefa é ler integralmente o artigo abaixo e identificar **no máximo
3 oportunidades realmente fortes** para criar imagens secundárias
informativas dentro do post.

### Entrada

``` text
TÍTULO DO POST:
{{titulo}}

POST COMPLETO:
{{post_completo}}
```

## PRINCÍPIO MAIS IMPORTANTE

Não procure imagens para "decorar" o artigo.

Uma imagem só deve ser recomendada quando transformar informação textual
em uma representação visual que ofereça **ganho real de compreensão**.

As seguintes justificativas NÃO são suficientes:

-   deixar o post mais bonito;
-   quebrar um bloco grande de texto;
-   gerar engajamento visual;
-   ilustrar genericamente o assunto;
-   mostrar uma pessoa relacionada ao tema;
-   repetir visualmente algo que já é extremamente simples de entender
    em texto;
-   preencher espaço;
-   aumentar artificialmente a quantidade de mídia da página.

Se nenhuma oportunidade passar pelo filtro de utilidade, retorne **ZERO
imagens**.

------------------------------------------------------------------------

## O que procurar

Procure especialmente trechos contendo:

-   processos ou sequências;
-   etapas;
-   relações de causa e efeito;
-   comparações;
-   diferenças entre conceitos;
-   classificações;
-   listas que ganhariam clareza visual;
-   hierarquias;
-   caminhos possíveis;
-   cenários;
-   erros versus condutas adequadas;
-   relações entre sistemas ou conceitos;
-   cronologias;
-   dados;
-   números;
-   percentuais;
-   tabelas;
-   critérios;
-   estruturas;
-   decisões;
-   perguntas e respostas que possam ser organizadas visualmente;
-   conceitos abstratos que o próprio texto explique suficientemente
    para serem representados sem adicionar informação externa.

------------------------------------------------------------------------

# 5. Tipos visuais possíveis

Escolha livremente o formato mais adequado ao conteúdo.

Exemplos:

### Infográfico simples

Para organizar poucos conceitos relacionados.

### Fluxograma

Para processos, caminhos, decisões ou sequências.

### Esquema visual

Para demonstrar relações entre conceitos.

### Comparativo visual

Para diferenças entre duas ou mais situações.

### Linha do tempo

Para acontecimentos ou etapas cronológicas.

### Diagrama

Para relações estruturais, hierárquicas ou funcionais.

### Passo a passo visual

Para procedimentos descritos no artigo.

### Quadro-resumo

Para sintetizar informação importante e relativamente estruturada.

### Mapa conceitual

Para mostrar como conceitos se conectam.

### Visualização de dados

Somente quando o trecho-fonte contiver os números/dados necessários.

### Outro formato

Pode escolher outro formato quando for claramente superior aos
anteriores. Explique brevemente a escolha.

------------------------------------------------------------------------

# 6. Filtro obrigatório de utilidade

Para cada oportunidade candidata, atribua notas de **0 a 10** para:

### A. Ganho de compreensão

A imagem fará o leitor entender melhor do que somente lendo o texto?

### B. Densidade informacional

Existe informação suficiente para justificar uma representação visual?

### C. Adequação visual

A informação possui estrutura que realmente pode ser comunicada
visualmente?

### D. Relevância para o argumento

O trecho é importante para a compreensão do artigo ou é apenas detalhe
secundário?

Calcule:

``` text
NOTA_TOTAL = A + B + C + D
```

Máximo: 40 pontos.

## Critério de aprovação

Uma oportunidade só pode ser aprovada quando:

``` text
NOTA_TOTAL >= 30
```

E, adicionalmente:

``` text
GANHO_DE_COMPREENSÃO >= 8
```

Se não atingir esses dois critérios, descarte.

**Não reduza o rigor para conseguir chegar a 3 imagens.**

Quantidade não é objetivo.

Qualidade editorial é o objetivo.

------------------------------------------------------------------------

# 7. Regras para seleção final

-   Máximo de 3 oportunidades.
-   Não selecionar duas imagens que ensinem essencialmente a mesma
    coisa.
-   Distribuir as imagens em partes diferentes do artigo quando isso
    ocorrer naturalmente.
-   Não selecionar um trecho apenas porque contém uma lista.
-   Não criar visualização de dados sem dados presentes no texto.
-   Não adicionar estatísticas, números, leis, prazos, conceitos ou
    informações externas.
-   Não usar conhecimento próprio para "melhorar" o conteúdo.
-   O artigo é a única fonte factual para a futura imagem.
-   Se houver dúvida sobre a fidelidade de uma informação, não a
    transforme em afirmação visual.
-   Não recomendar uma imagem meramente emocional/fotográfica; essa
    função pertence à capa do post.

------------------------------------------------------------------------

# 8. Trecho-fonte obrigatório

Para cada oportunidade aprovada, extraia do artigo o **TRECHO-FONTE
INTEGRAL necessário para produzir aquela imagem**.

O trecho-fonte deve:

-   conter todas as informações que poderão aparecer na imagem;
-   preservar o significado original;
-   possuir contexto suficiente para evitar interpretação equivocada;
-   não ser resumido de forma que elimine qualificações importantes;
-   não incluir grandes partes irrelevantes do artigo.

A futura IA de imagem deverá receber esse trecho como um **universo
factual fechado**.

------------------------------------------------------------------------

# 9. Saída obrigatória do Prompt 1

Retorne primeiro:

``` text
QUANTIDADE_DE_IMAGENS: 0 | 1 | 2 | 3
```

Se for `0`, retorne:

``` text
JUSTIFICATIVA:
Não foram identificadas oportunidades com ganho visual suficiente para justificar imagens secundárias.
```

e encerre.

Se houver oportunidades, retorne para cada uma:

``` text
IMAGEM_1

TIPO_VISUAL:
[infográfico simples / fluxograma / esquema visual / comparativo / linha do tempo / diagrama / passo a passo / quadro-resumo / mapa conceitual / visualização de dados / outro]

OBJETIVO_DIDÁTICO:
[em uma frase: o que esta imagem fará o leitor compreender melhor]

TÍTULO_SUGERIDO_DA_IMAGEM:
[título curto, informativo e estritamente sustentado pelo trecho]

TRECHO_FONTE_INTEGRAL:
[cole exatamente a parte necessária do post]

INFORMAÇÕES_QUE_PODEM_APARECER:
[lista fechada contendo somente fatos/conceitos presentes no trecho-fonte]

ESTRUTURA_VISUAL_SUGERIDA:
[como organizar visualmente a informação, sem inventar conteúdo]

POSIÇÃO_SUGERIDA:
[depois de qual seção, subtítulo ou trecho do artigo]

GANHO_DE_COMPREENSÃO: X/10
DENSIDADE_INFORMACIONAL: X/10
ADEQUAÇÃO_VISUAL: X/10
RELEVÂNCIA_PARA_O_ARGUMENTO: X/10
NOTA_TOTAL: XX/40

JUSTIFICATIVA_DA_APROVAÇÃO:
[uma frase objetiva explicando por que esta imagem merece existir]
```

Repita para IMAGEM_2 e IMAGEM_3 somente quando aprovadas.

------------------------------------------------------------------------

# 10. PROMPT 2 --- Geração da imagem secundária

Este prompt é executado individualmente para cada oportunidade aprovada
pelo Prompt 1.

## Entradas

``` text
TIPO_VISUAL = {{tipo_visual}}
TITULO_IMAGEM = {{titulo_imagem}}
OBJETIVO_DIDATICO = {{objetivo_didatico}}
TRECHO_FONTE_INTEGRAL = {{trecho_fonte_integral}}
INFORMACOES_PERMITIDAS = {{informacoes_que_podem_aparecer}}
ESTRUTURA_VISUAL_SUGERIDA = {{estrutura_visual_sugerida}}
```

## Prompt

Você é um diretor de arte editorial, designer de informação e
especialista em comunicação visual didática.

Sua tarefa é criar UMA imagem informativa para complementar um artigo.

A imagem deve **ilustrar e organizar exclusivamente informações já
presentes no trecho-fonte fornecido**.

Você NÃO está autorizado a completar, corrigir, ampliar ou enriquecer
factual ou conceitualmente o conteúdo com conhecimento próprio.

------------------------------------------------------------------------

## Material recebido

### Tipo de representação visual

``` text
{{tipo_visual}}
```

### Título da imagem

``` text
{{titulo_imagem}}
```

### Objetivo didático

``` text
{{objetivo_didatico}}
```

### Trecho-fonte integral do artigo

``` text
{{trecho_fonte_integral}}
```

### Informações autorizadas

``` text
{{informacoes_que_podem_aparecer}}
```

### Estrutura visual sugerida

``` text
{{estrutura_visual_sugerida}}
```

------------------------------------------------------------------------

# 11. REGRA DE FONTE FECHADA

Considere o `TRECHO_FONTE_INTEGRAL` e as `INFORMACOES_AUTORIZADAS` como
um **banco fechado de informações**.

Você pode:

-   resumir visualmente;
-   organizar;
-   agrupar;
-   hierarquizar;
-   conectar;
-   representar;
-   transformar texto em elementos gráficos;
-   reduzir frases mantendo integralmente o significado.

Você NÃO pode:

-   acrescentar fatos;
-   acrescentar números;
-   acrescentar percentuais;
-   acrescentar prazos;
-   acrescentar leis;
-   acrescentar recomendações;
-   acrescentar causas;
-   acrescentar consequências;
-   acrescentar exceções;
-   acrescentar exemplos não fornecidos;
-   acrescentar opinião própria;
-   usar conhecimento geral;
-   usar conhecimento externo;
-   inferir uma afirmação que o texto não faça;
-   transformar possibilidade em certeza;
-   transformar opinião do artigo em fato;
-   remover ressalvas que mudem o sentido;
-   inventar fontes.

Mesmo que você saiba que uma informação adicional é verdadeira, **não a
utilize**.

------------------------------------------------------------------------

# 12. Protocolo anti-alucinação

ANTES DE GERAR A IMAGEM, faça internamente estas verificações:

1.  Qual é exatamente a mensagem que a imagem precisa ensinar?
2.  Quais informações do trecho-fonte serão representadas?
3.  Cada frase, número, relação, seta, categoria ou conclusão está
    explicitamente sustentada pelo trecho?
4.  Algum elemento visual pode induzir uma conclusão que o texto não
    afirma?
5.  Alguma informação foi acrescentada apenas porque parece lógica?
6.  Alguma simplificação alterou o significado original?
7.  O título da imagem está sustentado pelo trecho?
8.  Existe informação suficiente para gerar a imagem sem preencher
    lacunas por conta própria?

Se qualquer informação não estiver sustentada, remova-a.

Se o trecho não for suficiente para construir a imagem com segurança,
**não improvise**.

Somente crie a imagem depois de ter certeza sobre:

``` text
O QUE MOSTRAR
+
COMO ORGANIZAR
+
QUAIS INFORMAÇÕES SÃO PERMITIDAS
+
QUAIS INFORMAÇÕES NÃO PODEM SER INVENTADAS
```

------------------------------------------------------------------------

# 13. Direção visual

A imagem deve ser:

-   clean;
-   moderna;
-   amigável;
-   atrativa;
-   instrutiva;
-   didática;
-   fácil de compreender;
-   visualmente profissional;
-   editorial;
-   organizada;
-   adequada a um artigo de blog;
-   compreensível rapidamente.

Você pode surpreender criativamente na composição, desde que **a
criatividade esteja no design e não na invenção de conteúdo**.

Use:

-   boa hierarquia visual;
-   espaçamento generoso;
-   poucos elementos por área;
-   ícones simples quando úteis;
-   formas e conectores claros;
-   tipografia altamente legível;
-   agrupamento lógico;
-   contraste suficiente;
-   leitura intuitiva.

Evite aparência:

-   infantil;
-   excessivamente corporativa;
-   poluída;
-   sensacionalista;
-   de apresentação PowerPoint genérica;
-   de propaganda;
-   de template barato;
-   de imagem típica de IA.

------------------------------------------------------------------------

# 14. Título e layout

A imagem deve possuir um título curto.

### Posição preferencial

O título deve ficar na **região superior direita** da composição.

Ele deve:

-   ser legível;
-   ter destaque suficiente;
-   não dominar excessivamente a imagem;
-   descrever corretamente o conteúdo;
-   estar em português do Brasil.

Organize o restante da composição de acordo com o tipo visual
solicitado.

------------------------------------------------------------------------

# 15. Idioma e textos

Todo texto visível deve estar em **português do Brasil**.

Revise cuidadosamente:

-   ortografia;
-   acentuação;
-   números;
-   sinais;
-   concordância;
-   palavras truncadas.

Não crie textos decorativos aleatórios.

Não utilize palavras em inglês quando houver equivalente natural em
português, exceto quando o próprio trecho-fonte utilizar o termo.

------------------------------------------------------------------------

# 16. Fontes e autoria

Não invente fontes bibliográficas.

Se o trecho-fonte mencionar explicitamente uma fonte e ela for
necessária à imagem, ela pode ser reproduzida fielmente.

Caso contrário, não inclua "Fonte:".

Não inclua por padrão frases como:

``` text
Conteúdo gerado por IA — Pode conter erros
```

A imagem deve ser tratada como material editorial cuja informação deriva
exclusivamente do artigo fornecido.

------------------------------------------------------------------------

# 17. Formato da imagem

Preferir composição horizontal adequada ao corpo de um artigo.

``` text
Proporção preferencial: 16:9
Orientação: horizontal
```

O conteúdo principal deve permanecer legível em desktop e mobile.

Não coloque informações essenciais excessivamente próximas às bordas.

------------------------------------------------------------------------

# 18. Validação obrigatória após a geração

Antes de aceitar a imagem, confira:

### Fidelidade

-   Todas as informações aparecem no trecho-fonte?
-   Nenhum dado foi inventado?
-   Nenhuma relação causal foi criada sem suporte?
-   Nenhuma ressalva importante desapareceu?

### Didática

-   A imagem realmente torna o conteúdo mais fácil de entender?
-   A organização visual é superior a simplesmente repetir um parágrafo?
-   A leitura possui sequência clara?

### Texto

-   Todo texto está em português-BR?
-   Ortografia e números estão corretos?
-   Não há caracteres deformados ou palavras sem sentido?

### Design

-   Está clean?
-   O título está na região superior direita?
-   A hierarquia está clara?
-   Há espaço suficiente entre elementos?
-   É agradável e profissional?

### Necessidade

Faça uma última pergunta:

> "Esta imagem realmente ajuda o leitor a compreender o artigo?"

Se a resposta for não, descarte a imagem.

------------------------------------------------------------------------

# 19. Regra editorial geral

A capa e as imagens secundárias possuem funções diferentes:

``` text
CAPA
→ emoção
→ identificação
→ curiosidade
→ clique/leitura

IMAGENS SECUNDÁRIAS
→ compreensão
→ organização
→ explicação
→ aprendizado
→ utilidade editorial
```

Não use imagens secundárias para repetir a função emocional da capa.

------------------------------------------------------------------------

# 20. Resumo operacional para implementação

``` text
INPUT
- titulo
- post_completo

↓ PROMPT 1

LER POST COMPLETO

↓
IDENTIFICAR CANDIDATAS VISUAIS

↓
PONTUAR CADA CANDIDATA

APROVAR SOMENTE SE:
nota_total >= 30/40
E
ganho_de_compreensão >= 8/10

↓
SE NENHUMA:
quantidade = 0
ENCERRAR

↓
SE HOUVER:
selecionar no máximo 3

↓
PARA CADA IMAGEM:
- tipo_visual
- objetivo_didatico
- titulo_imagem
- trecho_fonte_integral
- informações permitidas
- estrutura visual
- posição no post

↓ PROMPT 2

TRATAR TRECHO-FONTE COMO BANCO FECHADO

↓
PLANEJAR INTERNAMENTE

↓
VERIFICAR RISCO DE ALUCINAÇÃO

↓
GERAR SOMENTE COM INFORMAÇÕES AUTORIZADAS

↓
VALIDAR FIDELIDADE + DIDÁTICA + TEXTO + DESIGN

↓
IMAGEM SECUNDÁRIA FINAL
```

------------------------------------------------------------------------

# 21. Resultado esperado

O sistema deve ser capaz de receber um artigo e concluir autonomamente:

``` text
"Este artigo não precisa de nenhuma imagem secundária."
```

ou:

``` text
"Este artigo possui 1 oportunidade visual realmente útil."
```

ou:

``` text
"Este artigo possui 2 oportunidades visuais realmente úteis."
```

ou, no máximo:

``` text
"Este artigo possui 3 oportunidades visuais realmente úteis."
```

A meta NÃO é gerar imagens.

A meta é gerar **somente imagens que mereçam existir**.

Cada imagem aprovada deve transformar uma parte relevante do artigo em
uma representação visual mais fácil de compreender, sem acrescentar uma
única informação factual que não esteja sustentada pelo texto original.
