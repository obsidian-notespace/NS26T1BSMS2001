const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SEARCH_DIRS = ['sol', 'src'];
const OUTPUT_FILE = path.join(ROOT, 'index.js');

async function walk(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await walk(fullPath));
        } else if (entry.isFile()) {
            const lowerName = entry.name.toLowerCase();
            if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
                files.push(fullPath);
            }
        }
    }
    return files;
}

function normalizePath(filePath) {
    const relativePath = path.relative(ROOT, filePath);
    return relativePath.split(path.sep).join('/');
}

async function main() {
    const htmlFiles = [];
    for (const dirName of SEARCH_DIRS) {
        const dirPath = path.join(ROOT, dirName);
        if (!fs.existsSync(dirPath)) continue;
        const found = await walk(dirPath);
        htmlFiles.push(...found);
    }

    htmlFiles.sort((a, b) => normalizePath(a).localeCompare(normalizePath(b), undefined, { numeric: true, sensitivity: 'base' }));

    const payload = htmlFiles.map(filePath => ({ path: normalizePath(filePath) }));
    const content = `window.htmlFiles = ${JSON.stringify(payload, null, 4)};\n`;
    await fs.promises.writeFile(OUTPUT_FILE, content, 'utf8');
    console.log(`Generated ${payload.length} HTML file entries in ${OUTPUT_FILE}`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});