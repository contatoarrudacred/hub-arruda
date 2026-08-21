# Status — Marketing

tarefa: Dois bugs reais de produção resolvidos, os dois já em main. (1) 2 pautas travadas pra sempre em "verificar_links" — a correção de link quebrado chamava gerarConteudo de novo sem teto de tempo, e a geração inicial já vinha consumindo 160-200s dos 240s do tick; corrigido pulando a correção (não o pipeline) quando o orçamento já está curto. (2) Luiz tentou recriar o cronjob no cron-job.org e todo disparo dava "Failed (timeout)" — o plano gratuito do cron-job.org tem teto de 30s de espera, bem menos que os até 240s que uma tentativa real leva. Corrigido restruturando a rota (route.ts) pra responder na hora e processar em background via after() (mesmo padrão já usado nos webhooks de WhatsApp) — dissocia a espera do cliente do tempo real de processamento. 615/615 testes, tsc/eslint limpos.
desde: 2026-08-21T00:00:00-03:00 (achado e corrigido entre ~13:15 e ~16:10)
proxima: Luiz confirma no cron-job.org que o teste manual do job agora dá "Success" rápido (a resposta é imediata agora, não precisa mais de timeout longo) → depois disso as 2 pautas travadas se autorregeneram sozinhas via reclaim (max_tentativas do ArrudaCred é 6, ambas têm folga) → Coordenador mescla em main (já feito por mim, ver commits)
bloqueio: nenhum de código — só falta a confirmação do Luiz de que o cronjob agora dispara com sucesso
turno_fim: 2026-08-21T16:10:00-03:00
