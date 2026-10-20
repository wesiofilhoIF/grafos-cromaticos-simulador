/**
 * Motor do Simulador de Grafos Cromáticos.
 *
 * O simulador web (`simulador_grafos_cromaticos.html`) é a fonte única da verdade
 * dos algoritmos. Em vez de duplicar a lógica aqui, este módulo extrai do HTML
 * os trechos de JavaScript puro (paleta, presets e motores de análise/coloração)
 * e os avalia em memória. Se o HTML mudar e um símbolo sumir, a extração falha
 * com erro explícito — nunca silenciosamente.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Caminho padrão: o HTML do simulador fica na raiz do repositório. */
export const HTML_PADRAO = resolve(HERE, '..', '..', 'simulador_grafos_cromaticos.html');

/** URL pública usada como fallback quando não há cópia local do simulador. */
export const HTML_REMOTO =
  'https://raw.githubusercontent.com/wesiofilhoIF/grafos-cromaticos-simulador/main/simulador_grafos_cromaticos.html';

const CACHE_LOCAL = resolve(HERE, '..', '.cache', 'simulador_grafos_cromaticos.html');

/** Símbolos extraídos do HTML e devolvidos pelo motor. */
export const SIMBOLOS = [
  'PALETTE',
  'GRAPH_PRESETS',
  'SIMULATION_ALGORITHMS',
  'analyzeGraphStructure',
  'evaluateColoring',
  'generateDsaturSimulation',
  'generateWelshPowellSimulation',
  'generateGreedySimulation',
  'generateExactSimulation',
  'computeColoringHint',
  'buildExplainMarkdown',
];

function pularCitada(src, i) {
  const aspa = src[i];
  let k = i + 1;
  while (k < src.length) {
    if (src[k] === '\\') { k += 2; continue; }
    if (src[k] === aspa) return k + 1;
    k++;
  }
  throw new Error('String não terminada no HTML do simulador');
}

function pularTemplate(src, i) {
  let k = i + 1;
  while (k < src.length) {
    if (src[k] === '\\') { k += 2; continue; }
    if (src[k] === '`') return k + 1;
    if (src[k] === '$' && src[k + 1] === '{') {
      k = casarChave(src, k + 1);
      continue;
    }
    k++;
  }
  throw new Error('Template literal não terminado no HTML do simulador');
}

/** Casa o par de delimitadores aberto em `i`; devolve o índice logo após o fechamento. */
function casarDelimitador(src, i) {
  const abertura = src[i];
  const fechamento = { '[': ']', '{': '}', '(': ')' }[abertura];
  if (!fechamento) throw new Error(`Delimitador inesperado: ${abertura}`);
  let profundidade = 0;
  let k = i;
  while (k < src.length) {
    const c = src[k];
    if (c === '/' && src[k + 1] === '/') {
      const nl = src.indexOf('\n', k);
      if (nl < 0) break;
      k = nl + 1;
      continue;
    }
    if (c === '/' && src[k + 1] === '*') {
      const fim = src.indexOf('*/', k);
      if (fim < 0) break;
      k = fim + 2;
      continue;
    }
    if (c === '"' || c === "'") { k = pularCitada(src, k); continue; }
    if (c === '`') { k = pularTemplate(src, k); continue; }
    if (c === abertura) { profundidade++; k++; continue; }
    if (c === fechamento) {
      profundidade--;
      k++;
      if (profundidade === 0) return k;
      continue;
    }
    k++;
  }
  throw new Error(`Delimitador "${abertura}" não fechado no HTML do simulador`);
}

function casarChave(src, i) {
  return casarDelimitador(src, i);
}

function extrairConstante(src, nome) {
  const re = new RegExp(`const\\s+${nome}\\s*=\\s*`);
  const m = re.exec(src);
  if (!m) throw new Error(`Símbolo "${nome}" não encontrado no HTML do simulador`);
  const inicioValor = m.index + m[0].length;
  const fimValor = casarDelimitador(src, inicioValor);
  return `${src.slice(m.index, fimValor)};`;
}

function extrairFuncao(src, nome) {
  const re = new RegExp(`function\\s+${nome}\\s*\\(`);
  const m = re.exec(src);
  if (!m) throw new Error(`Função "${nome}" não encontrada no HTML do simulador`);
  const abreParenteses = src.indexOf('(', m.index);
  const fechaParenteses = casarDelimitador(src, abreParenteses);
  const abreChave = src.indexOf('{', fechaParenteses);
  if (abreChave < 0) throw new Error(`Corpo da função "${nome}" não encontrado`);
  const fim = casarDelimitador(src, abreChave);
  return src.slice(m.index, fim);
}

/** Localiza o HTML do simulador: env → cópia local → cache → GitHub (fallback). */
export async function resolverHtml({ permitirRede = true } = {}) {
  const doEnv = process.env.SIMULADOR_GRAFOS_HTML;
  if (doEnv) {
    if (!existsSync(doEnv)) throw new Error(`SIMULADOR_GRAFOS_HTML aponta para arquivo inexistente: ${doEnv}`);
    return { caminho: doEnv, origem: 'env' };
  }
  if (existsSync(HTML_PADRAO)) return { caminho: HTML_PADRAO, origem: 'repositorio' };
  if (existsSync(CACHE_LOCAL)) return { caminho: CACHE_LOCAL, origem: 'cache' };
  if (!permitirRede) {
    throw new Error(
      `HTML do simulador não encontrado em ${HTML_PADRAO}. Defina SIMULADOR_GRAFOS_HTML ou restaure o simulador_grafos_cromaticos.html.`
    );
  }
  const resposta = await fetch(HTML_REMOTO);
  if (!resposta.ok) {
    throw new Error(`Não foi possível baixar o simulador (HTTP ${resposta.status}) e não há cópia local.`);
  }
  const html = await resposta.text();
  mkdirSync(dirname(CACHE_LOCAL), { recursive: true });
  writeFileSync(CACHE_LOCAL, html);
  return { caminho: CACHE_LOCAL, origem: 'github' };
}

let motorCache = null;

/** Carrega (uma única vez) o motor extraído do HTML do simulador. */
export async function carregarMotor() {
  if (motorCache) return motorCache;
  const { caminho, origem } = await resolverHtml();
  const src = readFileSync(caminho, 'utf8');
  const pedacos = [
    extrairConstante(src, 'PALETTE'),
    extrairConstante(src, 'GRAPH_PRESETS'),
    extrairConstante(src, 'SIMULATION_ALGORITHMS'),
    extrairFuncao(src, 'analyzeGraphStructure'),
    extrairFuncao(src, 'evaluateColoring'),
    extrairFuncao(src, 'generateDsaturSimulation'),
    extrairFuncao(src, 'generateWelshPowellSimulation'),
    extrairFuncao(src, 'generateGreedySimulation'),
    extrairFuncao(src, 'generateExactSimulation'),
    extrairFuncao(src, 'computeColoringHint'),
    extrairFuncao(src, 'buildExplainMarkdown'),
  ];
  const corpo = `${pedacos.join('\n\n')}\n\nreturn { ${SIMBOLOS.join(', ')} };`;
  let fabrica;
  try {
    fabrica = new Function(corpo);
  } catch (erro) {
    throw new Error(`Falha ao compilar o motor extraído do simulador: ${erro.message}`);
  }
  const motor = fabrica();
  for (const simbolo of SIMBOLOS) {
    if (motor[simbolo] === undefined) throw new Error(`Símbolo "${simbolo}" ausente após extração`);
  }
  motor.__origem = origem;
  motor.__caminho = caminho;
  motorCache = motor;
  return motor;
}
