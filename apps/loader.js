import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Router } from 'express';
import { statisticsCollector } from '../middlewares/statisticsCollector.js';
import { registerApi, generateJson } from '../models/statistics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @param {import('express').Express} app Express实例
 * @returns {Promise<void>}
 */
export const loadApps = async (app) => {
  const entries = await fs.readdir(__dirname, { withFileTypes: true });
  const metas = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const modulePath = path.join(__dirname, entry.name, 'index.js');
    const moduleUrl = pathToFileURL(modulePath);
    const mod = await import(moduleUrl.href);
    const definition = mod.default;
    if (!definition) {
      // eslint-disable-next-line no-continue
      continue;
    }
    const router = Router();
    router.use(statisticsCollector(definition.id));
    router.use(definition.router);
    await registerApi(definition.id);
    app.use(definition.basePath, router);
    metas.push({
      id: definition.id,
      name: definition.name,
      desc: definition.desc,
      status: definition.status || 'normal',
      link: definition.link,
    });
  }
  await generateJson(metas);
};

export default loadApps;
