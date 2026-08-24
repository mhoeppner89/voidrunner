import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./offlineThreeLoader.mjs', pathToFileURL(import.meta.filename));
