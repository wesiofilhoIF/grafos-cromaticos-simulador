/**
 * Conteúdo didático do servidor MCP.
 *
 * Texto em português, alinhado ao "Guia Teórico" do simulador web
 * (Teoria dos Grafos — coloração de vértices). É conteúdo estático de
 * referência; tudo que é numérico (χ, ω, Δ, classes de cor) vem do motor
 * extraído do simulador, nunca deste arquivo.
 */

export const TEMAS = {
  'visao-geral': {
    titulo: 'Coloração de vértices: visão geral',
    corpo: `**Coloração própria** de um grafo simples G = (V, E): atribuir cores aos vértices de modo que vértices adjacentes nunca compartilhem a mesma cor.

Notações que aparecem no simulador:

- **χ(G)** — número cromático: o **mínimo** de cores de uma coloração própria. É o valor que as heurísticas tentam attains.
- **ω(G)** — número de cliques: o tamanho do maior subgrafo completo. Vale **χ(G) ≥ ω(G)**, porque em uma clique todos os vértices são mutuamente adjacentes e exigem cores distintas.
- **Δ(G)** — grau máximo. Vale **χ(G) ≤ Δ(G) + 1** (coloração gulosa com Δ+1 cores sempre existe).
- **Classe de cor** — conjunto de vértices que compartilham uma cor; por ser coloração própria, cada classe é um **conjunto independente**.

Os cinco algos do simulador (DSatur, Welsh-Powell, Guloso Sequencial, Coloração Exata e o Modo Desafio) operam sobre essas noções. Os três primeiros são **heurísticas**: produzem uma coloração válida, mas não garantem o menor número de cores. A Coloração Exata (branch-and-bound) garante χ(G).`
  },
  chi: {
    titulo: 'Número cromático χ(G)',
    corpo: `**χ(G)** é o menor número de cores necessário para colorar G propriamente.

Como calculá-lo:

1. Se G não tem arestas, χ(G) = 1.
2. Se G é bipartido, χ(G) = 2.
3. Caso geral, minimize k tal que existe coloração própria com k cores — o simulador faz isso por **branch-and-bound**: testa k = ω(G), ω(G)+1, … e para no primeiro k que admite coloração. O grafo é ordenado por grau decrescente antes da busca, o que dramatically reduz as ramificações.

Quando uma heurística usa exatamente χ(G) cores, a coloração dela é **ótima**; quando usa mais, há folga (gap) em relação ao mínimo — e essa folga é a medida honesta da qualidade da heurística. Compare sempre o número de cores da heurística com o χ exato do mesmo grafo: é o número que separa " heurística boa" de "heurística que só funcionou neste exemplo".`
  },
  omega: {
    titulo: 'Número de cliques ω(G)',
    corpo: `**ω(G)** é o tamanho do maior subgrafo completo de G — o maior conjunto de vértices todos adjacentes entre si.

- É um **limite inferior** de χ(G): se há uma clique de tamanho k, são necessárias pelo menos k cores.
- O simulador calcula ω por **Bron–Kerbosch** (enumeração de cliques maximais com pivoteamento).
- ω = Δ+1 caracterize os grafos completos K_n: nesse caso χ = ω = n, não há folga nenhuma.
- ω = 2 equivale a "sem triângulos" (grafo livre de K_3) — o grafo de Grötzsch, com 11 vértices e χ = 4, mostra que é possível precisar de 4 cores sem nenhuma clique de tamanho 3.`
  },
  delta: {
    titulo: 'Grau máximo Δ(G) e o Teorema de Brooks',
    corpo: `**Δ(G)** é o grau máximo (vértice de maior grau).

- O algoritmo guloso garante **χ(G) ≤ Δ(G) + 1** (no pior caso, um vértice pode ver todas as Δ cores já usadas).
- **Teorema de Brooks**: se G é conexo e não é um grafo completo K_n nem um ciclo ímpar C_{2k+1}, então **χ(G) ≤ Δ(G)**. Ou seja, nos casos degenerados excluídos, o "chegar" em Δ+1 é sinal de que o grafo é exatamente K_n ou ciclo ímpar.
- **Teorema das Quatro Cores** (Appel & Haken, 1976): todo grafo planar é 4-colorível, χ(G) ≤ 4.

Na prática, ω ≤ χ ≤ Δ+1 dá uma faixa rápida para prever o resultado de uma heurística antes mesmo de rodá-la.`
  },
  bipartido: {
    titulo: 'Bipartição e ciclos ímpares',
    corpo: `Um grafo é **bipartido** quando seus vértices se dividem em dois conjuntos disjuntos A e B, de modo que toda aresta liga A a B. Equivalentemente, é 2-colorível.

**Teorema:** um grafo é bipartido **se e somente se** não contém ciclo de comprimento ímpar.

O simulador detecta a bipartição por **BFS** (coloração em duas camadas): se ao voltar por uma aresta os dois extremos já têm a mesma cor, o grafo não é bipartido e o caminho percorrido é o **ciclo ímpar** (destacado em âmbar na interface).

Quando o grafo é bipartido, χ(G) = 2 (ou 1 se não houver arestas). Como consequência, DSatur, Welsh-Powell e Guloso nunca devem ultrapassar 2 cores em grafos bipartidos — se ultrapassam, é sinal de que o grafo realmente não é bipartido.`
  },
  dsatur: {
    titulo: 'DSatur (Brélaz, 1979)',
    corpo: `**Degree of Saturation**. O grau de saturação ρ(v) de um vértice v é o número de **cores distintas** já presentes entre seus vizinhos (não o número de vizinhos coloridos — contar cores distintas é o que dá a heurística sua força).

Algoritmo:
1. Escolhe o vértice não colorido com **maior ρ**; desempata pelo **maior grau não colorido** e, se ainda houver empate, pelo **maior grau total**.
2. Atribui a ele a **menor cor viável** (a menor cor que não aparece entre os vizinhos).

Por que funciona bem: escolher o vértice mais "saturado" maximiza a informação disponível e tende a revelar incompatibilidades antes, reduzindo retrabalho. É apontada na literatura como uma das heurísticas mais eficientes para coloração de grafos.

Custo: O(n² + m) — a seleção do próximo vértice é linear em n por iteração. Não garante χ(G).

No simulador, cada passo mostra o ρ do vértice escolhido, as cores bloqueadas pelos vizinhos e a justificativa textual.`
  },
  'welsh-powell': {
    titulo: 'Welsh-Powell (1967)',
    corpo: `Algoritmo em duas fases:

1. Ordene os vértices por **grau decrescente**: d(v₁) ≥ d(v₂) ≥ … ≥ d(v_n).
2. Para cada cor k = 1, 2, …, varra a lista ordenada colorindo, de forma gulosa, todo vértice ainda sem cor que **não seja adjacente** a nenhum vértice já colorido com k.

Cada varredura produz uma **classe de cor** (conjunto independente) e a lista ordenada nunca é reordenada.

Por que funciona: processar primeiro os vértices de maior grau "esgota" as cores caras cedo; como o grafo decai em grau, a maioria dos vértices posteriores encontra classes já existentes, e o número de cores tende a ficar próximo do mínimo.

Custo: O(n log n + m) — melhor assintoticamente que o guloso sequencial. Não garante χ(G).`
  },
  greedy: {
    titulo: 'Guloso Sequencial (First-Fit)',
    corpo: `A heurística mais simples: processa os vértices **na ordem natural** (1, 2, …, n) e dá a cada um a menor cor que não esteja em uso por nenhum vizinho já colorido.

- É a base do limite **χ(G) ≤ Δ(G) + 1**: como cada vértice tem no máximo Δ vizinhos, no máximo Δ cores estão bloqueadas e sempre sobra uma cor até a (Δ+1)-ésima.
- Custo: O(n + m).
- É a mais frágil das três: a ordem de entrada decide o resultado, e em grafos densos ela erra bastante (basta trocar a ordem de dois vértices para o número de cores mudar).
- Serve como **linha de base** para julgar se uma heurística sophisticated (DSatur, Welsh-Powell) está realmente agregando.`
  },
  exata: {
    titulo: 'Coloração exata (branch-and-bound)',
    corpo: `Para obter χ(G) o simulador usa **branch-and-bound**: para k = ω(G), ω(G)+1, …, testa se existe coloração própria com k cores, por busca retroativa (backtracking):

1. Vertices são ordenados por grau decrescente, para que os casos difíceis venham primeiro.
2. Ao colorir um vértice, calcula-se o conjunto de cores proibidas pelos vizinhos já coloridos e experimentam-se apenas as cores viáveis.
3. Se a busca falha para todo o ramo, volta ("backtrack") e tenta a próxima cor. A primeira k que fecha a busca é χ(G).

O custo é exponencial no pior caso — e isso é inevitável: decidir se χ(G) ≤ k para k ≥ 3 é **NP-completo** (Karp, 1972). Ver χ(G) ≤ 2, porém, é linear (basta uma BFS de bipartição).

Na prática: use a coloração exata para grafos pequenos (referência) e as heurísticas para grafos grandes, medindo o *gap* contra o χ exato quando ele for conhecido.`
  },
  complexidade: {
    titulo: 'Complexidade computacional',
    corpo: `| Problema | Classe | Observação |
|---|---|---|
| Verificar se χ(G) ≤ 2 | P (linear) | BFS de bipartição: sem ciclo ímpar ⟺ 2-colorável |
| χ(G) ≤ 3 | NP-completo | Karp (1972) |
| χ(G) ≤ k para k ≥ 3 | NP-completo | Karp (1972) |
| Coloração exata (χ) | EXPTIME na prática | backtracking com corte por ω e por Δ+1 |
| DSatur | O(n² + m) | seleção do vértice é linear em n por passo |
| Welsh-Powell | O(n log n + m) | ordenação + varreduras |
| Guloso sequencial | O(n + m) | uma passada |

Por que as heurísticas existem: em aplicações reais (alocação de registradores em compiladores, escalonamento de horários, particionamento de frequência, coloração de mapas) o grafo tem milhares de vértices, onde o exato é inviável — e uma coloração válida com poucas cores costuma bastar.`
  },
  aplicacoes: {
    titulo: 'Aplicações da coloração de grafos',
    corpo: `- **Alocação de registradores** em compiladores: vértices = variáveis, arestas =live ranges que se sobrepõem; cores = registradores físicos. Minimizar cores = minimizar pressão de registradores.
- **Escalonamento de horários / timetabling**: vértices = aulas, arestas = conflitos de horário; cores = salas ou horários.
- **Coloração de mapas** (Quatro Cores): vértices = países, arestas = fronteiras comuns.
- **Particionamento de frequência** em rádios: vértices = canais, arestas = interferência.
- **Detecção de conflitos** em qualquer grafo de dependências (o "Modo Desafio" do simulador é exatamente isso: colorir manualmente com o mínimo de cores para revelar se o grafo esconde um conflito).`
  },
  aplicacoes_extra: null,
};

delete TEMAS.aplicacoes_extra;

export function listarTemas() {
  return Object.entries(TEMAS).map(([id, t]) => ({ id, titulo: t.titulo }));
}

export function buscarTema(tema) {
  const chave = String(tema || '').trim().toLowerCase();
  const normalizado = chave
    .replace(/[_\s]+/g, '-')
    .replace('welsh-powell', 'welsh-powell')
    .replace('greedy-sequencial', 'greedy')
    .replace('guloso', 'greedy')
    .replace('coloracao', 'visao-geral')
    .replace('coloração', 'visao-geral');
  if (TEMAS[normalizado]) return TEMAS[normalizado];
  const aproximacao = Object.entries(TEMAS).find(([id]) => id.includes(normalizado) || normalizado.includes(id));
  if (aproximacao) return aproximacao[1];
  return null;
}
