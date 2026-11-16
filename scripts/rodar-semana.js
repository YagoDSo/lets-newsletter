// Roda a newsletter da semana no computador do Yago (nov/2026).
//
// Chamado pelo Agendador de Tarefas do Windows (ver scripts/agendar-semana.js)
// várias vezes na segunda e na terça, como janelas de nova tentativa. Cada
// etapa (wf01, wf02, wf03) só roda uma vez por semana: o que já passou fica
// marcado em Relatorios/pipeline/<segunda>.json e a próxima janela continua
// de onde parou. Isso evita que uma falha no WF-02 faça o WF-01 abrir uma
// edição nova na tentativa seguinte.
//
// A IA usa a assinatura do Claude Code logado nesta máquina (claude -p), não
// crédito de API. Ver CLAUDE_BACKEND em src/lib/config.js.
//
// Em Node, não em PowerShell: a política de grupo da máquina bloqueia o
// powershell.exe.
//
// Uso manual: node scripts/rodar-semana.js [--forcar]
//   --forcar  roda mesmo fora de segunda/terça (ainda respeita as etapas feitas)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = path.join(RAIZ, 'Relatorios', 'pipeline');
const ETAPAS = [
  ['wf01', 'src/wf01-coleta.js'],
  ['wf02', 'src/wf02-curadoria.js'],
  ['wf03', 'src/wf03-montagem-envio.js'],
];

// Segunda-feira da semana (data local), no formato AAAA-MM-DD.
export function segundaDaSemana(data = new Date()) {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const desde = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - desde);
  const p = (n) => String(n).padStart(2, '0');
  return { segunda: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, diasDesdeSegunda: desde };
}

function main() {
  const forcar = process.argv.includes('--forcar');
  fs.mkdirSync(PASTA, { recursive: true });
  const { segunda, diasDesdeSegunda } = segundaDaSemana();
  const marcador = path.join(PASTA, `${segunda}.json`);
  const log = path.join(PASTA, `${segunda}.log`);
  const registrar = (txt) => {
    const linha = `[${new Date().toLocaleString('pt-BR')}] ${txt}`;
    console.log(linha);
    fs.appendFileSync(log, linha + '\n');
  };

  const feitas = fs.existsSync(marcador) ? JSON.parse(fs.readFileSync(marcador, 'utf8')).etapas : [];
  if (feitas.includes('wf03')) {
    console.log(`Semana de ${segunda} já concluída. Nada a fazer.`);
    return 0;
  }
  // Só segunda e terça: depois disso a edição perdeu o dia de envio.
  if (!forcar && diasDesdeSegunda > 1) {
    registrar(`Fora da janela (segunda/terça) e semana incompleta (feitas: ${feitas.join(', ') || 'nenhuma'}). Rode com --forcar para gerar mesmo assim.`);
    return 0;
  }

  // Checkout no main, sem alteração em arquivo versionado, e atualizado.
  const git = (...args) => spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' });
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
  if (branch !== 'main') { registrar(`ERRO: checkout em "${branch}", não no main.`); return 1; }
  const sujos = git('status', '--porcelain', '--untracked-files=no').stdout.trim();
  if (sujos) { registrar(`ERRO: há alterações não commitadas no checkout:\n${sujos}`); return 1; }
  const pull = git('pull', '--ff-only', '--quiet');
  if (pull.status !== 0) { registrar(`ERRO: git pull falhou (main local divergiu do GitHub?): ${pull.stderr}`); return 1; }

  for (const [etapa, arquivo] of ETAPAS) {
    if (feitas.includes(etapa)) { registrar(`${etapa} já feita nesta semana, pulando.`); continue; }
    registrar(`Iniciando ${etapa}...`);
    const r = spawnSync(process.execPath, [arquivo], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    fs.appendFileSync(log, (r.stdout || '') + (r.stderr || ''));
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    if (r.status !== 0) {
      registrar(`ERRO: ${etapa} terminou com código ${r.status}. A próxima janela tenta de novo a partir daqui.`);
      return r.status || 1;
    }
    feitas.push(etapa);
    fs.writeFileSync(marcador, JSON.stringify({ semana: segunda, etapas: feitas, atualizado: new Date().toISOString() }, null, 2) + '\n');
    registrar(`${etapa} concluída.`);
  }
  registrar('Semana concluída: preview enviado e rascunhos criados no E-goi.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
