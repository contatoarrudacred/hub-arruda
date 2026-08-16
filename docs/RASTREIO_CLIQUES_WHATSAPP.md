# Rastreio de Cliques — zap.arrudacred.com.br
**Status:** Construído em 16/08/2026. Falta só a parte que só Luiz consegue fazer (criar o subdomínio na Hostinger, subir o arquivo, rodar a migration) — ver "Pendências" no fim.
**Objetivo:** saber de onde um lead veio (anúncio, rede social, campanha específica) antes dele mandar a primeira mensagem no WhatsApp — informação que o WhatsApp em si nunca entrega. Resolve de quebra um segundo problema: o link publicado (bio, anúncios) para de depender do número de WhatsApp atual, que pode mudar.

---

## Por que existe

Investigado e confirmado (16/08/2026): a API da Zapster não expõe nenhum dado de origem/UTM/referral na mensagem recebida, em nenhum modo (oficial ou não oficial). Esse dado (`referral` com `source_type`, `source_id`, `ctwa_clid` etc.) existe de verdade no WhatsApp Business Platform oficial da Meta, mas depende de anúncio "Click to WhatsApp" + canal oficial + a Zapster repassar esse campo (não documentado que ela faça isso). Sem controle nosso o suficiente pra confiar nisso agora.

**Solução:** uma página de redirecionamento própria (`zap.arrudacred.com.br`) que fica entre o clique e o WhatsApp — captura o que dá pra capturar de uma página web (isso sim é confiável), salva, e só depois redireciona.

---

## O que a página captura

| Dado | Confiabilidade |
|---|---|
| Parâmetros UTM (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`) | 100% — controlados por nós nos links que divulgamos |
| Referer (de onde veio o clique) | Parcial — navegadores modernos cortam cada vez mais isso por padrão |
| User-Agent (sistema operacional, navegador, dispositivo) | Aproximado |
| IP (pra geolocalização aproximada, cidade/região — não é endereço nem GPS) | Disponível |
| Idioma do navegador | Disponível |
| **Nome, e-mail, telefone, CPF, qualquer dado pessoal direto** | **Não disponível** — navegador nunca expõe isso sem a pessoa preencher um formulário. Decisão de Luiz (16/08/2026): não colocar formulário nessa página — ver "Alternativas descartadas" abaixo |

---

## Como funciona (visão geral)

```
Lead clica no link (bio, anúncio, etc.)
   → zap.arrudacred.com.br?utm_source=instagram&text=Vim...
   → página PHP (Hostinger) captura tudo acima, gera um código curto (ex.: a1b2c3d4)
   → salva no Supabase (cliques_rastreio), com pessoa_id ainda nulo
   → mostra "Você está sendo redirecionado..." por ~1,5s
   → redireciona pro wa.me/<número atual>?text=<texto da campanha> (ref: a1b2c3d4)
Lead manda a mensagem pré-preenchida (a maioria não edita)
   → nosso webhook (Fase 7) recebe a mensagem
   → reconhece "(ref: a1b2c3d4)" no final, tira do texto antes de processar
     (a Malala nunca vê o código como parte da conversa)
   → cria a pessoa/conversa normalmente
   → atualiza cliques_rastreio.pessoa_id = <pessoa recém-criada>
```

**Limitação honesta:** a correlação depende do lead mandar a mensagem pré-preenchida sem apagar o código. Se editar/apagar o `(ref: ...)`, o clique fica salvo mas sem vínculo com nenhuma pessoa — perde o rastreio daquele lead específico, não trava nada.

---

## Onde mora cada peça

- **`hostinger-zap/index.php`** (neste repositório, mas **não faz parte do deploy Vercel** — hospedagem separada, sobe manualmente na Hostinger) — a página em si. Ver `hostinger-zap/README.md` pra instruções de publicação.
- **`cliques_rastreio`** (Supabase, migration `20260816020000_cliques_rastreio.sql`) — um clique por linha: código, referer, UTMs, user-agent, IP, idioma, e `pessoa_id` (nulo até correlacionar).
- **`extrairCodigoRastreio` / `correlacionarCliqueRastreio`** (`src/lib/motor-fluxo/persistencia.ts`) — tira o código do texto recebido e liga o clique à pessoa, chamado direto no webhook (`src/app/api/webhooks/zapster/route.ts`).
- **Número de WhatsApp atual** — a página PHP lê `configuracoes.whatsapp_numero_atendimento` (mesma fonte que o e-mail de boas-vindas já usa) via uma política de RLS nova que libera leitura anônima só dessa chave específica, com um fallback fixo no próprio PHP se a leitura falhar.

---

## Segurança

- A `ANON_KEY` do Supabase embutida no PHP é a mesma chave pública já usada no app Next.js do lado do navegador — não é segredo, é protegida por Row Level Security, não por sigilo.
- RLS de `cliques_rastreio`: **INSERT liberado pra `anon`, sem SELECT/UPDATE/DELETE** — a página só consegue gravar, nunca ler o que já foi salvo (nem o próprio nem de outros cliques). A leitura/atualização de verdade (ligar `pessoa_id`) acontece só pelo nosso backend, com `service_role`.
- RLS de `configuracoes`: nova política libera leitura anônima **só da linha com `chave = 'whatsapp_numero_atendimento'`** — o resto das configurações continua invisível pra quem não está autenticado.

---

## Alternativas descartadas

**Formulário (nome + WhatsApp com máscara + e-mail) antes de redirecionar** — cogitado por Luiz, descartado por dois motivos: (1) o telefone digitado no formulário não é garantido ser o mesmo número de WhatsApp de onde a mensagem realmente vai sair (pode ter mais de um celular, erro de digitação) — o código embutido no `?text=` viaja junto com a mensagem real, então o vínculo é automaticamente com o número certo, sempre; (2) fricção — nome e e-mail o sistema já captura durante a conversa normal (mesma regra de "não pergunta de novo o que já sabe"), duplicar isso antes de chegar no WhatsApp não agrega, só atrasa quem só quer mandar mensagem.

---

## Pendências (ação manual de Luiz)

1. **Rodar a migration** [`20260816020000_cliques_rastreio.sql`](../supabase/migrations/20260816020000_cliques_rastreio.sql) no SQL Editor do Supabase.
2. **Criar o subdomínio `zap.arrudacred.com.br`** no painel da Hostinger, apontando pra uma pasta nova.
3. **Subir `hostinger-zap/index.php`** pra essa pasta (FTP ou gerenciador de arquivos) — ver `hostinger-zap/README.md`.
4. Depois disso, testar acessando `https://zap.arrudacred.com.br/?utm_source=teste&text=Teste` e conferir se: (a) redireciona certo pro WhatsApp, (b) o texto pré-preenchido tem o código no final, (c) uma linha nova aparece em `cliques_rastreio` no Supabase.
