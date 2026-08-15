import { Button, Img, Link, Section, Text } from "react-email";
import { DOURADO, NAVY, type RedesSociais } from "./identidade";
import { EmailLayout } from "./layout-base";

// Miolo do e-mail de boas-vindas — cabeçalho, redes sociais e rodapé vêm do layout compartilhado
// (layout-base.tsx, Luiz pediu que virasse padrão pra todo e-mail da ArrudaCred). Voz da Malala
// (primeira pessoa) — pedido de Luiz, 15/08/2026: "não quero nada grande, é um e-mail curto e
// personalizado".

export type EmailBoasVindasProps = {
  nome: string;
  linkWhatsapp: string;
  linkBlog: string;
  tituloBlog: string;
  capaBlog: string;
  linkVideo: string;
  capaVideo: string;
  linkDescadastro: string;
  redesSociais: RedesSociais;
};

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
    <EmailLayout
      previewText={`As informações que te prometi sobre a ArrudaCred, ${nome}`}
      linkWhatsapp={linkWhatsapp}
      redesSociais={redesSociais}
      linkDescadastro={linkDescadastro}
    >
      <Section style={{ padding: "28px 32px 24px" }}>
        <Text style={{ fontSize: 16, lineHeight: "24px", color: "#1a1a1a", margin: "0 0 16px" }}>
          Olá, {nome}! 😊
        </Text>
        <Text style={{ fontSize: 15, lineHeight: "24px", color: "#333333", margin: "0 0 16px" }}>
          Sou a Malala, da ArrudaCred. Eu separei algumas informações da nossa empresa para você
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
                  <Img src={capaVideo} alt="Vídeo de apresentação da ArrudaCred" width={190} height={110} style={{ display: "block", width: "100%", height: "auto", borderRadius: 8 }} />
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
                  <Img src={capaBlog} alt={tituloBlog} width={190} height={110} style={{ display: "block", width: "100%", height: "auto", borderRadius: 8 }} />
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

        <Section style={{ textAlign: "center", margin: "0 0 8px" }}>
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
      </Section>
    </EmailLayout>
  );
}

export default EmailBoasVindas;
