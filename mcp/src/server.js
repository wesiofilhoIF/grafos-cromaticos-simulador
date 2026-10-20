#!/usr/bin/env node
/**
 * Servidor MCP do Simulador de Grafos Cromáticos.
 *
 * Exõe o motor do simulador web (extraído do próprio HTML, sem duplicar
 * algoritmos) como ferramentas para o agente produzir explicações de Teoria
 * dos Grafos — teoria, análise de um grafo concreto e simulação passo a passo
 * das heurísticas de coloração.
 *
 * Transporte: stdio.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { carregarMotor } from './engine.js';
import {
  ALGORITMOS,
  TIPOS,
  analisarGrafo,
  aplicarCores,
  compararAlgoritmos,
  desenharSvg,
  dicaColoracao,
  gerarPassos,
  listarPresets,
  montarGrafo,
  relatorioMarkdown,
  simular,
} from './grafo.js';
import { buscarTema, listarTemas } from './conteudo.js';

const INSTRUCOES = `Servidor do Simulador de Grafos Cromáticos (wesiofilhoIF/grafos-cromaticos-simulador).

Use para explicar Teoria dos Grafos (coloração de vértices) com base no motor real do simulador:
- listar_presets: grafos clássicos disponíveis (Petersen, Grötzsch, K5, K3,3, C5, Q3).
- analisar_grafo: invariantes (|V|, |E|, Δ, δ, ω, χ exato, bipartição, ciclo ímpar) de um grafo.
- simular_coloracao: executa DSatur / Welsh-Powell / Guloso / Exata e devolve a coloração com a justificativa de cada passo.
- comparar_algoritmos: roda os quatro algoritmos no mesmo grafo e compara cores usadas, folga sobre χ, passos e tempo.
- dica_coloracao: sugere o próximo vértice a colorar e a cor viável, com justificativa (aceita estado parcial).
- relatorio_markdown: o relatório Markdown que o simulador gera na tela (invariantes, classes de cor, passo a passo, conclusões).
- explicar: texto didático de um tema, opcionalmente ancorado em um exemplo calculado.
- desenhar_grafo: SVG do grafo com a coloração aplicada.

Todas as ferramentas aceitam o mesmo seletor de grafo: preset | tipo (completo, ciclo, bipartido, aleatorio) | arestas.`;

const servidor = new McpServer(
  { name: 'simulador-grafos', version: '1.0.0' },
  { capabilities: { tools: {} }, instructions: INSTRUCOES }
);

const specGrafo = {
  preset: z
    .string()
    .optional()
    .describe('Preset do simulador: petersen, grotzsch, k5, k33, cycle5, cube.'),
  tipo: z
    .enum(['completo', 'ciclo', 'bipartido', 'aleatorio'])
    .optional()
    .describe('Tipo de grafo gerado: completo K(n), ciclo C(n), bipartido K(a,b), aleatório G(n,p).'),
  n: z.number().int().optional().describe('Número de vértices (tipos completo, ciclo, aleatorio).'),
  a: z.number().int().optional().describe('Lado A do bipartido K(a,b).'),
  b: z.number().int().optional().describe('Lado B do bipartido K(a,b).'),
  p: z.number().min(0).max(1).optional().describe('Probabilidade de cada aresta no grafo aleatório G(n,p).'),
  vertices: z.number().int().optional().describe('Quantidade de vértices em grafo definido por arestas.'),
  arestas: z
    .array(z.array(z.number().int()))
    .optional()
    .describe('Lista de pares [u,v] com índices de vértices (0-based).'),
  rotulos: z.array(z.string()).optional().describe('Rótulos dos vértices (padrão V1, V2, ...).'),
};

function descreverGrafo(grafo) {
  return `${grafo.nome} — ${grafo.descricao}`;
}

function formatarAnalise(analise) {
  const linhas = [
    '| Métrica | Valor |',
    '| --- | --- |',
    `| Vértices (|V|) | ${analise.vertices} |`,
    `| Arestas (|E|) | ${analise.arestas} |`,
    `| Grau máximo (Δ) | ${analise.grauMaximo} |`,
    `| Grau mínimo (δ) | ${analise.grauMinimo} |`,
    `| Grau médio | ${analise.grauMedio} |`,
    `| Densidade | ${analise.densidade} |`,
    `| Maior clique (ω) | ${analise.numeroDeCliques} |`,
    `| Número cromático exato (χ) | ${analise.numeroCromaticoExato} |`,
    `| Bipartido | ${analise.bipartido ? 'sim' : 'não'} |`,
  ];
  if (analise.cicloImpar) linhas.push(`| Ciclo ímpar detectado | ${analise.cicloImpar.join(' → ')} |`);
  linhas.push('', `Graus por vértice: ${analise.graus.map((g) => `${g.label}=${g.grau}`).join(', ')}`);
  linhas.push('', `Leitura rápida: ω ≤ χ ≤ Δ+1 → ${analise.numeroDeCliques} ≤ ${analise.numeroCromaticoExato} ≤ ${analise.grauMaximo + 1}.`);
  if (analise.numeroCromaticoExato === analise.numeroDeCliques) {
    linhas.push('χ = ω: existe uma clique que já exige todas as cores — nenhuma coloração pode usar menos.');
  } else if (analise.numeroCromaticoExato < analise.grauMaximo + 1) {
    linhas.push(`χ < Δ+1: existe folga; ${analise.grauMaximo + 1 - analise.numeroCromaticoExato} cor(es) abaixo do pior caso guloso.`);
  }
  return linhas.join('\n');
}

function formatarClasses(classes) {
  if (!classes.length) return '_Sem coloração aplicada._';
  return classes
    .map((c) => `- **Classe ${c.indice}** (${c.hex}): ${c.vertices.join(', ')}`)
    .join('\n');
}

servidor.registerTool(
  'listar_presets',
  {
    title: 'Listar grafos pré-definidos',
    description:
      'Lista os grafos clássicos do simulador (Petersen, Grötzsch, K5, K3,3, C5, Q3) com o número de vértices, arestas e o valor de χ.',
    inputSchema: {},
  },
  async () => {
    const presets = await listarPresets();
    const motor = await carregarMotor();
    const linhas = ['| id | Grafo | |V| | |E| | χ | Observação |', '| --- | --- | --- | --- | --- | --- |'];
    for (const preset of presets) {
      const { nodes, edges } = motor.GRAPH_PRESETS[preset.id].generate();
      const analise = await analisarGrafo(nodes, edges);
      linhas.push(
        `| \`${preset.id}\` | ${preset.nome} | ${analise.vertices} | ${analise.arestas} | ${analise.numeroCromaticoExato} | ${preset.descricao} |`
      );
    }
    return {
      content: [
        {
          type: 'text',
          text: `Grafos disponíveis no simulador (motor carregado de: ${motor.__caminho}):\n\n${linhas.join('\n')}`,
        },
      ],
    };
  }
);

servidor.registerTool(
  'analisar_grafo',
  {
    title: 'Analisar grafo',
    description:
      'Calcula os invariantes de um grafo: |V|, |E|, grau máximo e mínimo, densidade, ω (maior clique), χ exato, bipartição e ciclo ímpar. Escolha o grafo por preset, por tipo gerado ou por lista de arestas.',
    inputSchema: specGrafo,
  },
  async (args) => {
    const grafo = await montarGrafo(args);
    const analise = await analisarGrafo(grafo.nodes, grafo.edges);
    return {
      content: [
        {
          type: 'text',
          text: `### ${descreverGrafo(grafo)}\n\n${formatarAnalise(analise)}`,
        },
      ],
      structuredContent: { grafo: { nome: grafo.nome, ...analise } },
    };
  }
);

servidor.registerTool(
  'simular_coloracao',
  {
    title: 'Simular coloração',
    description:
      'Executa um algoritmo de coloração (dsatur, welsh-powell, greedy, exata ou todos) e devolve a coloração resultante, o número de cores usadas, as classes de cor e a justificativa passo a passo de cada decisão.',
    inputSchema: {
      ...specGrafo,
      algoritmo: z
        .enum(['dsatur', 'welsh-powell', 'greedy', 'exata', 'todos'])
        .default('dsatur')
        .describe('Algoritmo de coloração a executar.'),
      incluir_passos: z.boolean().default(true).describe('Incluir a justificativa textual de cada passo.'),
    },
  },
  async (args) => {
    const motor = await carregarMotor();
    const grafo = await montarGrafo(args);
    const analise = await analisarGrafo(grafo.nodes, grafo.edges);
    const algoritmos = args.algoritmo === 'todos' ? ['dsatur', 'welsh-powell', 'greedy', 'exata'] : [args.algoritmo];

    const resultados = [];
    for (const algoritmo of algoritmos) {
      const r = await simular(motor, grafo.nodes, grafo.edges, algoritmo);
      const gap = r.coresUsadas - analise.numeroCromaticoExato;
      const linha = [
        `#### ${r.nome}`,
        `- Cores usadas: **${r.coresUsadas}** (χ exato = ${analise.numeroCromaticoExato}, folga = ${gap >= 0 ? gap : 0})${
          r.otimo === false ? ' — a busca exata não encontrou coloração com k cores' : ''
        }`,
        `- Coloração válida: ${r.valida ? 'sim' : 'não'}${r.conflitos ? ` (${r.conflitos} conflito(s))` : ''}`,
        '',
        formatarClasses(r.classes),
      ];
      if (args.incluir_passos && r.passos?.length) {
        linha.push('', '**Passo a passo**', '');
        for (const p of r.passos) {
          const alvo = p.title ? p.title : `\`${p.targetNodeLabel}\``;
          const cor = p.chosenColor === null || p.chosenColor === undefined ? '' : ` → C${p.chosenColor + 1}`;
          linha.push(`${p.stepIndex}. ${alvo}${cor} — ${p.reasoning}`);
        }
      }
      resultados.push({ algoritmo, r, texto: linha.join('\n') });
    }

    const comparativo =
      resultados.length > 1
        ? `\n### Comparativo\n\n| Algoritmo | Cores usadas | Folga sobre χ | Válida |\n| --- | --- | --- | --- |\n${resultados
            .map(
              ({ r }) =>
                `| ${ALGORITMOS[r.algoritmo]} | ${r.coresUsadas} | ${r.coresUsadas - analise.numeroCromaticoExato} | ${r.valida ? 'sim' : 'não'} |`
            )
            .join('\n')}`
        : '';

    return {
      content: [
        {
          type: 'text',
          text: `### ${descreverGrafo(grafo)}\n\n${resultados.map((x) => x.texto).join('\n\n')}${comparativo}`,
        },
      ],
    };
  }
);

servidor.registerTool(
  'comparar_algoritmos',
  {
    title: 'Comparar algoritmos de coloração',
    description:
      'Roda os quatro algoritmos do simulador (DSatur, Welsh-Powell, Guloso, Exata) sobre o mesmo grafo e compara cores usadas, folga sobre χ, validade, número de passos e tempo de execução.',
    inputSchema: specGrafo,
  },
  async (args) => {
    const motor = await carregarMotor();
    const grafo = await montarGrafo(args);
    const comparacao = compararAlgoritmos(motor, grafo.nodes, grafo.edges);

    const veredito = comparacao.todosOtimos
      ? `✅ **Todos os algoritmos atingiram o ótimo** (χ = ${comparacao.chi}). Neste grafo as heurísticas acertaram — a diferença entre elas aparece no custo, não no resultado.`
      : `⚠️ **Só ${comparacao.resultados.filter((r) => r.otimo).length} de ${comparacao.resultados.length} algoritmos atingiram o ótimo** (χ = ${comparacao.chi}). Os demais usaram cores extras — é a folga da heurística.`;

    const tabela = [
      '| Algoritmo | Cores usadas | Folga sobre χ | Passos | Tempo (ms) | Conflitos | Válida |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...comparacao.resultados.map(
        (r) =>
          `| ${r.nome} | ${r.coresUsadas} | ${r.otimo ? 'ótimo' : `+${r.coresUsadas - comparacao.chi}`} | ${r.passos} | ${r.tempoMs} | ${r.conflitos} | ${r.valida ? 'sim' : 'não'} |`
      ),
    ].join('\n');

    const barras = comparacao.resultados
      .map((r) => {
        const pct = Math.round((r.coresUsadas / comparacao.maxCores) * 100);
        const barra = '█'.repeat(Math.max(1, pct / 10)).padEnd(10, '░');
        return `- \`${barra}\` ${r.nome}: ${r.coresUsadas} cor(es)${r.otimo ? ' (ótimo)' : ` (+${r.coresUsadas - comparacao.chi})`}`;
      })
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `### ${descreverGrafo(grafo)}\n\n${veredito}\n\n${tabela}\n\n${barras}`,
        },
      ],
      structuredContent: comparacao,
    };
  }
);

servidor.registerTool(
  'dica_coloracao',
  {
    title: 'Pedir dica de coloração',
    description:
      'Sugere o próximo vértice a colorar e a cor viável, com a justificativa (seleção DSatur: maior saturação, desempate por grau não colorido e depois grau total). Aceita um estado parcial via "cores".',
    inputSchema: {
      ...specGrafo,
      cores: z
        .array(z.object({ vertice: z.string(), cor: z.number().int().min(0) }))
        .optional()
        .describe('Cores já atribuídas (por rótulo do vértice) para simular um estado parcial.'),
    },
  },
  async (args) => {
    const motor = await carregarMotor();
    const grafo = await montarGrafo(args);
    const nodes = args.cores?.length ? aplicarCores(grafo.nodes, args.cores) : grafo.nodes;
    const dica = dicaColoracao(motor, nodes, grafo.edges);

    if (!dica) {
      return {
        content: [{ type: 'text', text: 'Todos os vértices já têm cor — não há dica a dar.' }],
      };
    }

    const texto = [
      `**Dica:** pinte \`${dica.nodeLabel}\` com **${dica.colorBadge}** (${dica.colorName}).`,
      '',
      dica.reasoning,
      '',
      `- Grau de saturação (ρ): ${dica.saturationDegree}`,
      `- Vizinhos ainda sem cor: ${dica.uncoloredDegree}`,
      `- Grau total: ${dica.totalDegree}`,
      `- Cores bloqueadas pelos vizinhos: ${
        dica.forbiddenColors.length ? dica.forbiddenColors.map((c) => `C${c + 1}`).join(', ') : 'nenhuma'
      }`,
    ].join('\n');

    return {
      content: [{ type: 'text', text: texto }],
      structuredContent: dica,
    };
  }
);

servidor.registerTool(
  'relatorio_markdown',
  {
    title: 'Relatório em Markdown',
    description:
      'Gera o relatório Markdown exatamente como o botão "Explicação" do simulador: invariantes do grafo, classes de cor, passo a passo da simulação e conclusões.',
    inputSchema: {
      ...specGrafo,
      algoritmo: z
        .enum(['dsatur', 'welsh-powell', 'greedy', 'exata'])
        .default('dsatur')
        .describe('Algoritmo cuja simulação entra no relatório.'),
    },
  },
  async (args) => {
    const motor = await carregarMotor();
    const grafo = await montarGrafo(args);
    const analise = await analisarGrafo(grafo.nodes, grafo.edges);
    const passos = gerarPassos(motor, args.algoritmo, grafo.nodes, grafo.edges);

    // Aplica a coloração final para que o relatório reflita o estado do grafo.
    const ultimo = passos.length ? passos[passos.length - 1].nodeColors : [];
    const cores = new Map(ultimo.map((c) => [c.id, c.color]));
    const nodesColoridos = grafo.nodes.map((n) => ({ ...n, color: cores.get(n.id) ?? null }));

    const md = relatorioMarkdown(motor, {
      nodes: nodesColoridos,
      edges: grafo.edges,
      // Métricas recalculadas sobre o grafo já colorido: assim "cores usadas",
      // "conflitos" e "coloração válida" refletem o estado final.
      metrics: motor.analyzeGraphStructure(nodesColoridos, grafo.edges),
      passos,
      algoritmo: args.algoritmo,
      currentStepIndex: passos.length - 1,
    });

    return { content: [{ type: 'text', text: md }] };
  }
);

servidor.registerTool(
  'explicar',
  {
    title: 'Explicar tema de coloração',
    description:
      'Explicação didática (markdown) de um tema de coloração de grafos: visao-geral, chi, omega, delta, bipartido, dsatur, welsh-powell, greedy, exata, complexidade, aplicacoes. Pode ancorar a explicação em um exemplo calculado no grafo indicado.',
    inputSchema: {
      tema: z.string().describe('Tema da explicação. Exemplos: dsatur, welsh-powell, greedy, exata, chi, omega, delta, bipartido, complexidade, aplicacoes, visao-geral.'),
      ...specGrafo,
      algoritmo: z
        .enum(['dsatur', 'welsh-powell', 'greedy', 'exata'])
        .optional()
        .describe('Algoritmo usado no exemplo ancorado (padrão: dsatur).'),
      com_exemplo: z.boolean().default(true).describe('Incluir exemplo numérico calculado no grafo indicado.'),
    },
  },
  async (args) => {
    const tema = buscarTema(args.tema);
    if (!tema) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Tema "${args.tema}" não encontrado. Temas disponíveis: ${listarTemas()
              .map((t) => t.id)
              .join(', ')}.`,
          },
        ],
      };
    }

    const partes = [`## ${tema.titulo}`, '', tema.corpo];

    if (args.com_exemplo) {
      try {
        const motor = await carregarMotor();
        const grafo = await montarGrafo(args);
        const analise = await analisarGrafo(grafo.nodes, grafo.edges);
        const algoritmo = args.algoritmo ?? 'dsatur';
        const r = await simular(motor, grafo.nodes, grafo.edges, algoritmo);
        partes.push(
          '',
          `### Exemplo ancorado: ${descreverGrafo(grafo)}`,
          '',
          `- Invariantes: |V| = ${analise.vertices}, |E| = ${analise.arestas}, Δ = ${analise.grauMaximo}, ω = ${analise.numeroDeCliques}, χ = ${analise.numeroCromaticoExato}${
            analise.bipartido ? ', bipartido' : ''
          }`,
          `- ${r.nome} usou **${r.coresUsadas}** cor(es) — folga de ${r.coresUsadas - analise.numeroCromaticoExato} sobre o ótimo.`,
          '',
          formatarClasses(r.classes),
          '',
          `> ${r.passos?.[0]?.reasoning ?? ''}`
        );
      } catch (erro) {
        partes.push('', `> Não foi possível gerar o exemplo: ${erro.message}`);
      }
    }

    return { content: [{ type: 'text', text: partes.join('\n') }] };
  }
);

servidor.registerTool(
  'desenhar_grafo',
  {
    title: 'Desenhar grafo (SVG)',
    description:
      'Gera o SVG do grafo com a coloração aplicada — útil para ilustrar uma explicação. Retorna o markup SVG completo.',
    inputSchema: {
      ...specGrafo,
      algoritmo: z
        .enum(['dsatur', 'welsh-powell', 'greedy', 'exata'])
        .default('dsatur')
        .describe('Algoritmo de coloração usado no desenho.'),
    },
  },
  async (args) => {
    const motor = await carregarMotor();
    const grafo = await montarGrafo(args);
    const r = await simular(motor, grafo.nodes, grafo.edges, args.algoritmo);
    const cores = new Map(Object.entries(r.coloracao));
    const svg = desenharSvg(grafo.nodes, grafo.edges, cores);
    return {
      content: [
        {
          type: 'text',
          text: `${descreverGrafo(grafo)} — ${r.nome}, ${r.coresUsadas} cor(es).\n\n${svg}`,
        },
      ],
    };
  }
);

const transporte = new StdioServerTransport();
await servidor.connect(transporte);
