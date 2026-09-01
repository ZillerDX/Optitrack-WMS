const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

console.log('Preparing Next.js standalone bundle for Electron packaging...');

const standaloneDir = path.resolve(__dirname, '..', 'frontend', '.next', 'standalone');
const publicDir = path.resolve(__dirname, '..', 'frontend', 'public');
const staticDir = path.resolve(__dirname, '..', 'frontend', '.next', 'static');

if (!fs.existsSync(standaloneDir)) {
  console.error('Error: frontend/.next/standalone does not exist. Please run next build first.');
  process.exit(1);
}

// Copy public
const destPublic = path.join(standaloneDir, 'public');
console.log(`Copying ${publicDir} -> ${destPublic}`);
copyFolderSync(publicDir, destPublic);

// Copy static
const destStatic = path.join(standaloneDir, '.next', 'static');
console.log(`Copying ${staticDir} -> ${destStatic}`);
copyFolderSync(staticDir, destStatic);

console.log('Standalone bundle prepared successfully!');