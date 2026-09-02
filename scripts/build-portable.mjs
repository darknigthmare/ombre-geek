import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const [html, css, data, app, icon] = await Promise.all([
  read('index.html'),
  read('src/styles.css'),
  read('src/data.js'),
  read('src/app.js'),
  read('assets/icon.svg')
]);

const inlineScript = (source) => source.replaceAll('</script', '<\\/script');
const iconData = `data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}`;
const portable = html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${iconData}" type="image/svg+xml">`)
  .replace('<link rel="stylesheet" href="src/styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script src="src/data.js"></script>', `<script>\n${inlineScript(data)}\n</script>`)
  .replace('<script src="src/app.js"></script>', `<script>\n${inlineScript(app)}\n</script>`)
  .replace('</head>', '  <meta name="portable-build" content="1.1.0">\n</head>');

if (/\b(?:src\/|manifest\.webmanifest|assets\/icon\.svg)\b/.test(portable)) {
  throw new Error('Le build portable contient encore une dépendance locale.');
}

const output = resolve(root, 'OMBRE_GEEK_portable.html');
const previous = await readFile(output, 'utf8').catch(() => '');
if (previous !== portable) await writeFile(output, portable, 'utf8');
console.log(`Portable 1.1.0 généré : ${Buffer.byteLength(portable).toLocaleString('fr-FR')} octets`);
