const Joi = require('joi');

const viewportSchema = Joi.object({
  width: Joi.number().integer().min(320).max(3840).default(1280),
  height: Joi.number().integer().min(480).max(2160).default(720),
  deviceScaleFactor: Joi.number().min(1).max(3).default(1),
});

const screenshotSchema = Joi.object({
  url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
  format: Joi.string().valid('base64', 'link').default('base64'),
  fullPage: Joi.boolean().default(false),
  quality: Joi.number().integer().min(1).max(100),
  viewport: viewportSchema,
  waitUntil: Joi.string()
    .valid('load', 'domcontentloaded', 'networkidle0', 'networkidle2')
    .default('networkidle2'),
  timeout: Joi.number().integer().min(3000).max(45000).default(15000),
  cache: Joi.boolean().default(false),
  cacheTtlMs: Joi.number().integer().min(1000).max(600000),
  headers: Joi.object().pattern(Joi.string(), Joi.string()).default({}),
  cookies: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        value: Joi.string().required(),
        domain: Joi.string(),
        path: Joi.string(),
        httpOnly: Joi.boolean(),
        secure: Joi.boolean(),
      }),
    )
    .default([]),
});

module.exports = {
  screenshotSchema,
};
