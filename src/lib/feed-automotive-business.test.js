import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reescreverLink, padronizar, filtrarRelevanciaComSegmentos } from '../wf01-coleta.js';

// Filtro de frota (nov/2026): termo genérico só no começo da palavra, nome de
// lugar fora, veículo comercial como termo do ICP. Casos do feed de 16/11/2026.
const frota = (titulo, resumo = '') => {
  const log = console.log; console.log = () => {};
  try { return filtrarRelevanciaComSegmentos([{ titulo, resumo, url: 'u', fonte: 'X' }]).some((a) => a._frota); } finally { console.log = log; }
};

test('termo genérico no meio da palavra ou em nome de cidade não aprova', () => {
  assert.equal(frota('MG Motor abrirá 40 novas lojas no Brasil em 2027',
    'A MG Motor anunciou que pretende dobrar a quantidade de concessionárias no Brasil, com 40 novas lojas, totalizando 80 unidades de veículos.'), false);
  assert.equal(frota('GM propõe PDV em fábrica de São José dos Campos',
    'A General Motors apresentou proposta de Plano de Demissão Voluntária; montadora teria apresentado justificativa de queda na produção.'), false);
});

test('começo de palavra continua valendo (rodoviário, frotas, obras)', () => {
  assert.equal(frota('Falta de motoristas preocupa operadores do transporte rodoviário', 'Relatório aponta impacto no mercado.'), true);
  assert.equal(frota('Obras na BR-101 avançam', 'Concessionária amplia investimento em infraestrutura.'), true);
});

test('utilitário comercial elétrico entra sem citar frota', () => {
  assert.equal(frota('Fever amplia linha de comerciais elétricos com dois modelos da família Nextem',
    'FN1500 e FN650 chegam ao Brasil em 2027; modelos atendem operações de diferentes volumes de carga.'), true);
});

// Links reais do feed em 16/11/2026: categoria variável antes do slug.
test('link do painel vira o endereço público em /noticias/', () => {
  assert.equal(
    reescreverLink('https://painel.automotivebusiness.com.br/montadoras/gm-propoe-pdv-em-fabrica-de-sao-jose-dos-campos/'),
    'https://www.automotivebusiness.com.br/noticias/gm-propoe-pdv-em-fabrica-de-sao-jose-dos-campos',
  );
  assert.equal(
    reescreverLink('https://painel.automotivebusiness.com.br/noticias/volkswagen-suspende-expansao-de-fabrica-na-alemanha-apos-queda-nos-lucros/'),
    'https://www.automotivebusiness.com.br/noticias/volkswagen-suspende-expansao-de-fabrica-na-alemanha-apos-queda-nos-lucros',
  );
  assert.equal(
    reescreverLink('https://painel.automotivebusiness.com.br/negocios/geely-chega-a-60-concessionarias-no-brasil/?utm_source=rss'),
    'https://www.automotivebusiness.com.br/noticias/geely-chega-a-60-concessionarias-no-brasil',
  );
});

test('link de outra fonte não muda', () => {
  const url = 'https://ocarreteiro.com.br/empresas/veic-redes/';
  assert.equal(reescreverLink(url), url);
  assert.equal(reescreverLink(''), '');
});

test('padronizar usa o link público e a fonte Automotive Business', () => {
  const log = console.log; console.log = () => {};
  try {
    const [a] = padronizar([{
      title: 'Omnilink mira receita de R$ 900 milhões com pneu conectado',
      link: 'https://painel.automotivebusiness.com.br/fornecedores/omnilink-mira-receita-de-r-900-milhoes-pneu-conectado-em-2027/',
      pubDate: 'Fri, 13 Nov 2026 17:41:29 +0000',
      feedUrl: 'https://painel.automotivebusiness.com.br/feed/',
      creator: 'Karen Sousa',
    }]);
    assert.equal(a.url, 'https://www.automotivebusiness.com.br/noticias/omnilink-mira-receita-de-r-900-milhoes-pneu-conectado-em-2027');
    assert.equal(a.fonte, 'Automotive Business');
    assert.equal(a.dicaSegmento, '');
  } finally { console.log = log; }
});
