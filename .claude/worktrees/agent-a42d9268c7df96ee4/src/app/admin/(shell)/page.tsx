import { redirect } from "next/navigation";

// Sem CRM (Kanban) construído ainda, Fluxos é o único destino real do admin — a barra lateral
// (sidebar.tsx) já cobre navegação/logout, então a raiz de /admin não precisa de tela própria.
export default function AdminHome() {
  redirect("/admin/fluxos");
}
