import { Heading, Text } from "react-email";
import { EmailLayout, type EmailLayoutProps } from "./layout-base";

// Template genérico pro módulo src/lib/comunicacao — quem chama enviarComunicacao só fornece
// assunto + corpo (texto simples), nunca HTML cru. Reaproveita o MESMO layout padrão de todo
// e-mail da ArrudaCred (Luiz, 15/08/2026: "podemos salvar este modelo... padrão para todos
// e-mails que formos enviar, assim só muda o miolo").

export type EmailComunicacaoGenericaProps = Omit<EmailLayoutProps, "children" | "previewText"> & {
  assunto: string;
  corpo: string;
};

/** Quebra o corpo em parágrafos por linha em branco — texto simples vindo de quem chama, sem markup. */
function paragrafos(corpo: string): string[] {
  return corpo
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function EmailComunicacaoGenerica({ assunto, corpo, linkWhatsapp, redesSociais, linkDescadastro }: EmailComunicacaoGenericaProps) {
  return (
    <EmailLayout previewText={assunto} linkWhatsapp={linkWhatsapp} redesSociais={redesSociais} linkDescadastro={linkDescadastro}>
      <div style={{ padding: "28px 32px" }}>
        <Heading style={{ fontSize: 20, margin: "0 0 16px", color: "#1a1a1a" }}>{assunto}</Heading>
        {paragrafos(corpo).map((paragrafo, i) => (
          <Text key={i} style={{ fontSize: 15, lineHeight: "24px", color: "#333333", margin: "0 0 14px" }}>
            {paragrafo}
          </Text>
        ))}
        {/* Decisão do Luiz (22/08/2026): comunicações enviadas por este mecanismo são avisos
            obrigatórios sobre a conta/contrato (cobrança, institucional, lembrete), não propaganda —
            por isso são enviadas mesmo que a pessoa tenha optado por não receber e-mail de marketing.
            Nota de rodapé explícita pra deixar isso claro pro destinatário. */}
        <Text style={{ fontSize: 11, lineHeight: "16px", color: "#999999", margin: "8px 0 0" }}>
          Este é um aviso obrigatório sobre sua conta ou contrato com a ArrudaCred — não é uma mensagem
          promocional, por isso é enviado independentemente de preferências de e-mail marketing.
        </Text>
      </div>
    </EmailLayout>
  );
}
