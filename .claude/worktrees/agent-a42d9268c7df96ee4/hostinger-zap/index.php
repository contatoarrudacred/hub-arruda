<?php
/**
 * zap.arrudacred.com.br — página de redirecionamento inteligente pro WhatsApp da Malala.
 *
 * NÃO faz parte do app Next.js (Vercel) — hospedada separada, na Hostinger, fora deste
 * repositório em produção (só fica aqui pra ficar versionada). Sobe direto por FTP/gerenciador
 * de arquivos da Hostinger, sem build nenhum.
 *
 * O que faz:
 * 1. Captura o que dá pra capturar do clique (referer, UTM, dispositivo, IP, idioma) ANTES de
 *    redirecionar — dado que o WhatsApp nunca entrega pra gente.
 * 2. Salva isso no Supabase com um código curto.
 * 3. Redireciona pro wa.me do número atual (lido do Supabase, com um fallback fixo se a leitura
 *    falhar), com o código embutido no final do texto pré-preenchido — é assim que o webhook
 *    (Fase 7) liga esse clique à pessoa quando a primeira mensagem chega.
 *
 * Ver docs/RASTREIO_CLIQUES_WHATSAPP.md pro desenho completo.
 *
 * A ANON_KEY abaixo é pública por design (mesma chave já embutida no app Next.js do lado do
 * navegador) — protegida por Row Level Security no Supabase, não por segredo. Só permite INSERT
 * nesta tabela específica e leitura do número de WhatsApp atual, nada mais.
 */

// -----------------------------------------------------------------------------------------------
// Configuração — só mexer aqui se o projeto Supabase ou o número de fallback mudarem.
// -----------------------------------------------------------------------------------------------
const SUPABASE_URL = 'https://mzvaqjhalynaceecnayt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_baGMvmQOoMIkqzsXYJ-aiw_J93anw0d';
// Usado só se a leitura do número atual no Supabase falhar (fora do ar, timeout etc.).
const WHATSAPP_NUMERO_FALLBACK = '5513997226002';
// Segundos que a tela "Já vamos te conectar..." fica visível antes de redirecionar.
const SEGUNDOS_ATE_REDIRECIONAR = 1.5;

// -----------------------------------------------------------------------------------------------
// Captura do clique
// -----------------------------------------------------------------------------------------------
function ipDoVisitante(): string {
    foreach (['HTTP_X_FORWARDED_FOR', 'HTTP_CLIENT_IP', 'REMOTE_ADDR'] as $chave) {
        if (!empty($_SERVER[$chave])) {
            $valor = $_SERVER[$chave];
            // X-Forwarded-For pode vir com vários IPs separados por vírgula — o primeiro é o do visitante.
            return trim(explode(',', $valor)[0]);
        }
    }
    return '';
}

function gerarCodigo(): string {
    return bin2hex(random_bytes(4)); // 8 caracteres, ex.: "a1b2c3d4"
}

// Reforço de segurança (16/08/2026): não grava clique de robô/crawler conhecido (inclui os que
// geram preview de link — WhatsApp, Facebook, Telegram — quando alguém compartilha este link numa
// conversa; eles ainda recebem a página normalmente, só não contam como clique de verdade).
function pareceRobo(string $userAgent): bool {
    if ($userAgent === '') return true; // navegador de verdade sempre manda User-Agent
    $padroes = ['bot', 'crawl', 'spider', 'slurp', 'curl', 'wget', 'python', 'scrapy',
        'headless', 'facebookexternalhit', 'whatsapp', 'telegrambot', 'googlebot', 'bingbot',
        'semrush', 'ahrefs', 'mj12bot', 'go-http-client', 'libwww-perl', 'postman', 'insomnia'];
    $normalizado = strtolower($userAgent);
    foreach ($padroes as $padrao) {
        if (str_contains($normalizado, $padrao)) return true;
    }
    return false;
}

function chamarSupabase(string $metodo, string $caminho, ?array $corpo = null, array $headersExtra = []): ?array {
    $ch = curl_init(SUPABASE_URL . $caminho);
    $headers = array_merge([
        'apikey: ' . SUPABASE_ANON_KEY,
        'Authorization: Bearer ' . SUPABASE_ANON_KEY,
        'Content-Type: application/json',
    ], $headersExtra);

    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $metodo,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 3, // não pode travar o redirecionamento por causa disso
        CURLOPT_POSTFIELDS => $corpo !== null ? json_encode($corpo) : null,
    ]);

    $resposta = curl_exec($ch);
    curl_close($ch);
    if ($resposta === false) return null;
    $decodificado = json_decode($resposta, true);
    return is_array($decodificado) ? $decodificado : null;
}

$codigo = gerarCodigo();
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';

// Salva o clique — melhor esforço: se falhar, não impede o redirecionamento (a pessoa não pode
// ficar presa numa tela quebrada por causa de rastreamento). Pula robôs conhecidos (pareceRobo) —
// eles continuam vendo a página normalmente, só não sujam a tabela de rastreio.
if (!pareceRobo($userAgent)) {
    chamarSupabase('POST', '/rest/v1/cliques_rastreio', [
        'codigo' => $codigo,
        'referer' => $_SERVER['HTTP_REFERER'] ?? null,
        'utm_source' => $_GET['utm_source'] ?? null,
        'utm_medium' => $_GET['utm_medium'] ?? null,
        'utm_campaign' => $_GET['utm_campaign'] ?? null,
        'utm_content' => $_GET['utm_content'] ?? null,
        'utm_term' => $_GET['utm_term'] ?? null,
        'user_agent' => $userAgent ?: null,
        'ip' => ipDoVisitante(),
        'idioma' => $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? null,
    ], ['Prefer: return=minimal']);
}

// -----------------------------------------------------------------------------------------------
// Número de WhatsApp atual (com fallback)
// -----------------------------------------------------------------------------------------------
$numeroWhatsapp = WHATSAPP_NUMERO_FALLBACK;
$configuracao = chamarSupabase(
    'GET',
    '/rest/v1/configuracoes?chave=eq.whatsapp_numero_atendimento&select=valor',
);
if (is_array($configuracao) && count($configuracao) > 0 && !empty($configuracao[0]['valor'])) {
    $valor = $configuracao[0]['valor'];
    // `valor` é jsonb — normalmente vem como a própria string do número (ex.: "5513997226002"),
    // mas o driver pode devolver já decodificado ou ainda como string JSON — cobre os dois casos.
    $numeroWhatsapp = is_string($valor) ? trim($valor, '"') : (string) $valor;
}
$numeroWhatsapp = preg_replace('/\D/', '', $numeroWhatsapp) ?: WHATSAPP_NUMERO_FALLBACK;

// -----------------------------------------------------------------------------------------------
// Monta o texto pré-preenchido: texto opcional da campanha (?text=) + código de rastreio
// -----------------------------------------------------------------------------------------------
// Limite de tamanho (16/08/2026, reforço de segurança) — evita link absurdamente longo se alguém
// tentar abusar do parâmetro ?text=. 200 caracteres é generoso pra qualquer texto de campanha real.
$textoBase = isset($_GET['text']) ? mb_substr(trim((string) $_GET['text']), 0, 200) : '';
$textoFinal = $textoBase !== ''
    ? $textoBase . ' (ref: ' . $codigo . ')'
    : 'Olá! (ref: ' . $codigo . ')';

$linkWhatsapp = 'https://wa.me/' . $numeroWhatsapp . '?text=' . rawurlencode($textoFinal);
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="<?= SEGUNDOS_ATE_REDIRECIONAR ?>;url=<?= htmlspecialchars($linkWhatsapp, ENT_QUOTES) ?>">
<title>ArrudaCred — Conectando ao WhatsApp</title>
<style>
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #141e33;
    font-family: Arial, Helvetica, sans-serif;
    color: #ffffff;
    text-align: center;
    padding: 24px;
    box-sizing: border-box;
  }
  .cartao { max-width: 360px; }
  .spinner {
    width: 40px;
    height: 40px;
    margin: 0 auto 20px;
    border: 4px solid rgba(255,255,255,0.25);
    border-top-color: #c8a55d;
    border-radius: 50%;
    animation: girar 0.8s linear infinite;
  }
  @keyframes girar { to { transform: rotate(360deg); } }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
  p { font-size: 14px; color: #cfd3dc; margin: 0; }
  a { color: #c8a55d; }
</style>
</head>
<body>
  <div class="cartao">
    <div class="spinner"></div>
    <h1>Você está sendo redirecionado para o WhatsApp da ArrudaCred</h1>
    <p>Se não abrir automaticamente, <a href="<?= htmlspecialchars($linkWhatsapp, ENT_QUOTES) ?>">clique aqui</a>.</p>
  </div>
  <script>
    setTimeout(function () {
      window.location.href = <?= json_encode($linkWhatsapp) ?>;
    }, <?= (int) (SEGUNDOS_ATE_REDIRECIONAR * 1000) ?>);
  </script>
</body>
</html>
