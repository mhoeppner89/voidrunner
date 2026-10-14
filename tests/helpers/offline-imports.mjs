import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./offline-three-loader.mjs', pathToFileURL(import.meta.filename));
