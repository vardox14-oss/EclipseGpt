import http from 'http';

const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
const dummyData = 'A'.repeat(25 * 1024 * 1024); // 25 MB payload

const payload = JSON.stringify({
    messages: [
        {
            role: 'user', content: [
                { type: 'text', text: 'hello' },
                { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + dummyData } }
            ]
        }
    ],
    mode: 'normal'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/chat',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
};

const req = http.request(options, (res) => {
    let raw = '';
    res.on('data', (chunk) => raw += chunk);
    res.on('end', () => console.log('Response:', res.statusCode, raw));
});

req.on('error', (e) => console.error('Req Error:', e.message));
req.write(payload);
req.end();
