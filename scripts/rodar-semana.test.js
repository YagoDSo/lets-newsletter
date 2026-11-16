import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segundaDaSemana } from './rodar-semana.js';

test('segunda da semana: segunda, terça e domingo', () => {
  assert.deepEqual(segundaDaSemana(new Date(2026, 10, 23, 6)), { segunda: '2026-11-23', diasDesdeSegunda: 0 });
  assert.deepEqual(segundaDaSemana(new Date(2026, 10, 24, 23)), { segunda: '2026-11-23', diasDesdeSegunda: 1 });
  assert.deepEqual(segundaDaSemana(new Date(2026, 10, 29, 12)), { segunda: '2026-11-23', diasDesdeSegunda: 6 });
});
