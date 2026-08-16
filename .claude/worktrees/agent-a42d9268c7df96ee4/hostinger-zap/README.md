# zap.arrudacred.com.br

Página de redirecionamento inteligente pro WhatsApp da Malala — captura dados do clique (referer, UTM, dispositivo) antes de mandar a pessoa pro WhatsApp de verdade. Ver `docs/RASTREIO_CLIQUES_WHATSAPP.md` no repositório principal pro desenho completo.

**Não faz parte do app Next.js/Vercel** — hospedagem separada, na Hostinger, fora do pipeline de deploy do projeto. Só um arquivo PHP, sem dependências, sem build.

## Como publicar

1. No painel da Hostinger, crie o subdomínio `zap.arrudacred.com.br` apontando pra uma pasta nova (ex.: `zap/`).
2. Suba o arquivo `index.php` pra essa pasta (FTP ou gerenciador de arquivos do hPanel).
3. Pronto — acessar `https://zap.arrudacred.com.br/` já funciona.

## Como usar o link em campanhas

```
https://zap.arrudacred.com.br/?utm_source=instagram&utm_medium=bio&text=Vim%20do%20Instagram%20e%20quero%20saber%20mais%20sobre%20limpar%20meu%20nome
```

- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` — todos opcionais, ficam salvos junto com o clique.
- `text` — opcional, texto que já chega pré-preenchido na conversa do WhatsApp (a página adiciona o código de rastreio no final automaticamente). Sem `text`, usa só "Olá!" + o código.

## Se o número de WhatsApp mudar

Não precisa editar este arquivo nem republicar nada — o número é lido do Supabase (`configuracoes.whatsapp_numero_atendimento`, o mesmo valor editável em `/admin/configuracoes` no painel). Só existe um fallback fixo no código (`WHATSAPP_NUMERO_FALLBACK`), usado só se a leitura do Supabase falhar — vale atualizar esse valor de vez em quando pra ele não ficar muito desatualizado, mas não é crítico.
