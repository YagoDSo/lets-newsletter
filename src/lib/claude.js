import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

// Substitui os nós "Claude API - *" (que eram HTTP cru pra /v1/messages).
let _client;
function client() {
  if (!_client) {
    if (!config.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY não configurada (.env ou Secret do GitHub).');
    }
    _client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return _client;
}

// Sonnet 5.5 (out/2026): por padrão ele raciocina antes de responder, o que
// encarece (raciocínio é cobrado como saída) e, no teste com a edição 21,
// estourou o max_tokens da curadoria e devolveu JSON cortado. Com
// `between_tools` o raciocínio fica desligado: no mesmo teste saiu 18% mais
// barato que o Sonnet 4.5 e seguiu melhor as regras do prompt. Esse modo só
// existe no Sonnet 5.5, por isso é condicional ao modelo. No Haiku 5.5
// (curadoria, nov/2026) o raciocínio também vem ligado por padrão e se
// desliga com `disabled`.
function semRaciocinio(model) {
  if (/^claude-sonnet-5-5/.test(model)) return { thinking: { type: 'between_tools' } };
  if (/^claude-haiku-5-5/.test(model)) return { thinking: { type: 'disabled' } };
  return {};
}

// ─── Processamento em lote (out/2026) ─────────────────────────
// A API de lote (Message Batches) cobra metade do preço, mas não garante
// prazo (até 24h; na prática, minutos). Como a news roda de madrugada, dá
// pra esperar: se o lote não terminar até o horário limite (config.loteLimite,
// horário de Brasília), cancela e faz a chamada normal, pagando o preço cheio
// só naquela semana. Se o pipeline já começar depois do limite (atraso na fila
// do GitHub), nem tenta o lote. Desliga com CLAUDE_LOTE=desligado.
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Início deste processo (= início do job no GitHub, que encerra jobs com mais de 6h).
const INICIO = Date.now();

// Prazo do lote: o que vier primeiro entre o horário limite de hoje em
// Brasília (UTC-3, sem horário de verão desde 2019) e o teto de espera
// contado desde o início do processo.
export function limiteDeHoje(agora = new Date(), inicio = INICIO) {
  const [h, m] = config.loteLimite.split(':').map(Number);
  const brt = new Date(agora.getTime() - 3 * 3600e3);
  const absoluto = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), h + 3, m);
  const teto = inicio + config.loteEsperaMaxMin * 60e3;
  return new Date(Math.min(absoluto, teto));
}

async function viaLote(params) {
  if (!config.claudeLote) return null;
  const limite = limiteDeHoje();
  const prazo = new Date(limite.getTime() - 3 * 3600e3).toISOString().slice(11, 16) + ' BRT';
  if (Date.now() >= limite.getTime()) {
    console.log(`  Lote ignorado: já passou do prazo (${prazo}); usando chamada normal.`);
    return null;
  }
  let lote;
  try {
    lote = await client().messages.batches.create({ requests: [{ custom_id: 'pedido', params }] });
    console.log(`  Lote criado (${lote.id}); prazo ${prazo}.`);
    while (lote.processing_status !== 'ended') {
      if (Date.now() >= limite.getTime()) {
        console.log(`  ⚠️ Lote ${lote.id} não terminou até ${prazo}: cancelando e usando chamada normal.`);
        await client().messages.batches.cancel(lote.id).catch(() => {});
        return null;
      }
      await esperar(30000);
      lote = await client().messages.batches.retrieve(lote.id);
    }
    for await (const r of await client().messages.batches.results(lote.id)) {
      if (r.custom_id !== 'pedido') continue;
      if (r.result.type === 'succeeded') {
        console.log(`  Lote ${lote.id} concluído (metade do preço).`);
        return r.result.message;
      }
      console.log(`  ⚠️ Lote ${lote.id} terminou como "${r.result.type}": usando chamada normal.`, JSON.stringify(r.result.error || {}));
      return null;
    }
    return null;
  } catch (e) {
    console.log(`  ⚠️ Lote falhou (${e.message}): usando chamada normal.`);
    if (lote?.id) await client().messages.batches.cancel(lote.id).catch(() => {});
    return null;
  }
}

// Manda 1 mensagem de usuário e devolve o texto da resposta.
// schema (opcional): JSON Schema da resposta. Com ele, a API só devolve JSON
// válido nesse formato (saída estruturada). Necessário desde 26/10/2026: o
// Sonnet 5.5 respondeu a curadoria com dois JSONs e comentários entre eles,
// apesar do "Retorne APENAS JSON" no prompt, e a edição 22 falhou no parse.
export async function chamarClaude(prompt, { maxTokens = 4000, model = config.claudeModel, schema } = {}) {
  if (config.claudeBackend === 'assinatura') return viaAssinatura(prompt, { model, schema });
  const params = {
    model,
    max_tokens: maxTokens,
    ...semRaciocinio(model),
    ...(schema ? { output_config: { format: { type: 'json_schema', schema } } } : {}),
    messages: [{ role: 'user', content: prompt }],
  };
  const resp = (await viaLote(params)) || (await client().messages.create(params));
  if (resp.stop_reason === 'max_tokens') {
    // Resposta cortada no meio: o JSON viria incompleto e o parse falharia
    // com um erro confuso rio abaixo. Melhor falhar aqui, dizendo o porquê.
    throw new Error(`Resposta do Claude cortada no limite de ${maxTokens} tokens (modelo ${model}). Aumente maxTokens.`);
  }
  if (resp.stop_reason === 'refusal') {
    throw new Error(`Claude recusou a resposta (modelo ${model}): ${resp.stop_details?.category || 'sem categoria'}`);
  }
  const texto = (resp.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  if (!texto) throw new Error('Resposta sem conteúdo');
  return texto;
}

// ─── Assinatura (nov/2026) ────────────────────────────────────
// Em vez da API, chama o Claude Code instalado na máquina em modo não
// interativo (`claude -p`). Ele usa a conta logada nele (`claude auth login`
// com a conta da assinatura), então não gasta crédito de API. O prompt vai
// pelo stdin (é grande demais para a linha de comando do Windows) e o
// --json-schema dá a mesma garantia de formato da saída estruturada da API.
//
// Cuidados:
// - ANTHROPIC_API_KEY sai do ambiente do processo filho: com ela presente, o
//   Claude Code cobra da API em vez da assinatura.
// - Sem ferramentas, sem configurações de usuário/projeto (hooks, MCP,
//   CLAUDE.md) e sem salvar sessão: é só uma pergunta e uma resposta.
// - Roda numa pasta temporária vazia, para não carregar nenhum CLAUDE.md.
// - O nome do modelo vai como está em config (ex.: claude-sonnet-5-5); o
//   Claude Code aceita os mesmos ids da API.

// Ambiente do filho: o do processo, sem as variáveis que desviariam a cobrança
// ou a rota (chave de API, proxy da sessão do app desktop).
export function ambienteAssinatura(env = process.env) {
  const limpo = { ...env };
  for (const k of Object.keys(limpo)) {
    if (/^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_BASE_URL|CLAUDECODE|CLAUDE_CODE_.*)$/.test(k)) delete limpo[k];
  }
  return limpo;
}

export function argumentosAssinatura({ model, schema }) {
  const args = [
    '-p',
    '--output-format', 'json',
    '--model', model,
    '--tools', '',
    '--setting-sources', '',
    '--strict-mcp-config',
    '--no-session-persistence',
  ];
  if (schema) args.push('--json-schema', JSON.stringify(schema));
  return args;
}

// Lê a saída JSON do `claude -p` e devolve o texto (com schema, o JSON já
// serializado). Erro de conta/crédito/login vira exceção com a mensagem dele.
export function textoDaSaidaCli(stdout) {
  let r;
  try {
    r = JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).pop());
  } catch {
    throw new Error(`Saída do claude -p não é JSON: ${stdout.slice(0, 300)}`);
  }
  if (r.is_error || r.subtype !== 'success') {
    const msg = r.result || r.subtype || 'erro sem mensagem';
    const dica = /log ?in|credit|crédito/i.test(msg)
      ? ' (o Claude Code precisa estar logado com a conta da assinatura: rode `claude auth login`)'
      : '';
    throw new Error(`claude -p falhou: ${msg}${dica}`);
  }
  if (r.structured_output !== undefined && r.structured_output !== null) {
    return typeof r.structured_output === 'string' ? r.structured_output : JSON.stringify(r.structured_output);
  }
  if (!r.result) throw new Error('Resposta do claude -p sem conteúdo');
  return r.result;
}

async function viaAssinatura(prompt, { model, schema }) {
  const { spawn } = await import('node:child_process');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'lets-insights-claude-'));
  const inicio = Date.now();
  try {
    const stdout = await new Promise((ok, falha) => {
      const filho = spawn(config.claudeCli, argumentosAssinatura({ model, schema }), {
        cwd: pasta,
        env: ambienteAssinatura(),
        // Sem shell: com shell o argumento vazio de --tools some e o JSON do
        // schema quebra nas aspas. No Windows o instalador põe claude.exe no PATH.
        windowsHide: true,
      });
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        filho.kill();
        falha(new Error(`claude -p passou de ${config.claudeCliTimeoutMin} min sem responder`));
      }, config.claudeCliTimeoutMin * 60e3);
      filho.stdout.on('data', (d) => { out += d; });
      filho.stderr.on('data', (d) => { err += d; });
      filho.on('error', (e) => {
        clearTimeout(timer);
        falha(new Error(`Não consegui rodar "${config.claudeCli}" (${e.message}). O Claude Code está instalado e no PATH?`));
      });
      filho.on('close', () => {
        clearTimeout(timer);
        // Mesmo com código de saída diferente de 0, a saída JSON traz o motivo.
        if (out.trim()) ok(out);
        else falha(new Error(`claude -p não devolveu nada. stderr: ${err.slice(0, 500)}`));
      });
      filho.stdin.end(prompt, 'utf8');
    });
    const texto = textoDaSaidaCli(stdout);
    console.log(`  claude -p (${model}, assinatura) respondeu em ${Math.round((Date.now() - inicio) / 1000)}s.`);
    return texto;
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}
