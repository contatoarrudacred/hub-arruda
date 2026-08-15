import { Body, Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from "react-email";

// Layout curto e pessoal, voz da Malala (primeira pessoa) — pedido de Luiz, 15/08/2026: "não
// quero nada grande, é um e-mail curto e personalizado". Identidade navy/dourado do Hub Arruda
// (mesmas cores do admin, sidebar.tsx). HTML de e-mail tem regras próprias (Outlook não entende
// CSS moderno) — por isso estilos inline via objeto `style`, sem classes/Tailwind/flex/grid.
//
// Ícones de rede social (revisão de Luiz, 15/08/2026): a primeira versão usava círculo com
// iniciais (IG/FB/YT) porque o site institucional só tem os ícones como SVG embutido na página,
// não como arquivo reaproveitável. Luiz pediu ícone de verdade — em vez de recortar de uma imagem
// de banco de assets (chegou com marca d'água "Designi" visível, não dava pra usar), os 4 ícones
// de rede social vêm do Simple Icons (simpleicons.org, licença própria pra esse uso — vetor da
// marca colorido via CDN deles), montados sobre quadrado navy arredondado e convertidos pra PNG.
// O quinto (site) é uma seta desenhada à mão (não é ícone de marca de ninguém). Todos hospedados
// no Storage do projeto (bucket midia-fluxo/email/icones/).

const NAVY = "#141e33";
const DOURADO = "#c8a55d";
const FUNDO_CABECALHO = "#f8f1e4"; // dourado bem claro — o logo tem partes pretas que sumiam no fundo navy

const BUCKET_EMAIL = "https://mzvaqjhalynaceecnayt.supabase.co/storage/v1/object/public/midia-fluxo/email";

// Convertido de .webp (único formato disponível no site) pra .png e hospedado no Storage do
// próprio projeto — Outlook desktop não renderiza .webp de forma confiável em e-mail.
const LOGO_URL = `${BUCKET_EMAIL}/logo-arrudacred-horizontal.png`;

const ICONES = {
  site: `${BUCKET_EMAIL}/icones/site.png`,
  whatsapp: `${BUCKET_EMAIL}/icones/whatsapp.png`,
  instagram: `${BUCKET_EMAIL}/icones/instagram.png`,
  facebook: `${BUCKET_EMAIL}/icones/facebook.png`,
  youtube: `${BUCKET_EMAIL}/icones/youtube.png`,
};

export type EmailBoasVindasProps = {
  nome: string;
  linkWhatsapp: string;
  linkBlog: string;
  tituloBlog: string;
  capaBlog: string;
  linkVideo: string;
  capaVideo: string;
  linkDescadastro: string;
  redesSociais: { site: string; instagram: string; facebook: string; youtube: string };
};

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

export function EmailBoasVindas({
  nome,
  linkWhatsapp,
  linkBlog,
  tituloBlog,
  capaBlog,
  linkVideo,
  capaVideo,
  linkDescadastro,
  redesSociais,
}: EmailBoasVindasProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>As informações que te prometi sobre a ArrudaCred, {nome}</Preview>
      <Body style={{ backgroundColor: "#f4f1ea", margin: 0, padding: "24px 0", fontFamily: "Arial, Helvetica, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", maxWidth: 480, borderRadius: 12, overflow: "hidden" }}>
          <Section style={{ backgroundColor: FUNDO_CABECALHO, padding: "20px 32px" }}>
            <Img src={LOGO_URL} alt="ArrudaCred" width={160} style={{ display: "block" }} />
          </Section>

          <Section style={{ padding: "28px 32px 8px" }}>
            <Text style={{ fontSize: 16, lineHeight: "24px", color: "#1a1a1a", margin: "0 0 16px" }}>
              Olá, {nome}! 😊
            </Text>
            <Text style={{ fontSize: 15, lineHeight: "24px", color: "#333333", margin: "0 0 16px" }}>
              Sou a Malala, da ArrudaCred, separei algumas informações da nossa empresa para você
              ver com calma:
            </Text>

            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "0 0 24px" }}>
              <tbody>
                {[
                  "Nota 9,5/10 no Reclame Aqui e 4,9/5 no Google",
                  "Mais de 5.000 clientes atendidos",
                  "Contrato formal de prestação de serviço",
                  "Certificado RA1000 e indicada ao Prêmio Reclame Aqui 2026 (categoria Recuperação de Crédito)",
                ].map((item) => (
                  <tr key={item}>
                    <td style={{ fontSize: 12, lineHeight: "19px", color: "#333333", padding: "2px 0" }}>
                      <span style={{ color: DOURADO, fontWeight: 700 }}>✓ </span>
                      {item}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "0 0 24px" }}>
              <tbody>
                <tr>
                  <td width="48%" valign="top">
                    <Link href={linkVideo} style={{ display: "block", margin: "0 0 6px" }}>
                      <Img src={capaVideo} alt="Vídeo de apresentação da ArrudaCred" width={190} style={{ display: "block", width: "100%", borderRadius: 8 }} />
                    </Link>
                    <Text style={{ fontSize: 12, lineHeight: "17px", color: "#333333", margin: 0 }}>
                      👉{" "}
                      <Link href={linkVideo} style={{ color: NAVY, textDecoration: "underline" }}>
                        Assista o vídeo de apresentação da ArrudaCred
                      </Link>
                    </Text>
                  </td>
                  <td width="4%" style={{ borderLeft: "1px solid #e5e0d3", fontSize: 1, lineHeight: "1px" }}>
                    &nbsp;
                  </td>
                  <td width="48%" valign="top">
                    <Link href={linkBlog} style={{ display: "block", margin: "0 0 6px" }}>
                      <Img src={capaBlog} alt={tituloBlog} width={190} style={{ display: "block", width: "100%", borderRadius: 8 }} />
                    </Link>
                    <Text style={{ fontSize: 12, lineHeight: "17px", color: "#333333", margin: 0 }}>
                      👉 Leia o post:{" "}
                      <Link href={linkBlog} style={{ color: NAVY, textDecoration: "underline" }}>
                        &quot;{tituloBlog}&quot;
                      </Link>
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>

            <Section style={{ textAlign: "center", margin: "0 0 20px" }}>
              <Button
                href={linkWhatsapp}
                style={{
                  backgroundColor: DOURADO,
                  color: NAVY,
                  fontSize: 15,
                  fontWeight: 700,
                  padding: "14px 28px",
                  borderRadius: 999,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                CHAMAR NO WHATSAPP
              </Button>
            </Section>

            <Hr style={{ borderColor: "#e5e0d3", margin: "0 0 20px" }} />

            <Text style={{ fontSize: 13, lineHeight: "20px", color: "#666666", margin: "0 0 12px", textAlign: "center" }}>
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

          <Section style={{ padding: "20px 32px", backgroundColor: "#faf8f3", textAlign: "center" }}>
            <Text style={{ fontSize: 11, lineHeight: "18px", color: "#999999", margin: "0 0 4px" }}>
              <Link href={redesSociais.site} style={{ color: "#999999", textDecoration: "underline" }}>
                www.arrudacred.com.br
              </Link>
            </Text>
            <Text style={{ fontSize: 11, lineHeight: "18px", color: "#999999", margin: "0 0 4px" }}>
              L.H. DE ARRUDA D. DO VALLE SERVICOS LTDA
            </Text>
            <Text style={{ fontSize: 11, lineHeight: "18px", color: "#999999", margin: "0 0 20px" }}>
              CNPJ: 40.342.851/0001-37
            </Text>
            <Text style={{ fontSize: 11, lineHeight: "18px", color: "#999999", margin: 0 }}>
              Não quer mais receber nossos e-mails?{" "}
              <Link href={linkDescadastro} style={{ color: "#999999", textDecoration: "underline" }}>
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

export default EmailBoasVindas;
