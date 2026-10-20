import test from 'node:test';
import assert from 'node:assert/strict';

import { carregarMotor } from '../src/engine.js';
import { analisarGrafo, montarGrafo, simular } from '../src/grafo.js';

const motor = await carregarMotor();

test('motor extrai os símbolos do HTML do simulador', () => {
  assert.equal(typeof motor.analyzeGraphStructure, 'function');
  assert.equal(typeof motor.generateDsaturSimulation, 'function');
  assert.equal(typeof motor.generateWelshPowellSimulation, 'function');
  assert.equal(typeof motor.generateGreedySimulation, 'function');
  assert.ok(Array.isArray(motor.PALETTE) && motor.PALETTE.length === 14);
  assert.ok(motor.GRAPH_PRESETS.petersen);
});

test('invariantes dos grafos clássicos batem com a teoria', async () => {
  const esperado = {
    petersen: { v: 10, e: 15, chi: 3, omega: 2, bipartido: false },
    grotzsch: { v: 11, e: 20, chi: 4, omega: 2, bipartido: false },
    k5: { v: 5, e: 10, chi: 5, omega: 5, bipartido: false },
    k33: { v: 6, e: 9, chi: 2, omega: 2, bipartido: true },
    cycle5: { v: 5, e: 5, chi: 3, omega: 2, bipartido: false },
    cube: { v: 8, e: 12, chi: 2, omega: 2, bipartido: true },
  };
  for (const [preset, exp] of Object.entries(esperado)) {
    const grafo = await montarGrafo({ preset });
    const a = await analisarGrafo(grafo.nodes, grafo.edges);
    assert.equal(a.vertices, exp.v, `${preset}: |V|`);
    assert.equal(a.arestas, exp.e, `${preset}: |E|`);
    assert.equal(a.numeroCromaticoExato, exp.chi, `${preset}: chi`);
    assert.equal(a.numeroDeCliques, exp.omega, `${preset}: omega`);
    assert.equal(a.bipartido, exp.bipartido, `${preset}: bipartido`);
  }
});

test('toda heurística devolve coloração própria válida', async () => {
  for (const preset of ['petersen', 'grotzsch', 'k5', 'k33', 'cycle5', 'cube']) {
    const grafo = await montarGrafo({ preset });
    for (const algoritmo of ['dsatur', 'welsh-powell', 'greedy']) {
      const r = await simular(motor, grafo.nodes, grafo.edges, algoritmo);
      assert.equal(r.conflitos, 0, `${preset}/${algoritmo}: sem conflito`);
      assert.equal(r.valida, true, `${preset}/${algoritmo}: coloração válida`);
      assert.equal(Object.keys(r.coloracao).length, grafo.nodes.length, `${preset}/${algoritmo}: todos coloridos`);
    }
  }
});

test('número de cores das heurísticas é >= chi e a exata atinge chi', async () => {
  const grafo = await montarGrafo({ preset: 'grotzsch' });
  const analise = await analisarGrafo(grafo.nodes, grafo.edges);
  assert.equal(analise.numeroCromaticoExato, 4);
  for (const algoritmo of ['dsatur', 'welsh-powell', 'greedy']) {
    const r = await simular(motor, grafo.nodes, grafo.edges, algoritmo);
    assert.ok(r.coresUsadas >= analise.numeroCromaticoExato, `${algoritmo} usa pelo menos chi`);
  }
  const exata = await simular(motor, grafo.nodes, grafo.edges, 'exata');
  assert.equal(exata.coresUsadas, 4);
  assert.equal(exata.otimo, true);
  assert.equal(exata.conflitos, 0);
});

test('a coloração exata do simulador narra as tentativas com k cores', async () => {
  const grafo = await montarGrafo({ preset: 'grotzsch' });
  const r = await simular(motor, grafo.nodes, grafo.edges, 'exata');
  const titulos = r.passos.map((p) => p.title);
  assert.ok(titulos.some((t) => /Tentativa com 2 cores/.test(t)), 'narra a tentativa que falhou');
  assert.ok(titulos.some((t) => /Número cromático exato/.test(t)), 'narra o resultado final');
  assert.match(r.passos.at(-1).reasoning, /χ\(G\) = 4/);
  assert.ok(r.passos.length > grafo.nodes.length, 'o rastro inclui as tentativas, não só os vértices');
});

test('a dica aponta um vértice cuja cor não conflita com os vizinhos', async () => {
  const grafo = await montarGrafo({ preset: 'petersen' });
  const dica = motor.computeColoringHint(grafo.nodes, grafo.edges);
  assert.ok(dica, 'a dica existe para grafo sem cor');
  assert.ok(grafo.nodes.some((n) => n.id === dica.nodeId), 'aponta um vértice real');
  assert.ok(dica.color >= 0, 'sugere uma cor válida');
  assert.equal(dica.forbiddenColors.length, 0, 'sem cores atribuídas, nada está bloqueado');
  assert.match(dica.reasoning, /Pinte o vértice/);
});

test('a dica respeita um estado parcial e some quando tudo está colorido', async () => {
  const grafo = await montarGrafo({ preset: 'cycle5' });
  const comCor = grafo.nodes.map((n, i) => ({ ...n, color: i === 0 ? 0 : null }));
  const dica = motor.computeColoringHint(comCor, grafo.edges);
  assert.notEqual(dica.nodeId, comCor[0].id, 'não sugere o vértice já pintado');
  assert.deepEqual(dica.forbiddenColors, [0], 'a cor do vizinho pintado bloqueia');

  const completo = grafo.nodes.map((n, i) => ({ ...n, color: i % 2 }));
  assert.equal(motor.computeColoringHint(completo, grafo.edges), null);
});

test('DSatur em K5 usa 5 cores e o guloso em C5 usa 3', async () => {
  const k5 = await montarGrafo({ preset: 'k5' });
  const dsatur = await simular(motor, k5.nodes, k5.edges, 'dsatur');
  assert.equal(dsatur.coresUsadas, 5);
  assert.equal(dsatur.passos.length, 5);

  const c5 = await montarGrafo({ preset: 'cycle5' });
  const guloso = await simular(motor, c5.nodes, c5.edges, 'greedy');
  assert.equal(guloso.coresUsadas, 3);
});

test('grafo definido por arestas respeita os índices informados', async () => {
  const grafo = await montarGrafo({ arestas: [[0, 1], [1, 2], [2, 0]] });
  const a = await analisarGrafo(grafo.nodes, grafo.edges);
  assert.equal(a.vertices, 3);
  assert.equal(a.arestas, 3);
  assert.equal(a.numeroCromaticoExato, 3);
  assert.equal(a.bipartido, false);
});
