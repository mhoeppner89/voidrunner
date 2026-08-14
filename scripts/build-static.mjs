import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
execFileSync('tsc', ['-p', join(root, 'tsconfig.static.json')], { cwd: root, stdio: 'inherit' });

const addJsExtension = (source) => source.replace(
  /(\bfrom\s*['"]|\bimport\s*['"])(\.{1,2}\/[^'"]+)(['"])/g,
  (match, prefix, specifier, quote) => {
    const tail = specifier.split('/').at(-1) ?? '';
    return extname(tail) ? match : `${prefix}${specifier}.js${quote}`;
  },
);

const visit = (directory) => {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) visit(path);
    else if (path.endsWith('.js')) writeFileSync(path, addJsExtension(readFileSync(path, 'utf8')));
  }
};
visit(join(dist, 'src'));

cpSync(join(root, 'src', 'style.css'), join(dist, 'src', 'style.css'));
if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), dist, { recursive: true });

const index = readFileSync(join(root, 'index.html'), 'utf8')
  .replace('src="/src/main.ts"', 'src="./src/main.js"');
writeFileSync(join(dist, 'index.html'), index);

for (const file of ['README.md', 'PLAYABLE_README.md', 'RELEASE_NOTES_v0.2.0.md', 'THIRD_PARTY_NOTICES.md']) {
  if (existsSync(join(root, file))) cpSync(join(root, file), join(dist, file));
}
console.log(`Static build written to ${dist}`);
