-- ============================================================================
-- MIGRATION 014 — Link do Reclame Aqui nas objeções de reputação
-- Sistema de Gestão ArrudaCred
--
-- Luiz pediu (15/08/2026) que a Malala seja mais proativa nas objeções de
-- reputação: em vez de só sugerir "pesquise no Google/Reclame Aqui", passar
-- o link direto do perfil da ArrudaCred no Reclame Aqui (não existe link de
-- Google pra compartilhar — a pessoa pesquisa por conta própria). Regra
-- geral registrada em PERSONA_MALALA_PROMPT_SISTEMA.md: link sempre no
-- final da mensagem — por isso ele entra depois da pergunta de fechamento,
-- não no meio do texto.
--
-- UPDATE (não re-INSERT) porque essas linhas já foram inseridas pela
-- migration 010 (20260815100000_banco_objecoes_v2_dados.sql) e já podem
-- estar em produção — a migration original fica intacta como registro
-- histórico do que foi carregado.
--
-- Escopo: só a categoria B (Reputação/Reclame Aqui) do banco de objeções,
-- que são as duas que citam Reclame Aqui como algo a se verificar. A
-- categoria A (medo/confiança) também menciona Reclame Aqui em vários
-- itens, mas não foi incluída aqui — decisão de escopo, não esquecimento.
-- ============================================================================

update objecoes
set como_lidar = $c$"E eu acho ótimo você ter pesquisado. Eu faria exatamente a mesma coisa.
Só sugiro analisar o conjunto, e não simplesmente se existem reclamações.
Veja nossa nota, como respondemos, como tratamos os problemas e coloque a quantidade de reclamações em perspectiva com o volume de clientes atendidos.
Hoje temos nota 9,5/10 no Reclame Aqui e 4,9/5 no Google.
👉 Teve alguma reclamação específica que realmente te preocupou? Me diga qual foi e eu tento esclarecer.
📌 Nosso perfil no Reclame Aqui: https://www.reclameaqui.com.br/empresa/arrudacred/"$c$
where objecao = $o$Vi reclamações de vocês no Reclame Aqui e fiquei com medo.$o$;

update objecoes
set como_lidar = $c$"É justo questionar.
Então não baseie sua decisão apenas nas avaliações.
Cruze as informações: Google, Reclame Aqui, CNPJ, site, redes sociais, contrato, histórico e a própria qualidade das respostas que você está recebendo aqui.
Não existe um único indicador que você precise aceitar cegamente.
📌 Nosso perfil no Reclame Aqui: https://www.reclameaqui.com.br/empresa/arrudacred/"$c$
where objecao = $o$Não confio nessas avaliações.$o$;
