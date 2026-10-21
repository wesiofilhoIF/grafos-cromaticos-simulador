import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function comCliente(fn) {
  const transporte = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(RAIZ, 'src', 'server.js')],
    cwd: RAIZ,
  });
  const cliente = new Client({ name: 'teste-smoke', version: '1.0.0' });
  await cliente.connect(transporte);
  try {
    return await fn(cliente);
  } finally {
    await cliente.close();
  }
}

function texto(resultado) {
  return (resultado.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

test('anuncia as nove ferramentas', async () => {
  await comCliente(async (cliente) => {
    const { tools } = await cliente.listTools();
    const nomes = tools.map((t) => t.name).sort();
    assert.deepEqual(nomes, [
      'analisar_grafo',
      'aplicar_no_app',
      'comparar_algoritmos',
      'desenhar_grafo',
      'dica_coloracao',
      'explicar',
      'listar_presets',
      'relatorio_markdown',
      'simular_coloracao',
    ]);
    for (const tool of tools) {
      assert.ok(tool.description, `${tool.name} precisa de descrição`);
      assert.ok(tool.inputSchema, `${tool.name} precisa de inputSchema`);
    }
  });
});

test('listar_presets devolve os seis grafos com chi', async () => {
  await comCliente(async (cliente) => {
    const r = await cliente.callTool({ name: 'listar_presets', arguments: {} });
    const t = texto(r);
    assert.match(t, /petersen/);
    assert.match(t, /Grötzsch/);
    assert.match(t, /K5/);
  });
});

test('analisar_grafo calcula os invariantes', async () => {
  await comCliente(async (cliente) => {
    const r = await cliente.callTool({ name: 'analisar_grafo', arguments: { preset: 'cycle5' } });
    assert.ok(!r.isError, texto(r));
    const t = texto(r);
    assert.match(t, /Número cromático exato \(χ\) \| 3/);
    assert.match(t, /Bipartido \| não/);
  });
});

test('simular_coloracao devolve passos narrados e coloração válida', async () => {
  await comCliente(async (cliente) => {
    const r = await cliente.callTool({
      name: 'simular_coloracao',
      arguments: { preset: 'grotzsch', algoritmo: 'dsatur' },
    });
    assert.ok(!r.isError, texto(r));
    const t = texto(r);
    assert.match(t, /Passo a passo/);
    assert.match(t, /Cores usadas: \*\*4\*\*/);
    assert.match(t, /Classe 1/);
  });
});

test('simular_coloracao com todos os algoritmos gera comparativo', async () => {
  await comCliente(async (cliente) => {
    const r = await cliente.callTool({
      name: 'simular_coloracao',
      arguments: { preset: 'k5', algoritmo: 'todos', incluir_passos: false },
    });
    assert.ok(!r.isError, texto(r));
    assert.match(texto(r), /### Comparativo/);
  });
});

test('comparar_algoritmos roda os quatro e julga o ótimo', async () => {
  await comCliente(async (cliente) => {
    const r = await cliente.callTool({ name: 'comparar_algoritmos', arguments: { preset: 'grotzsch' } });
    assert.ok(!r.isError, texto(r));
    const t = texto(r);
    assert.match(t, /DSatur \(Brélaz\)/);
    assert.match(t, /Welsh-Powell/);
    assert.match(t, /Guloso Sequencial/);
    assert.match(t, /Coloração Exata/);
    assert.match(t, /χ = 4/);
    assert.match(t, /\| DSatur \(Brélaz\) \| 4 \| ótimo \|/);
  });
});

test('relatorio_markdown reproduz o relatório do simulador', async () => {
  await comCliente(async (cliente) => {
    const r = await cliente.callTool({
      name: 'relatorio_markdown',
      arguments: { preset: 'petersen', algoritmo: 'exata' },
    });
    assert.ok(!r.isError, texto(r));
    const t = texto(r);
    assert.match(t, /# Relatório de Coloração/);
    assert.match(t, /## 1\. Grafo atual/);
    assert.match(t, /Número cromático exato \(χ\) \| 3/);
    assert.match(t, /## 3\. Simulação — Coloração Exata/);
    assert.match(t, /χ\(G\) = 3/);
  });
});

test('dica_coloracao sugere vértice e cor válidos, também com estado parcial', async () => {
  await comCliente(async (cliente) => {
    const r = await cliente.callTool({ name: 'dica_coloracao', arguments: { preset: 'cycle5' } });
    assert.ok(!r.isError, texto(r));
    const t = texto(r);
    assert.match(t, /\*\*Dica:\*\*/);
    assert.match(t, /C[0-9]+/);

    const parcial = await cliente.callTool({
      name: 'dica_coloracao',
      arguments: { preset: 'cycle5', cores: [{ vertice: 'V1', cor: 0 }] },
    });
    assert.ok(!parcial.isError, texto(parcial));
    assert.match(texto(parcial), /Cores bloqueadas pelos vizinhos: C1/);
  });
});

test('explicar devolve o tema pedido e ancora um exemplo', async () => {
  await comCliente(async (cliente) => {
    const r = await cliente.callTool({
      name: 'explicar',
      arguments: { tema: 'dsatur', preset: 'petersen' },
    });
    assert.ok(!r.isError, texto(r));
    const t = texto(r);
    assert.match(t, /DSatur/);
    assert.match(t, /Exemplo ancorado/);
    assert.match(t, /χ = 3/);
  });
});

test('explicar com tema inválido devolve erro amigável', async () => {
  await comCliente(async (cliente) => {
    const r = await cliente.callTool({ name: 'explicar', arguments: { tema: 'xyz' } });
    assert.equal(r.isError, true);
    assert.match(texto(r), /não encontrado/);
  });
});

test('desenhar_grafo devolve SVG com as classes coloridas', async () => {
  await comCliente(async (cliente) => {
    const r = await cliente.callTool({
      name: 'desenhar_grafo',
      arguments: { preset: 'k5', algoritmo: 'dsatur' },
    });
    assert.ok(!r.isError, texto(r));
    const t = texto(r);
    assert.match(t, /<svg[\s\S]*<\/svg>/);
    assert.match(t, /#10b981/);
  });
});

test('aplicar_no_app devolve erro amigável quando não há navegador', async () => {
  await comCliente(async (cliente) => {
    // porta CDP fechada de propósito: a ferramenta tem de explicar o que falta,
    // não derrubar o servidor.
    const r = await cliente.callTool({
      name: 'aplicar_no_app',
      arguments: { vertices: 3, arestas: [[0,1],[1,2]], cdpUrl: 'http://127.0.0.1:9' },
    });
    assert.equal(r.isError, true);
    assert.match(texto(r), /CDP|navegador|endpoint/i);
  });
});

test('grafo inválido devolve erro em vez de quebrar', async () => {
  await comCliente(async (cliente) => {
    const r = await cliente.callTool({ name: 'analisar_grafo', arguments: { preset: 'inexistente' } });
    assert.equal(r.isError, true);
    assert.match(texto(r), /Preset desconhecido/);
  });
});
