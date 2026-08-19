// Estado de carregamento automático de QUALQUER página sob /admin/* (Next.js App Router: este
// arquivo, no mesmo nível do layout persistente, é mostrado sozinho — sem precisar declarar nada
// em cada página — enquanto o Server Component da rota de destino busca dado/renderiza). A
// Sidebar (layout.tsx) não pisca nem some, só a área de conteúdo mostra isto no lugar. Pedido do
// Luiz (19/08/2026): telas que demoram um pouco pra renderizar pareciam travadas, sem feedback
// nenhum nesse meio tempo — vale pra qualquer módulo (CRM, Marketing, Vendas), não é código de
// nenhum dos três em especial.
export default function CarregandoAdmin() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-amber-500 dark:border-zinc-700 dark:border-t-amber-400"
        role="status"
        aria-label="Carregando"
      />
    </div>
  );
}
