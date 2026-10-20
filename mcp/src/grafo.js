/**
 * Construção, análise e coloração de grafos — camada fina sobre o motor
 * extraído do simulador web.
 *
 * Regras:
 * - Toda verdade matemática (χ, ω, Δ, bipartição, classes de cor) sai do motor
 *   do simulador; aqui só há montagem de entrada, formatação e a busca de uma
 *   coloração ótima (necessária para exibir o resultado da coloração exata).
 */
import { carregarMotor } from './engine.js';

export const ALGORITMOS = {
  dsatur: 'DSatur (Brélaz)',
  'welsh-powell': 'Welsh-Powell',
  greedy: 'Guloso Sequencial (First-Fit)',
  exata: 'Coloração Exata (branch-and-bound)',
};

export const TIPOS = {
  completo: 'Grafo completo K(n)',
  ciclo: 'Ciclo C(n)',
  bipartido: 'Grafo bipartido completo K(a,b)',
  aleatorio: 'Grafo aleatório G(n,p)',
  personalizado: 'Grafo definido por lista de arestas',
};

function corDeHex(i) {
  return ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#f43f5e', '#eab308', '#64748b'][i % 14];
}

/** Gerador congruente linear: aleatoriedade reproduzível (mesmo grafo para a mesma semente). */
function lcg(semente) {
  let s = (semente >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function layoutCircular(n, raio = 150) {
  const cx = 200;
  const cy = 200;
  return Array.from({ length: n }, (_, i) => {
    const ang = (i * 2 * Math.PI) / n - Math.PI / 2;
    return { x: Math.round(cx + raio * Math.cos(ang)), y: Math.round(cy + raio * Math.sin(ang)) };
  });
}

function criarVertices(n, rotulos) {
  const posicoes = layoutCircular(n);
  return Array.from({ length: n }, (_, i) => ({
    id: `v${i}`,
    label: rotulos?.[i] ?? `V${i + 1}`,
    x: posicoes[i].x,
    y: posicoes[i].y,
    color: null,
  }));
}

function criarArestas(pares, nodes) {
  return pares.map(([a, b], i) => ({
    id: `e${i}`,
    source: nodes[a].id,
    target: nodes[b].id,
  }));
}

export async function listarPresets() {
  const motor = await carregarMotor();
  return Object.entries(motor.GRAPH_PRESETS).map(([id, preset]) => ({
    id,
    nome: preset.name,
    descricao: preset.desc,
  }));
}

export async function montarGrafo(spec = {}) {
  const motor = await carregarMotor();

  if (spec.preset) {
    const preset = motor.GRAPH_PRESETS[spec.preset];
    if (!preset) {
      throw new Error(
        `Preset desconhecido: "${spec.preset}". Disponíveis: ${Object.keys(motor.GRAPH_PRESETS).join(', ')}.`
      );
    }
    const { nodes, edges } = preset.generate();
    return {
      nodes,
      edges,
      nome: preset.name,
      descricao: preset.desc,
      tipo: 'preset',
    };
  }

  const tipo = spec.tipo ?? (spec.arestas ? 'personalizado' : null);
  if (!tipo) throw new Error('Informe "preset" ou "tipo" (completo|ciclo|bipartido|aleatorio) ou "arestas".');
  if (!TIPOS[tipo]) throw new Error(`Tipo desconhecido: "${tipo}". Disponíveis: ${Object.keys(TIPOS).join(', ')}.`);

  let vertices = spec.vertices ?? 0;
  let pares = [];

  if (tipo === 'completo') {
    const n = spec.n ?? vertices;
    if (!n || n < 1) throw new Error('Grafo completo exige n ≥ 1.');
    vertices = n;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pares.push([i, j]);
  } else if (tipo === 'ciclo') {
    const n = spec.n ?? vertices;
    if (!n || n < 3) throw new Error('Ciclo exige n ≥ 3.');
    vertices = n;
    for (let i = 0; i < n; i++) pares.push([i, (i + 1) % n]);
  } else if (tipo === 'bipartido') {
    const a = spec.a ?? 3;
    const b = spec.b ?? 3;
    vertices = a + b;
    for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) pares.push([i, a + j]);
  } else if (tipo === 'aleatorio') {
    const n = spec.n ?? vertices;
    const p = spec.p ?? 0.4;
    if (!n || n < 1) throw new Error('Grafo aleatório exige n ≥ 1.');
    vertices = n;
    const rnd = lcg(spec.semente ?? 42);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rnd() < p) pares.push([i, j]);
  } else {
    const lista = spec.arestas ?? [];
    if (!Array.isArray(lista)) throw new Error('"arestas" deve ser uma lista de pares [u, v] com índices de vértices.');
    const indices = lista.flat().filter((x) => typeof x === 'number');
    const maxIndice = indices.length ? Math.max(...indices) : -1;
    vertices = Math.max(spec.vertices ?? 0, maxIndice + 1);
    if (vertices < 1) throw new Error('Grafo personalizado precisa de ao menos um vértice.');
    pares = lista.map(([u, v]) => {
      if (!Number.isInteger(u) || !Number.isInteger(v)) throw new Error('Arestas devem usar índices inteiros de vértice.');
      if (u < 0 || v < 0 || u >= vertices || v >= vertices) {
        throw new Error(`Aresta [${u}, ${v}] fora do intervalo de vértices (0..${vertices - 1}).`);
      }
      return [u, v];
    });
  }

  const nodes = criarVertices(vertices, spec.rotulos);
  const edges = criarArestas(pares, nodes);
  return { nodes, edges, nome: TIPOS[tipo], descricao: `${TIPOS[tipo]} com ${vertices} vértices e ${edges.length} arestas.`, tipo };
}

export async function analisarGrafo(nodes, edges) {
  const motor = await carregarMotor();
  const base = motor.analyzeGraphStructure(nodes, edges);

  const idMap = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!idMap.has(e.source) || !idMap.has(e.target) || e.source === e.target) continue;
    adj.get(e.source).push(e.target);
    adj.get(e.target).push(e.source);
  }
  const graus = nodes.map((n) => ({ id: n.id, label: n.label, grau: adj.get(n.id).length }));

  return {
    vertices: base.n,
    arestas: base.m,
    grauMaximo: base.maxDeg,
    grauMinimo: base.minDeg,
    grauMedio: Number(base.avgDeg),
    densidade: Number(base.density),
    numeroDeCliques: base.omega,
    numeroCromaticoExato: base.chi,
    bipartido: base.isBipartite,
    cicloImpar: base.oddCycle,
    graus,
    bruto: base,
  };
}

function classesDeCor(nodes, cores) {
  const grupos = new Map();
  for (const node of nodes) {
    const cor = cores.get(node.id);
    if (cor === undefined || cor === null) continue;
    if (!grupos.has(cor)) grupos.set(cor, []);
    grupos.get(cor).push(node.label);
  }
  return [...grupos.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cor, vertices]) => ({ cor, indice: cor + 1, hex: corDeHex(cor), vertices }));
}

/** Gerador de passos por algoritmo — todos vêm do motor do simulador. */
const GERADORES = {
  dsatur: 'generateDsaturSimulation',
  'welsh-powell': 'generateWelshPowellSimulation',
  greedy: 'generateGreedySimulation',
  exact: 'generateExactSimulation',
};

/**
 * O MCP expõe "exata" (português); o simulador usa o id "exact".
 * Esta é a única tradução de vocabulário entre as duas pontas.
 */
export function idDoSimulador(algoritmo) {
  return algoritmo === 'exata' ? 'exact' : algoritmo;
}

export function gerarPassos(motor, algoritmo, nodes, edges) {
  const nome = GERADORES[idDoSimulador(algoritmo)];
  if (!nome) throw new Error(`Algoritmo desconhecido: "${algoritmo}". Disponíveis: ${Object.keys(ALGORITMOS).join(', ')}.`);
  return motor[nome](nodes, edges);
}

export async function simular(motor, nodes, edges, algoritmo) {
  const passos = gerarPassos(motor, algoritmo, nodes, edges);
  const ultimo = passos.length ? passos[passos.length - 1].nodeColors : [];
  const cores = new Map(ultimo.map((c) => [c.id, c.color]));
  const avaliacao = motor.evaluateColoring(nodes, edges, cores);
  const chi = motor.analyzeGraphStructure(nodes, edges).chi;

  return {
    algoritmo,
    nome: ALGORITMOS[algoritmo],
    passos: passos.map((p) => ({
      stepIndex: p.stepIndex,
      title: p.title ?? null,
      targetNodeId: p.targetNodeId ?? null,
      targetNodeLabel: p.targetNodeLabel ?? null,
      chosenColor: p.chosenColor ?? null,
      forbiddenColors: p.forbiddenColors ?? [],
      saturationDegree: p.saturationDegree ?? null,
      totalDegree: p.totalDegree ?? null,
      reasoning: p.reasoning,
    })),
    coloracao: Object.fromEntries(cores),
    classes: classesDeCor(nodes, cores),
    ...avaliacao,
    otimo: avaliacao.coresUsadas === chi,
  };
}

/** Compara os quatro algoritmos do simulador sobre o mesmo grafo. */
export function compararAlgoritmos(motor, nodes, edges) {
  const chi = motor.analyzeGraphStructure(nodes, edges).chi;
  const resultados = motor.SIMULATION_ALGORITHMS.map((algo) => {
    const t0 = performance.now();
    const passos = gerarPassos(motor, algo.id, nodes, edges);
    const tempoMs = performance.now() - t0;
    const ultimo = passos.length ? passos[passos.length - 1].nodeColors : [];
    const cores = new Map(ultimo.map((c) => [c.id, c.color]));
    const avaliacao = motor.evaluateColoring(nodes, edges, cores);
    return {
      id: algo.id,
      nome: algo.name,
      tag: algo.tag,
      passos: passos.length,
      tempoMs: Math.round(tempoMs * 100) / 100,
      ...avaliacao,
      otimo: avaliacao.coresUsadas === chi,
    };
  });
  return {
    chi,
    resultados,
    todosOtimos: resultados.every((r) => r.otimo),
    maxCores: Math.max(...resultados.map((r) => r.coresUsadas), 1),
  };
}

/** Aplica cores parciais (por rótulo) para simular um estado já pintado. */
export function aplicarCores(nodes, cores = []) {
  const porLabel = new Map(cores.map((c) => [c.vertice, c.cor]));
  return nodes.map((n) => ({ ...n, color: porLabel.has(n.label) ? porLabel.get(n.label) : null }));
}

/** Dica de coloração: próximo vértice (seleção DSatur) e menor cor viável. */
export function dicaColoracao(motor, nodes, edges) {
  return motor.computeColoringHint(nodes, edges);
}

/** Relatório didático em Markdown — o mesmo texto que o simulador gera na tela. */
export function relatorioMarkdown(motor, { nodes, edges, metrics, passos, algoritmo, currentStepIndex }) {
  return motor.buildExplainMarkdown({
    nodes,
    edges,
    metrics,
    simulationSteps: passos,
    selectedAlgorithm: idDoSimulador(algoritmo),
    currentStepIndex,
  });
}

/** SVG do grafo com a coloração aplicada (para ilustrar explicações). */
export function desenharSvg(nodes, edges, cores = new Map(), { largura = 460, altura = 460 } = {}) {
  const cx = largura / 2;
  const cy = altura / 2;
  const raio = Math.min(largura, altura) / 2 - 46;
  const n = nodes.length;
  const posicoes = new Map();
  nodes.forEach((node, i) => {
    const ang = (i * 2 * Math.PI) / n - Math.PI / 2;
    posicoes.set(node.id, { x: cx + raio * Math.cos(ang), y: cy + raio * Math.sin(ang) });
  });

  const arestas = edges
    .map((e) => {
      const a = posicoes.get(e.source);
      const b = posicoes.get(e.target);
      if (!a || !b) return '';
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#334155" stroke-width="1.5"/>`;
    })
    .join('\n  ');

  const vertices = nodes
    .map((node) => {
      const p = posicoes.get(node.id);
      const cor = cores.get(node.id);
      const fill = cor === undefined || cor === null ? '#1e293b' : corDeHex(cor);
      const texto = cor === undefined || cor === null ? '#94a3b8' : '#ffffff';
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="19" fill="${fill}" stroke="#0f172a" stroke-width="2"/>
    <text x="${p.x.toFixed(1)}" y="${(p.y + 4.5).toFixed(1)}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="13" fill="${texto}">${node.label}</text>`;
    })
    .join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Grafo colorido">
  <rect width="${largura}" height="${altura}" fill="#0b1120" rx="14"/>
  ${arestas}
  ${vertices}
</svg>`;
}
