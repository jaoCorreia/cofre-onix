// Gera a versão web e copia para docs/app (servida pelo GitHub Pages em /cofre-onix/app/).
import { execSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
execSync('npx ng build --base-href /cofre-onix/app/', { stdio: 'inherit' });
rmSync('docs/app', { recursive: true, force: true });
cpSync('www', 'docs/app', { recursive: true });
console.log('docs/app atualizado');
