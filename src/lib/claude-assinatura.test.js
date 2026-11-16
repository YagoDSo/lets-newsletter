import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ambienteAssinatura, argumentosAssinatura, textoDaSaidaCli } from './claude.js';

test('ambiente do claude -p fica sem chave de API nem proxy da sessão', () => {
  const env = ambienteAssinatura({
    PATH: 'x', USERPROFILE: 'y', ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: 'u',
    ANTHROPIC_AUTH_TOKEN: 't', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'e', EGOI_API_KEY: 'g',
  });
  assert.deepEqual(env, { PATH: 'x', USERPROFILE: 'y', EGOI_API_KEY: 'g' });
});

test('argumentos: sem ferramentas, sem configurações, com schema serializado', () => {
  const args = argumentosAssinatura({ model: 'claude-sonnet-5-5', schema: { type: 'object' } });
  assert.equal(args[args.indexOf('--model') + 1], 'claude-sonnet-5-5');
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.equal(args[args.indexOf('--setting-sources') + 1], '');
  assert.equal(args[args.indexOf('--json-schema') + 1], '{"type":"object"}');
  assert.ok(!argumentosAssinatura({ model: 'm' }).includes('--json-schema'));
});

test('saída com structured_output vira JSON em texto', () => {
  const out = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '', structured_output: { a: 1 } });
  assert.equal(textoDaSaidaCli(out), '{"a":1}');
});

test('saída sem schema devolve result', () => {
  const out = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'oi' });
  assert.equal(textoDaSaidaCli(`aviso qualquer\n${out}\n`), 'oi');
});

test('erro de crédito ou login vira exceção com a dica do login', () => {
  const out = JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Credit balance is too low' });
  assert.throws(() => textoDaSaidaCli(out), /Credit balance is too low.*claude auth login/);
});
