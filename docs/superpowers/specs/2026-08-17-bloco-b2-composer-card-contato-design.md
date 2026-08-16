# Bloco B2 — Composer estilo WhatsApp Web + Card de contato redesenhado — Design

**Status:** Validado com Luiz em 17/08/2026, várias rodadas de preview visual (mockup via `mcp__visualize`, não salvo em arquivo — este documento é o registro final). Ainda não implementado. Entra entre o Bloco B (concluído) e o Bloco C (Fase 5 — IA) na ordem de construção.

**Como chegou aqui:** depois de fechar o Bloco B, Luiz mandou prints do composer do WhatsApp Web real e uma lista de 7 pontos sentidos falta na Tela de Atendimento. Investigação cruzou cada ponto contra `TELA_ATENDIMENTO_ARRUDACRED.md` e o código atual (ver histórico da conversa de 17/08/2026 — não duplicado aqui). Confirmação de leitura e foto do contato já estavam registradas no Bloco D; os outros 5 pontos (emoji/menu de anexo/mic no composer, altura dinâmica do campo, contador numérico de não lidas, data+hora, bloquear/fixar/favoritar contato) eram novos. O redesenho do card de contato (abaixo) nasceu de uma rodada extra de iteração visual em cima do card da Ana Souza.

---

## 1. Card de contato (lista de contatos) — desenho final

Estrutura: avatar à esquerda cobrindo 2 linhas "estilo chat" (nome+hora, mensagem+status) coladas nele, com 2 linhas de badges cheias (não indentadas) abaixo.

```
┌──────────────────────────────────────────────────────┐
│ ⬤   Nome (negrito só se não lida) telefone     hora   │
│ A   mensagem (peso normal, truncada)         ✓✓  🟢3  │
│                                                        │
│ 👤 Malala   📋 Triagem                                │
│ 🏷 Limpa Nome   💲 R$ 7.680                        ⋮  │
└──────────────────────────────────────────────────────┘
```

**Avatar:**
- Círculo com foto do contato se existir (Bloco D — histórico de fotos, `TELA_ATENDIMENTO_ARRUDACRED.md` seção 4), senão inicial do nome.
- Anel colorido ao redor = cor de quem está no controle agora (mesma paleta de `cores-atendimento.ts`: Malala roxo, não atribuída verde, atendente = `cor_badge` dele). Substitui o badge de texto "Malala"/nome do atendente que existia solto antes — a cor já carrega essa informação junto com os badges de atribuição abaixo (redundância proposital: cor no avatar + badge com texto, pra não depender só de cor pra quem tem dificuldade de percepção de cor).
- Quando o nome do lead ainda não é conhecido, mostra ícone de telefone no lugar da inicial.
- Estrela no canto superior esquerdo do avatar quando a conversa está favoritada.

**Linha 1 (nome + hora):**
- Nome do lead. **Negrito (peso 500) só quando a última mensagem não foi lida; peso normal quando já lida** — mesma lógica do WhatsApp real.
- Se o nome ainda não é conhecido: telefone ocupa o lugar do nome (mesma regra de negrito acima).
- Se o nome é conhecido: telefone aparece pequeno e acinzentado ao lado do nome.
- Hora no canto direito: só hora quando a mensagem é de hoje (`HH:MM`); **"DD/MM - HH:MM"** (hífen, data à esquerda da hora, mesma linha) quando é de outro dia.

**Linha 2 (mensagem + status), colada na linha 1:**
- Prévia da última mensagem, truncada com reticências, **peso normal sempre** (nunca em negrito, nem quando não lida — só o nome fica em negrito).
- Confirmação de entrega/leitura à direita da prévia — só em mensagens nossas (Malala/humano), nunca nas do lead: ✓ cinza (enviado), ✓✓ cinza (entregue), ✓✓ azul (lido). Resolve a pendência "confirmação de leitura" já registrada no Bloco D.
- Contador de não lidas: bolinha verde com **número em fonte maior e branca** (não é mais só um ponto) — só aparece quando há mensagem não lida do lead.

**Linhas 3-4 (badges, largura cheia, começando na borda esquerda do card — não indentadas pelo avatar):**
- Linha 3: atribuição (ícone pessoa + nome de quem controla, cor da paleta de cores) + etapa do Kanban (ícone lista + subetapa, cor âmbar).
- Linha 4: produto (ícone tag + **nome reduzido**, cor azul — só quando há oportunidade ativa) + valor da oportunidade (ícone cifrão, texto simples sem fundo colorido — só quando há oportunidade ativa) + "⋮" de ações rápidas, alinhado à direita.

**Favoritar:** decisão final — só existe "favoritar" (estrela), não tem "fixar" como ação separada. Favoritar já sobe a conversa pro topo da lista automaticamente.

### Dependências de dados novas (nada disto existe hoje)
- `produtos.nome_reduzido` (nova coluna) — nome curto pro espaço apertado do card, ex. "Limpa Nome" em vez de "Limpeza de Nome (CPF/CNPJ) — Serasa/SPC". Editável no cadastro do produto.
- `oportunidades.valor_estimado` já existe, mas a view/consulta da **lista** de conversas (`conversas_resumo` → `ConversaResumo`) não expõe hoje — só `ConversaDetalhe` (conversa já aberta) tem esse campo. Precisa entrar na consulta da lista.
- Contador real de não lidas — hoje `naoLida` é booleano ("última mensagem é do lead"), não uma contagem. Precisa de modelo novo (provavelmente rastrear por atendente até onde cada um leu, não só "última mensagem geral").
- Status de entrega/leitura em `mensagens` (campo novo) — depende de a Zapster expor esse evento via webhook (não confirmado ainda se ela manda).
- `conversas.favorita` (ou tabela separada, se decidirmos que favorito é por atendente e não global pra conversa — a confirmar na hora de implementar).
- Ícones dos badges (pessoa/lista/tag/cifrão) são só apoio visual, não modelo de dados.

---

## 2. Composer estilo WhatsApp Web

Luiz mandou print do composer real do WhatsApp Web como referência: `+` de anexo à esquerda (abre menu flutuante nativo com Documento/Fotos e vídeos/Câmera/Áudio/Contato/Enquete/Evento/Nova figurinha/Pix/Catálogo/Resposta rápida/Cobrar), emoji, campo de texto, microfone à direita.

**Mudanças no nosso composer (hoje: barra de atalhos fixa em cima + linha de input embaixo, Fase 9 do Bloco B):**
- Acrescentar ícone de **emoji** (esquecido no Bloco B, nunca desenhado).
- Ícone **"+"** de anexo à esquerda do campo, abrindo um menu flutuante (hoje `📎 Anexo` é um botão solto "em breve" na barra de cima).
- Ícone de **microfone** posicionado do lado do campo de texto (hoje `🎤 Áudio` é um botão solto na barra de cima).
- Agrupar os atalhos próprios (⚡ Próxima etapa, 💬 Respostas prontas, 📅 Agendar) num ícone único de **"Ações"** que abre menu flutuante, em vez de botões soltos.
- **Campo de texto com altura dinâmica**: começa numa linha, cresce até ~10 linhas conforme o atendente digita (empurrando a timeline da conversa pra cima), vira scroll interno depois de 10 linhas.

**Mapeamento de viabilidade do menu de anexo nativo (12 opções) contra a Zapster (`src/lib/whatsapp/zapster.ts` + `src/lib/whatsapp/enviar.ts`):**
- **Já funciona hoje:** Documento, Fotos e vídeos, Câmera, Áudio (todos via `enviarMensagemMidia`).
- **Modelado no nosso `MensagemEtapa` mas adaptador não envia ainda (erro explícito em `enviar.ts`):** Contato, Pix.
- **Provavelmente sem equivalente numa API de BSP genérica** (recursos nativos do WhatsApp Business, não confirmado com a doc da Zapster): Enquete, Evento, Nova figurinha, Catálogo, Cobrar.
- **Não é chamada de API, é feature nossa:** "Resposta rápida" do menu nativo mapeia direto pra Respostas Prontas (Fase 6 do Bloco B, já construída).

---

## 3. Fora de escopo desta rodada (não esquecer)
- Bloquear/desbloquear contato no WhatsApp — dependeria de endpoint da Zapster que não foi confirmado que existe; não entrou nesta rodada de design (só favoritar).
- Foto do contato em si (upload/histórico) — já registrada no Bloco D, o card acima só prevê o *espaço* pra foto, não a captura/histórico dela.
- Layout de 3 colunas redimensionável (pendência de UX já registrada separadamente, 16/08/2026) — este documento não mexe nisso, só no conteúdo interno do card e do composer.

---

## 4. Ordem de construção sugerida (a validar antes de começar)
1. Migrations: `produtos.nome_reduzido`, `conversas.favorita`, contador real de não lidas (desenho de schema a fazer), status de entrega em `mensagens`.
2. Card de contato redesenhado (avatar, negrito condicional, hora/data, badges reorganizados, favoritar).
3. Composer: emoji, altura dinâmica, agrupar "Ações".
4. Composer: menu "+" de anexo (só os tipos já viáveis: documento/foto/vídeo/câmera/áudio).
5. Confirmação de entrega/leitura (depende de confirmar suporte da Zapster primeiro).
