// Pilota o app web do Simulador pela INTERFACE do próprio app.
//
// O app é uma página React/Babel servida em http://127.0.0.1:8080/. Esta módulo
// fala CDP com o navegador que tem o app aberto e usa os PRÓPRIOS controles do app:
//
//   1. aba "Exportar / Importar"  -> 2. "Carregar JSON" (o input[type=file] do app)
//      -> o handleImportJSON do app monta o grafo -> 3. o app pinta o canvas.
//
// Nada é injetado no React: o estado entra pelo input de arquivo que o app já tem.
//
// Endpoint CDP: opts.cdpUrl > SIMULADOR_CDP_URL > detecção (DevToolsActivePort dos
// perfis do Chrome). Para uso em sala, abra o Chrome com o app e
// --remote-debugging-port=9222 (ou exporte SIMULADOR_CDP_URL).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ALVO_PADRAO = ['simulador_grafos_cromaticos', '127.0.0.1:8080', 'localhost:8080'];

// ------------------------------------------------------------------ endpoint
function detectarEndpoint() {
  const base = process.env.HOME || homedir();
  const candidatos = [
    join(base, '.config', 'google-chrome'),
    join(base, '.config', 'chromium'),
    join(base, '.config', 'microsoft-edge'),
  ];
  for (const dir of candidatos) {
    if (!existsSync(dir)) continue;
    const perfis = ['Default', 'Profile 1', 'Profile 2', 'novo-perfil'];
    for (const perfil of perfis) {
      const arq = join(dir, perfil, 'DevToolsActivePort');
      if (!existsSync(arq)) continue;
      const [porta, caminho] = readFileSync(arq, 'utf8').split('\n');
      if (!porta || !caminho) continue;
      return { porta: Number(porta.trim()), wsPath: caminho.trim() };
    }
  }
  return null;
}

function resolverEndpoint(cdpUrl) {
  if (cdpUrl) {
    const m = cdpUrl.match(/^wss?:\/\/[^/]+(\/.*)$/);
    if (m) {
      const porta = Number(cdpUrl.match(/:(\d+)/)?.[1]);
      return { porta, wsPath: m[1] };
    }
    const porta = Number(cdpUrl.match(/:(\d+)/)?.[1]);
    if (porta) return { porta, wsPath: null };
  }
  const env = process.env.SIMULADOR_CDP_URL;
  if (env) return resolverEndpoint(env);
  return detectarEndpoint();
}

// ------------------------------------------------------------ cliente CDP
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pendentes = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      const p = this.pendentes.get(msg.id);
      if (!p) return;
      this.pendentes.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || 'erro CDP'));
      else p.resolve(msg.result || {});
    });
  }

  send(method, params = {}, sessionId) {
    this.id += 1;
    const id = this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pendentes.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pendentes.has(id)) {
          this.pendentes.delete(id);
          reject(new Error(`timeout em ${method}`));
        }
      }, 20000);
    });
  }
}

async function conectar(endpoint) {
  if (!endpoint) throw new Error('sem endpoint CDP: use cdpUrl, SIMULADOR_CDP_URL ou um Chrome com DevToolsActivePort');
  let url;
  if (endpoint.wsPath) {
    url = `ws://127.0.0.1:${endpoint.porta}${endpoint.wsPath}`;
  } else {
    // sem wsPath: pega o websocket do browser em /json/version
    // (o Chrome 136+ removeu /json/list em algumas builds).
    const versao = await fetch(`http://127.0.0.1:${endpoint.porta}/json/version`)
      .then((r) => r.json())
      .catch(() => null);
    if (!versao?.webSocketDebuggerUrl) {
      throw new Error(`nenhum endpoint CDP em 127.0.0.1:${endpoint.porta} (o Chrome precisa de --remote-debugging-port)`);
    }
    url = versao.webSocketDebuggerUrl;
  }
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('falha ao conectar no WebSocket CDP')), { once: true });
  });
  return new Cdp(ws);
}

// ------------------------------------------------------------- app helpers
const JS_LIMPAR = `(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.innerText || '').trim() === 'Limpar Tudo');
  if (!b) return { ok: false, motivo: 'botao Limpar Tudo nao encontrado' };
  b.click();
  return { ok: true };
})()`;

const JS_ABRIR_ABA = `(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.innerText || '').trim().startsWith('Exportar / Importar'));
  if (!b) return { ok: false, motivo: 'aba Exportar/Importar nao encontrada' };
  b.click();
  return { ok: true };
})()`;

const JS_IMPORTAR = (spec) => `(() => {
  const spec = ${JSON.stringify(spec)};
  const input = document.querySelector('input[type=file]');
  if (!input) return { ok: false, motivo: 'input de arquivo do app nao encontrado' };
  const dt = new DataTransfer();
  dt.items.add(new File([JSON.stringify(spec)], 'grafo.json', { type: 'application/json' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
})()`;

const jsonDoApp = (nodes, edges, nome) => JSON.stringify({
  name: nome || 'Grafo Cromático',
  timestamp: new Date().toISOString(),
  nodes: nodes.map((n) => ({ id: n.id, label: n.label, x: n.x, y: n.y, color: n.color ?? null })),
  edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
});

// ------------------------------------------------------------------ público
export async function aplicarNoApp({ spec, cdpUrl, appUrl, algoritmo, executar = true, relatorio = true, limpar = true }) {
  const endpoint = resolverEndpoint(cdpUrl);
  const cdp = await conectar(endpoint);
  try {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const marcadores = appUrl ? [appUrl] : ALVO_PADRAO;
    const alvo = targetInfos.find((t) => t.type === 'page' && marcadores.some((m) => (t.url || '').includes(m)));
    if (!alvo) {
      const urls = targetInfos.filter((t) => t.type === 'page').map((t) => t.url);
      throw new Error(`nenhuma aba do simulador aberta no navegador (${marcadores.join(' | ')}). Abas abertas: ${urls.join(', ') || 'nenhuma'}`);
    }

    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: alvo.targetId, flatten: true });
    const avaliar = async (expressao) => {
      const r = await cdp.send('Runtime.evaluate', {
        expression: expressao, returnByValue: true, awaitPromise: true,
      }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'erro ao avaliar no app');
      return r.result?.value;
    };

    // 0) limpa o grafo atual (botao "Limpar Tudo" do proprio app)
    if (limpar) {
      const limpou = await avaliar(JS_LIMPAR);
      if (!limpou?.ok) throw new Error(limpou?.motivo || 'nao foi possivel limpar o grafo no app');
      await new Promise((r) => setTimeout(r, 500));
    }

    // 1) abre a aba "Exportar / Importar" (o app precisa renderizar o input)
    const aba = await avaliar(JS_ABRIR_ABA);
    if (!aba?.ok) throw new Error(aba?.motivo || 'nao foi possivel abrir a aba Exportar/Importar');
    await new Promise((r) => setTimeout(r, 700));

    // 2) importa o grafo pelo input[type=file] que o proprio app usa
    const imp = await avaliar(JS_IMPORTAR(spec.grafo));
    if (!imp || !imp.ok) throw new Error(imp?.motivo || 'falha ao importar no app');
    await new Promise((r) => setTimeout(r, 900));

    // roda o algoritmo pelos botoes do app
    let rods = null;
    if (executar) {
      rods = await avaliar(`(() => {
        // os botoes de algoritmo tem texto; o de rodar tudo e so icone (title)
        const cliqueTexto = (t) => {
          const b = [...document.querySelectorAll('button')].find(x => (x.innerText || '').trim().startsWith(t));
          if (!b) return false;
          b.click();
          return true;
        };
        const cliqueTitulo = (t) => {
          const b = [...document.querySelectorAll('button')].find(x => (x.title || '') === t);
          if (!b) return false;
          b.click();
          return true;
        };
        const alg = ${JSON.stringify(algoritmo || '')};
        const clicouAlgoritmo = alg ? cliqueTexto(alg) : false;
        const rodou = cliqueTitulo('Executar Tudo Instantâneo');
        return { rodou, clicouAlgoritmo, alg };
      })()`);
      await new Promise((r) => setTimeout(r, 1200));
    }

    // estado final do app: classes de cor e relatorio (o texto do painel "Explicacao")
    const estado = await avaliar(`(() => {
      const classes = [...document.querySelectorAll('span,div')]
        .map(e => (e.innerText || '').trim())
        .filter(t => /^C\\d+ · /.test(t));
      const contador = [...document.querySelectorAll('span')].map(s => (s.innerText || '').trim()).find(t => /^\\d+ \\/ \\d+$/.test(t)) || null;
      const abas = [...document.querySelectorAll('button')].map(b => (b.innerText || '').trim())
        .filter(t => /^(Matriz|Tabela|Classes)/.test(t));
      return { classes: [...new Set(classes)], contador, abas };
    })()`);

    let relatorioMd = null;
    if (relatorio) {
      const abriu = await avaliar(`(() => {
        const b = [...document.querySelectorAll('button')].find(x => (x.title || '').startsWith('Gera um relat'));
        if (!b) return false;
        b.click();
        return true;
      })()`);
      if (abriu) {
        await new Promise((r) => setTimeout(r, 700));
        relatorioMd = await avaliar(`(() => {
          const m = document.querySelector('div.fixed.inset-0.z-50');
          if (!m) return null;
          const pre = m.querySelector('pre');
          if (pre) return pre.innerText;
          const ta = m.querySelector('textarea');
          return ta ? ta.value : null;
        })()`);
      }
    }

    // as classes de cor saem do texto do relatorio do app (o painel mostra markdown)
    const classesDoRelatorio = (relatorioMd || '').match(/\*\*C\d+ · [^*]+\*\*/g) || [];
    estado.classes = [...new Set(classesDoRelatorio)];

    return { ok: true, url: alvo.url, alvo: alvo.title, rods, estado, relatorio: relatorioMd };
  } finally {
    try { cdp.ws.close(); } catch { /* ignore */ }
  }
}
