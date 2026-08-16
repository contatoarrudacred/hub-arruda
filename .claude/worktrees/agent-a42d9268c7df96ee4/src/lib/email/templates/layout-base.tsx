import type { ReactNode } from "react";
import { Body, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from "react-email";
import { DOURADO, DOURADO_ESCURO, FUNDO_CABECALHO, ICONES, LOGO_URL, NAVY, type RedesSociais } from "./identidade";

// Layout base compartilhado por todo e-mail da ArrudaCred (Luiz, 15/08/2026: "podemos salvar
// este modelo... padrão para todos e-mails que formos enviar, assim só muda o miolo"). Cuida de
// fundo, tipografia, cabeçalho (logo) e rodapé (redes sociais + dados legais + descadastro) — o
// conteúdo específico de cada e-mail entra via `children`, entre o cabeçalho e o bloco de redes
// sociais.
//
// Fundo da página fora do cartão branco é dourado bem escuro (Luiz pediu — testamos navy antes,
// preferiu dourado escuro). Cabeçalho e rodapé final ficam com fundo navy e fonte clara, usando o
// logo preparado por Luiz especificamente pra fundo escuro.

function IconeRede({ href, src, alt, rotulo }: { href: string; src: string; alt: string; rotulo: string }) {
  return (
    <td style={{ padding: "0 10px", textAlign: "center" }}>
      <Link href={href} style={{ display: "block" }}>
        <Img src={src} alt={alt} width={40} height={40} style={{ display: "block", margin: "0 auto 6px" }} />
        <span style={{ fontSize: 11, color: NAVY }}>{rotulo}</span>
      </Link>
    </td>
  );
}

export type EmailLayoutProps = {
  previewText: string;
  linkWhatsapp: string;
  redesSociais: RedesSociais;
  linkDescadastro: string;
  children: ReactNode;
};

export function EmailLayout({ previewText, linkWhatsapp, redesSociais, linkDescadastro, children }: EmailLayoutProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: DOURADO_ESCURO, margin: 0, padding: "24px 0", fontFamily: "Arial, Helvetica, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", maxWidth: 480, borderRadius: 12, overflow: "hidden" }}>
          <Section style={{ backgroundColor: FUNDO_CABECALHO, padding: "28px 32px", textAlign: "center" }}>
            <Img src={LOGO_URL} alt="ArrudaCred" width={272} style={{ display: "block", margin: "0 auto", maxWidth: "100%" }} />
          </Section>

          {children}

          <Hr style={{ borderColor: "#e5e0d3", margin: 0 }} />

          <Section style={{ padding: "20px 32px", textAlign: "center" }}>
            <Text style={{ fontSize: 13, lineHeight: "20px", color: "#666666", margin: "0 0 12px" }}>
              Quer ficar de olho em promoções, dicas financeiras e cupons de desconto? Acompanha a
              gente:
            </Text>
            <table role="presentation" cellPadding={0} cellSpacing={0} align="center" style={{ margin: "0 auto" }}>
              <tbody>
                <tr>
                  <IconeRede href={redesSociais.site} src={ICONES.site} alt="Site da ArrudaCred" rotulo="Site" />
                  <IconeRede href={linkWhatsapp} src={ICONES.whatsapp} alt="WhatsApp" rotulo="Whatsapp" />
                  <IconeRede href={redesSociais.instagram} src={ICONES.instagram} alt="Instagram" rotulo="Instagram" />
                  <IconeRede href={redesSociais.facebook} src={ICONES.facebook} alt="Facebook" rotulo="Facebook" />
                  <IconeRede href={redesSociais.youtube} src={ICONES.youtube} alt="YouTube" rotulo="Youtube" />
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={{ borderColor: "#e5e0d3", margin: 0 }} />

          <Section style={{ padding: "20px 32px", backgroundColor: NAVY, textAlign: "center" }}>
            <Text style={{ fontSize: 11, lineHeight: "18px", color: "#cfd3dc", margin: "0 0 4px" }}>
              <Link href={redesSociais.site} style={{ color: DOURADO, textDecoration: "underline" }}>
                www.arrudacred.com.br
              </Link>
            </Text>
            <Text style={{ fontSize: 11, lineHeight: "18px", color: "#cfd3dc", margin: "0 0 4px" }}>
              L.H. DE ARRUDA D. DO VALLE SERVICOS LTDA
            </Text>
            <Text style={{ fontSize: 11, lineHeight: "18px", color: "#cfd3dc", margin: "0 0 20px" }}>
              CNPJ: 40.342.851/0001-37
            </Text>
            <Text style={{ fontSize: 11, lineHeight: "18px", color: "#cfd3dc", margin: 0 }}>
              Não quer mais receber nossos e-mails?{" "}
              <Link href={linkDescadastro} style={{ color: DOURADO, textDecoration: "underline" }}>
                Clique aqui para se descadastrar
              </Link>
              .
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export { DOURADO, NAVY };
