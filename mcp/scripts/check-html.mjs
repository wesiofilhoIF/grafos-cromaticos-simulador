/**
 * Valida a sintaxe do simulador sem abrir navegador:
 * extrai o bloco <script type="text/babel">, transpila o JSX com Babel e
 * compila o resultado. Erro de JSX aparece aqui, com linha e coluna.
 *
 * Uso: node scripts/check-html.mjs [caminho/do/html]
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from '@babel/standalone';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const alvo = resolve(process.argv[2] ?? resolve(RAIZ, '..', 'simulador_grafos_cromaticos.html'));

const html = readFileSync(alvo, 'utf8');

const blocos = [...html.matchAll(/<script type="text\/babel">([\s\S]*?)<\/script>/g)];
if (blocos.length === 0) {
  console.error(`Nenhum bloco <script type="text/babel"> encontrado em ${alvo}`);
  process.exit(1);
}

let falhou = false;
blocos.forEach((bloco, indice) => {
  const codigo = bloco[1];
  const linhaInicial = html.slice(0, bloco.index).split('\n').length;
  try {
    const { code } = transform(codigo, {
      presets: [['react', { runtime: 'classic' }]],
      sourceType: 'script',
      filename: 'simulador.jsx',
    });
    // Compila (sem executar) para pegar erro de sintaxe no JS gerado.
    new Function(code);
    console.log(`✔ bloco ${indice + 1}: JSX válido (${codigo.split('\n').length} linhas de origem)`);
  } catch (erro) {
    falhou = true;
    const linha = erro.loc?.line ?? erro.message.match(/line (\d+)/)?.[1] ?? '?';
    console.error(`✖ bloco ${indice + 1}: ${erro.message}`);
    console.error(`  linha no HTML ≈ ${Number(linha) + linhaInicial}`);
  }
});

process.exit(falhou ? 1 : 0);
