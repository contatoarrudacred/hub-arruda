-- ============================================================================
-- MIGRATION 018 — Contato institucional configurável (WhatsApp + redes sociais)
-- Sistema de Gestão ArrudaCred
--
-- Luiz pediu (15/08/2026) que o número de WhatsApp usado no botão de CTA do
-- e-mail de boas-vindas NÃO fique fixo no código/template — o número
-- conectado à Malala pode mudar. Aproveitado pra também tornar os links de
-- redes sociais configuráveis, já que vão aparecer no mesmo e-mail e em
-- conteúdo de marketing futuro. Editável pela tela /admin/configuracoes já
-- existente — não precisa de tela nova.
--
-- Valor provisório: número e links encontrados no site oficial
-- (arrudacred.com.br) em 15/08/2026. Trocar aqui quando o número real
-- conectado à Malala (Zapster, Fase 7) for diferente do site.
-- ============================================================================

insert into configuracoes (chave, valor, descricao)
values
  (
    'whatsapp_numero_atendimento',
    '"5513974024339"'::jsonb,
    'Número de WhatsApp (com código do país, só dígitos) usado em botões "Chamar no WhatsApp" — e-mails, site, etc. PROVISÓRIO: hoje é o número do site institucional; atualizar quando o número conectado à Malala (Zapster) estiver definido.'
  ),
  (
    'redes_sociais',
    '{"site": "https://www.arrudacred.com.br", "instagram": "https://www.instagram.com/arrudacred.br", "facebook": "https://www.facebook.com/arrudacred.brasil", "youtube": "https://www.youtube.com/@arrudacred"}'::jsonb,
    'Links institucionais (site + redes sociais) usados em e-mails e conteúdo de marketing.'
  )
on conflict do nothing;

-- ============================================================================
-- Fim da migration 018.
-- ============================================================================
