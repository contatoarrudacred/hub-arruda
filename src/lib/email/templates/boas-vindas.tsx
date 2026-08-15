import { Body, Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from "react-email";

// Layout curto e pessoal, voz da Malala (primeira pessoa) — pedido de Luiz, 15/08/2026: "não
// quero nada grande, é um e-mail curto e personalizado". Identidade navy/dourado do Hub Arruda
// (mesmas cores do admin, sidebar.tsx). HTML de e-mail tem regras próprias (Outlook não entende
// CSS moderno) — por isso estilos inline via objeto `style`, sem classes/Tailwind/flex/grid.

const NAVY = "#141e33";
const DOURADO = "#c8a55d";

const LOGO_URL = "https://arrudacred.com.br/wp-content/uploads/2024/07/logo_arrudacred_horizontal-1-scaled.webp";

export type EmailBoasVindasProps = {
  nome: string;
  linkWhatsapp: string;
  linkBlog: string;
  linkDescadastro: string;
};

export function EmailBoasVindas({ nome, linkWhatsapp, linkBlog, linkDescadastro }: EmailBoasVindasProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>As informações que te prometi sobre a ArrudaCred, {nome}</Preview>
      <Body style={{ backgroundColor: "#f4f1ea", margin: 0, padding: "24px 0", fontFamily: "Arial, Helvetica, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", maxWidth: 480, borderRadius: 12, overflow: "hidden" }}>
          <Section style={{ backgroundColor: NAVY, padding: "20px 32px" }}>
            <Img src={LOGO_URL} alt="ArrudaCred" width={160} style={{ display: "block" }} />
          </Section>

          <Section style={{ padding: "28px 32px 8px" }}>
            <Text style={{ fontSize: 16, lineHeight: "24px", color: "#1a1a1a", margin: "0 0 16px" }}>
              Olá, {nome}! 😊
            </Text>
            <Text style={{ fontSize: 15, lineHeight: "24px", color: "#333333", margin: "0 0 16px" }}>
              Sou a Malala, da ArrudaCred. Conforme conversamos, separei rapidinho as informações
              que podem te deixar mais tranquilo(a) antes de seguirmos:
            </Text>

            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "0 0 20px" }}>
              <tbody>
                {[
                  "Nota 9,5/10 no Reclame Aqui e 4,9/5 no Google",
                  "Certificado RA1000 — selo de excelência do próprio Reclame Aqui",
                  "Mais de 5.000 clientes atendidos",
                  "Contrato formal de prestação de serviço",
                  "Indicada ao Prêmio Reclame Aqui 2026 (categoria Recuperação de Crédito)",
                ].map((item) => (
                  <tr key={item}>
                    <td style={{ fontSize: 14, lineHeight: "22px", color: "#333333", padding: "2px 0" }}>
                      <span style={{ color: DOURADO, fontWeight: 700 }}>✓ </span>
                      {item}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Text style={{ fontSize: 15, lineHeight: "24px", color: "#333333", margin: "0 0 24px" }}>
              Se quiser ver tudo isso com mais detalhe, escrevi um post especial sobre a nossa
              reputação:{" "}
              <Link href={linkBlog} style={{ color: NAVY, textDecoration: "underline" }}>
                confira aqui
              </Link>
              .
            </Text>

            <Section style={{ textAlign: "center", margin: "0 0 28px" }}>
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

            <Text style={{ fontSize: 14, lineHeight: "22px", color: "#666666", margin: "0 0 24px" }}>
              Quando quiser continuar, é só me chamar de volta — sigo por aqui te ajudando.
            </Text>
          </Section>

          <Hr style={{ borderColor: "#e5e0d3", margin: 0 }} />

          <Section style={{ padding: "20px 32px", backgroundColor: "#faf8f3" }}>
            <Text style={{ fontSize: 11, lineHeight: "18px", color: "#999999", margin: "0 0 8px" }}>
              L.H. DE ARRUDA D. DO VALLE SERVICOS LTDA (ArrudaCred) — CNPJ 40.342.851/0001-37
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
