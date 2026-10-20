# Simulador de Grafos Cromáticos — MCP

Servidor MCP que expõe o **motor real** do simulador web
(`wesiofilhoIF/grafos-cromaticos-simulador`) como ferramentas, para que um agente
produza explicações de Teoria dos Grafos (coloração de vértices) ancoradas em
cálculos reais — não em texto genérico.

## Como funciona

O simulador é um HTML único com React/Babel. Em vez de **duplicar** os algoritmos
em JavaScript aqui, o servidor **extrai** do HTML os trechos de JS puro
(paleta, presets, catálogo de algoritmos, `analyzeGraphStructure`,
`evaluateColoring`, `generateDsaturSimulation`, `generateWelshPowellSimulation`,
`generateGreedySimulation`, `generateExactSimulation` e `buildExplainMarkdown`)
e os avalia em memória. Consequências:

- o MCP sempre reflete o simulador — uma correção no HTML vale para o MCP;
- se o HTML mudar e um símbolo sumir, a extração falha com erro explícito;
- o valor de χ(G) é o do branch-and-bound do próprio simulador;
- o relatório Markdown do MCP é **o mesmo texto** que o botão "Explicação" da tela.

## Ferramentas

| Ferramenta | O que faz |
| --- | --- |
| `listar_presets` | Grafos clássicos (Petersen, Grötzsch, K5, K3,3, C5, Q3) com \|V\|, \|E\| e χ. |
| `analisar_grafo` | Invariantes: \|V\|, \|E\|, Δ, δ, densidade, ω, χ exato, bipartição, ciclo ímpar, grau por vértice. |
| `simular_coloracao` | Roda DSatur / Welsh-Powell / Guloso / Exata (ou todos) e devolve coloração, classes de cor, nº de cores, folga sobre χ e a justificativa de cada passo. |
| `comparar_algoritmos` | Roda os quatro algoritmos no mesmo grafo e compara cores usadas, folga sobre χ, validade, nº de passos e tempo. |
| `dica_coloracao` | Sugere o próximo vértice a colorar e a cor viável, com a justificativa (seleção DSatur). Aceita um estado parcial via `cores`. |
| `relatorio_markdown` | O relatório Markdown do simulador: invariantes, classes de cor, passo a passo e conclusões. |
| `explicar` | Texto didático de um tema (dsatur, welsh-powell, greedy, exata, chi, omega, delta, bipartido, complexidade, aplicacoes, visao-geral), opcionalmente ancorado num exemplo calculado. |
| `desenhar_grafo` | SVG do grafo com a coloração aplicada, para ilustrar a explicação. |

Seletor de grafo (comum a todas as ferramentas):

- `preset`: `petersen` \| `grotzsch` \| `k5` \| `k33` \| `cycle5` \| `cube`
- `tipo`: `completo` (K(n)) \| `ciclo` (C(n)) \| `bipartido` (K(a,b)) \| `aleatorio` (G(n,p))
- `arestas`: lista de pares `[u, v]` com índices 0-based

## Instalação e registro

```bash
cd mcp
npm install
npm test
```

Registro no OMP (`~/.omp/agent/mcp.json`):

```json
{
  "mcpServers": {
    "simulador-grafos": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/Users/2025105231940019/mcp/grafos-cromaticos-simulador/mcp/src/server.js"]
    }
  }
}
```

Depois, `/mcp reload` na sessão do OMP (ou reinicie o harness).

Registro no OpenCode (`~/.config/opencode/opencode.json`):

```json
"mcp": {
  "simulador-grafos": {
    "type": "local",
    "command": ["node", "C:/Users/2025105231940019/mcp/grafos-cromaticos-simulador/mcp/src/server.js"]
  }
}
```

## Variáveis de ambiente

| Variável | Efeito |
| --- | --- |
| `SIMULADOR_GRAFOS_HTML` | Caminho explícito do HTML do simulador. Sem ela, o servidor usa `../../simulador_grafos_cromaticos.html` (raiz do repositório), depois o cache local e, por último, baixa do GitHub. |

## O simulador no navegador

O simulador também roda como web app (`server.js` na raiz do repositório, porta 8080,
`0.0.0.0`). Para o agente **agir dentro da aba do navegador do usuário** — sem abrir
um navegador novo e sem deixar processo em background — existem dois caminhos, ambos
opcionais e fora do fluxo padrão (o MCP resolve tudo sem navegador):

### Extensão OMP Browser Relay (Chrome, Edge, Brave — qualquer profile)

```bash
omp browser-relay install   # escreve a extensão em ~/.omp/browser-relay/extension
```

Depois, em cada navegador: `chrome://extensions` → **Modo do desenvolvedor** →
**Carregar extensão não empacotada** → selecione
`~/.omp/browser-relay/extension`. O badge da extensão fica "on" quando ela
encontra um relé (`omp browser-relay`). A partir daí o agente controla as abas
**daquele** navegador — o usuário abre, fecha e troca de aba à vontade.

Nota: Chrome 137+ ignora `--load-extension`, então a extensão precisa ser
carregada à mão.

### CDP (navegador dedicado com porta de debugging)

```bash
chrome.exe --user-data-dir=%LOCALAPPDATA%\omp-browser-chrome --remote-debugging-port=9222 http://localhost:8080/
omp config set browser.cdpUrl http://127.0.0.1:9222
```

Funciona, mas abre uma instância separada do navegador — por isso não é o padrão.

## Testes

`npm test` executa:

- `test/motor.test.mjs` — invariantes matemáticos dos grafos clássicos (χ, ω, bipartição) e validade das colorações.
- `test/servidor.test.mjs` — handshake MCP real via stdio: lista de ferramentas e uma chamada por ferramenta, incluindo caminhos de erro.

`npm run check:html` valida a sintaxe do JSX do simulador **sem abrir navegador**:
extrai o bloco `<script type="text/babel">`, transpila com Babel e compila o
resultado — erro de JSX aparece com a linha do HTML.
