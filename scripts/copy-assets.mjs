// Copia arquivos de bibliotecas que precisam ser servidos como estáticos (worker do pdf.js).
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('src/assets/vendor', { recursive: true });
copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'src/assets/vendor/pdf.worker.min.mjs');
console.log('assets/vendor atualizados');
