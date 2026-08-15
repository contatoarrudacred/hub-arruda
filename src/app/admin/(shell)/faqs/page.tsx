import { listarFaqs, listarProdutos } from "@/lib/motor-fluxo/repositorio-admin";
import { FaqsClient } from "./faqs-client";

export default async function FaqsPage() {
  const [faqs, produtos] = await Promise.all([listarFaqs(), listarProdutos()]);

  return <FaqsClient faqsIniciais={faqs} produtos={produtos} />;
}
