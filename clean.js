const strip = require('strip-comments');
const fs = require('fs');
const path = require('path');

function processDir(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.js')) {
            let str = fs.readFileSync(fullPath, 'utf8');
            str = strip(str);
            str = str.replace(/\n\s*\n\s*\n/g, '\n\n'); // Clean up blank lines left by comments
            fs.writeFileSync(fullPath, str);
            console.log("Stripped JS: " + fullPath);
        } else if (fullPath.endsWith('.css')) {
            let str = fs.readFileSync(fullPath, 'utf8');
            str = strip.block(str);
            fs.writeFileSync(fullPath, str);
            console.log("Stripped CSS: " + fullPath);
        } else if (fullPath.endsWith('.html')) {
            let str = fs.readFileSync(fullPath, 'utf8');
            // Remove HTML comments
            str = str.replace(/<!--[\s\S]*?-->/g, '');
            // Simple JS inline block comment removal (very basic, but works for our simple script tags)
            str = str.replace(/\/\*[\s\S]*?\*\//g, '');
            fs.writeFileSync(fullPath, str);
            console.log("Stripped HTML: " + fullPath);
        }
    });
}

processDir(path.join(__dirname, 'src'));
processDir(path.join(__dirname, 'public'));
