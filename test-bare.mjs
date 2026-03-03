import { createServer } from 'node:http';
const s = createServer((req, res) => { res.writeHead(200); res.end('ok'); });
s.listen(4580, '0.0.0.0', () => console.log('bound', s.address()));
