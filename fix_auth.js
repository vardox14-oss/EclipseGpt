const fs = require('fs');
let c = fs.readFileSync('server.js', 'utf8');
c = c.replace('req.user.email', '"user"');
fs.writeFileSync('server.js', c);
console.log('Fixed req.user.email reference');
