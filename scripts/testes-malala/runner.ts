// Ponto de entrada da bateria de testes — ver scripts/testes-malala/README.md pra como rodar.
// IMPORTANTE: "./ambiente" precisa ser o PRIMEIRO import (estático) deste arquivo — ele stuba
// "server-only" e carrega o .env.local ANTES de qualquer módulo do motor ser importado (dinâmico,
// abaixo). Se algum dia adicionar um import estático de "@/lib/..." aqui em cima, vai quebrar.
import "./ambiente";

import * as fs from "node:fs";
import * as path from "node:path";
import type { Cenario, EspelhoConversa, VeredictoJuiz } from "./tipos";

async function main() {
  const { rodarTurno } = await import("./motor");
  const { apagarLeadTeste, nomearLeadTeste, lerEfeitosBanco } = await import("./lead-teste");
  const { proximaMensagemAtor } = await import("./ator-ia");
  const { julgarConversa } = await import("./juiz");
  const { TODOS_OS_CENARIOS } = await import("./cenarios");

  const filtro = process.argv[2]; // ex.: pnpm tsx scripts/testes-malala/runner.ts divida_alta
  const cenarios: Cenario[] = filtro ? TODOS_OS_CENARIOS.filter((c) => c.nome.includes(filtro)) : TODOS_OS_CENARIOS;

  if (cenarios.length === 0) {
    console.error(`Nenhum cenário encontrado pro filtro "${filtro}".`);
    process.exit(1);
  }

  const pastaResultados = path.resolve(process.cwd(), "scripts/testes-malala/resultados");
  fs.mkdirSync(pastaResultados, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const espelhos: EspelhoConversa[] = [];
  const veredictos: VeredictoJuiz[] = [];

  console.log(`Rodando ${cenarios.length} cenário(s)...\n`);

  for (let i = 0; i < cenarios.length; i++) {
    const cenario = cenarios[i];
    const telefone = `+55119999${String(9000 + i).padStart(5, "0")}`;
    console.log(`[${i + 1}/${cenarios.length}] ${cenario.nome} (${cenario.tipo}) — telefone ${telefone}`);

    await apagarLeadTeste(telefone);

    const turnos: EspelhoConversa["turnos"] = [];
    let erro: string | null = null;
    let encerradoPorLimiteDeTurnos = false;

    try {
      if (cenario.tipo === "roteirizado") {
        for (let t = 0; t < cenario.mensagens.length; t++) {
          const mensagemLead = cenario.mensagens[t];
          const resultado = await rodarTurno(telefone, mensagemLead);
          if (t === 0) await nomearLeadTeste(telefone);
          turnos.push({
            turno: t + 1,
            mensagemLead,
            mensagensMalala: resultado.mensagensMalala,
            etapaCodigo: resultado.etapaCodigo,
            naoReconhecido: resultado.naoReconhecido,
            interpretadoPorIA: resultado.interpretadoPorIA,
          });
          console.log(`  turno ${t + 1}: lead="${mensagemLead}" → etapa=${resultado.etapaCodigo ?? "(encerrado)"}`);
          if (resultado.sobSupervisor || resultado.encerrado) break;
        }
      } else {
        const historico: { autor: "lead" | "malala"; texto: string }[] = [];
        let mensagemLead = cenario.primeiraMensagem;
        for (let t = 0; t < cenario.maxTurnos; t++) {
          const resultado = await rodarTurno(telefone, mensagemLead);
          if (t === 0) await nomearLeadTeste(telefone);
          historico.push({ autor: "lead", texto: mensagemLead });
          for (const msg of resultado.mensagensMalala) historico.push({ autor: "malala", texto: msg });

          turnos.push({
            turno: t + 1,
            mensagemLead,
            mensagensMalala: resultado.mensagensMalala,
            etapaCodigo: resultado.etapaCodigo,
            naoReconhecido: resultado.naoReconhecido,
            interpretadoPorIA: resultado.interpretadoPorIA,
          });
          console.log(`  turno ${t + 1}: lead="${mensagemLead}" → etapa=${resultado.etapaCodigo ?? "(encerrado)"}`);

          if (resultado.sobSupervisor || resultado.encerrado) break;
          if (t === cenario.maxTurnos - 1) {
            encerradoPorLimiteDeTurnos = true;
            break;
          }
          mensagemLead = await proximaMensagemAtor({ persona: cenario.persona, historico });
        }
      }
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
      console.error(`  ERRO no cenário ${cenario.nome}:`, erro);
    }

    const efeitosBanco = await lerEfeitosBanco(telefone);
    const espelho: EspelhoConversa = {
      cenario: cenario.nome,
      descricao: cenario.descricao,
      tipo: cenario.tipo,
      telefone,
      expectativaHandoff: cenario.expectativaHandoff,
      turnos,
      efeitos: efeitosBanco ?? {
        sobSupervisor: false,
        etapaKanban: null,
        notasInternas: [],
        notificacoes: [],
        agendamento: null,
      },
      encerradoPorLimiteDeTurnos,
      erro,
    };
    espelhos.push(espelho);

    fs.writeFileSync(path.join(pastaResultados, `${timestamp}-${cenario.nome}.json`), JSON.stringify(espelho, null, 2), "utf8");

    if (!erro && turnos.length > 0) {
      try {
        const veredicto = await julgarConversa(espelho);
        veredictos.push(veredicto);
        console.log(`  veredito: ${veredicto.resumo}`);
      } catch (e) {
        console.error(`  ERRO ao julgar o cenário ${cenario.nome}:`, e instanceof Error ? e.message : e);
      }
    }

    await apagarLeadTeste(telefone);
    console.log("");
  }

  fs.writeFileSync(
    path.join(pastaResultados, `${timestamp}-veredictos.json`),
    JSON.stringify(veredictos, null, 2),
    "utf8",
  );
  console.log(`\nFeito. ${espelhos.length} espelho(s) e ${veredictos.length} veredito(s) salvos em scripts/testes-malala/resultados/.`);
  console.log(`Prefixo desta rodada: ${timestamp}`);
}

main().catch((e) => {
  console.error("Falha no runner:", e);
  process.exit(1);
});
