-- ============================================================================
-- MIGRATION 011 — Delay automático por tamanho de mensagem (todos os fluxos)
-- Sistema de Gestão ArrudaCred
--
-- Luiz pediu (15/08/2026) pra percorrer todos os fluxos e ligar um delay que
-- varia com o tamanho de cada mensagem, sempre com "digitando..." ativo — dá
-- um respiro pro lead pensar, proporcional ao que ele vai ler, e nunca repete
-- o mesmo tempo em conversas diferentes (evita "assinatura" de robô).
--
-- Em vez de configurar valor por etapa manualmente (~40 etapas, trabalho
-- repetitivo e sujeito a erro), o cálculo agora é automático no motor
-- (engine.ts, calcularDelayAutomatico) — cada etapa só precisa apontar pra
-- esse modo. Como nenhuma etapa hoje tem "delay"/"digitando" definido
-- explicitamente no conteúdo (todas usam o valor padrão, que o motor já
-- mudou de "nenhum" pra "automatico"), esta migration é redundante com
-- esse novo padrão — mas roda mesmo assim como garantia explícita e
-- documentada, cobrindo qualquer etapa que porventura já tivesse um valor
-- diferente configurado manualmente.
-- ============================================================================

update etapas_fluxo
set conteudo = conteudo
  || jsonb_build_object('delay', jsonb_build_object('tipo', 'automatico'))
  || jsonb_build_object('digitando', true);

-- ============================================================================
-- Fim da migration 011.
-- ============================================================================
