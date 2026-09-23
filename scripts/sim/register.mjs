// Lets plain Node (>=22, native TS type stripping) run src/game/*.ts whose imports omit the .ts extension.
import { register } from 'node:module';
register('./resolve.mjs', import.meta.url);
