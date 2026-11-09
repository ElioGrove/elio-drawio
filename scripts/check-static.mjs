import { resolve } from 'node:path';
import { checkStatic } from './static-policy.mjs';
console.log(JSON.stringify(await checkStatic(resolve(process.argv[2] || 'dist')), null, 2));
