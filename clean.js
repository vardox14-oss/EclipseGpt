const fs = require('fs');
const path = require('path');

function stripComments(content, isCSS = false) {
    if (isCSS) {
        return content.replace(/\/\*[\s\S]*?\*\//g, '');
    }
    // Remove block comments
    let stripped = content.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove line comments, properly ignoring URLs like http:// or https://
    stripped = stripped.replace(/(?<!https?:)\/\/.*$/gm, '');
    // Remove HTML comments
    stripped = stripped.replace(/<!--[\s\S]*?-->/g, '');
    // Remove excess whitespace left by removed comments
    stripped = stripped.replace(/\n\s*\n\s*\n/g, '\n\n');
    return stripped;
}

function processDir(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file === 'node_modules' || file === '.git' || file === '.wrangler' || file === 'migrations') return;
            processDir(fullPath);
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.html')) {
            let str = fs.readFileSync(fullPath, 'utf8');
            str = stripComments(str, false);
            fs.writeFileSync(fullPath, str);
            console.log("Stripped JS/HTML: " + fullPath);
        } else if (fullPath.endsWith('.css')) {
            let str = fs.readFileSync(fullPath, 'utf8');
            str = stripComments(str, true);
            fs.writeFileSync(fullPath, str);
            console.log("Stripped CSS: " + fullPath);
        }
    });
}

processDir(path.join(__dirname, 'src'));
processDir(path.join(__dirname, 'public'));
