import { fileURLToPath } from 'node:url';
import { createStaticServer } from './lib/staticServer.mjs';

const server = createStaticServer(fileURLToPath(new URL('..', import.meta.url)));
server.listen(4175, '127.0.0.1', () => {
  console.log('NewDeskTab test server: http://127.0.0.1:4175');
});
