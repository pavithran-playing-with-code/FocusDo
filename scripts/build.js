const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();  // ← reads .env

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'build');
const publicDir = path.join(root, 'public');

function run(cmd) {
    console.log(`\n▶ ${cmd}`);
    execSync(cmd, { stdio: 'inherit', cwd: root });
}

function copyFile(src, dest) {
    fs.copyFileSync(src, dest);
    console.log(`✔ Copied ${path.basename(src)} → ${path.relative(root, dest)}`);
}

function copyDir(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
        const srcFile = path.join(src, file);
        const destFile = path.join(dest, file);
        if (fs.statSync(srcFile).isDirectory()) {
            copyDir(srcFile, destFile);
        } else {
            fs.copyFileSync(srcFile, destFile);
        }
    }
}

// ── Auto-generate config.js from .env ────────────────────────────────────────
function generateConfig(destDir) {
    const apiBase = process.env.REACT_APP_API || 'http://localhost:5050/api';
    const content = `// Auto-generated at build time from .env — do not edit manually\nconst FOCUSDO_API = "${apiBase}";\n`;
    fs.writeFileSync(path.join(destDir, 'config.js'), content);
    console.log(`✔ Generated config.js with API = ${apiBase}`);
}

// ── Step 1: React build ───────────────────────────────────────────────────────
console.log('\n🔨 Building React app...');
run('react-scripts build');

// ── Step 2: Chrome build ──────────────────────────────────────────────────────
console.log('\n📦 Creating Chrome build...');
const chromeDir = path.join(root, 'build-chrome');
if (fs.existsSync(chromeDir)) fs.rmSync(chromeDir, { recursive: true });
copyDir(buildDir, chromeDir);
copyFile(path.join(publicDir, 'manifest.chromium.json'), path.join(chromeDir, 'manifest.json'));
copyFile(path.join(publicDir, 'background.chromium.js'), path.join(chromeDir, 'background.js'));
generateConfig(chromeDir);  // ← writes config.js with value from .env
console.log('✅ Chrome build ready → build-chrome/');

// ── Step 3: Firefox build ─────────────────────────────────────────────────────
console.log('\n📦 Creating Firefox build...');
const firefoxDir = path.join(root, 'build-firefox');
if (fs.existsSync(firefoxDir)) fs.rmSync(firefoxDir, { recursive: true });
copyDir(buildDir, firefoxDir);
copyFile(path.join(publicDir, 'manifest.firefox.json'), path.join(firefoxDir, 'manifest.json'));
copyFile(path.join(publicDir, 'background.firefox.js'), path.join(firefoxDir, 'background.js'));
generateConfig(firefoxDir);  // ← writes config.js with value from .env
console.log('✅ Firefox build ready → build-firefox/');

console.log('\n🚀 All builds complete!\n');
console.log('  Chrome/Edge/Brave/Opera → load build-chrome/');
console.log('  Firefox                 → load build-firefox/');