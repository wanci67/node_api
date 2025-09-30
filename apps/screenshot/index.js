import { Router } from 'express';
import Joi from 'joi';
import puppeteer from 'puppeteer';
import { success, failure } from '../../utils/response.js';
import validate from '../../middlewares/validation.js';
import { recordAudit } from '../../models/auditTrail.js';

const router = Router();

const schema = Joi.object({
  url: Joi.string().uri().required(),
  fullPage: Joi.boolean().default(true),
  viewportWidth: Joi.number().integer().min(320).max(3840).default(1280),
  viewportHeight: Joi.number().integer().min(480).max(2160).default(720),
  responseType: Joi.string().valid('base64', 'buffer').default('base64'),
});

router.post('/', validate(schema), async (req, res) => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: req.body.viewportWidth,
      height: req.body.viewportHeight,
    });
    await page.goto(req.body.url, { waitUntil: 'networkidle2', timeout: 60000 });
    const screenshot = await page.screenshot({
      fullPage: req.body.fullPage,
      type: 'png',
      encoding: req.body.responseType === 'base64' ? 'base64' : 'binary',
    });
    await recordAudit({
      action: 'SCREENSHOT_CAPTURE',
      userId: res.locals.user?.id || null,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      detail: { url: req.body.url },
    });
    if (req.body.responseType === 'base64') {
      success(res, { image: screenshot });
    } else {
      res.setHeader('Content-Type', 'image/png');
      res.send(screenshot);
    }
  } catch (error) {
    failure(res, '截图失败', 500);
  } finally {
    await browser.close();
  }
});

export default {
  id: 'screenshot',
  name: '网页截图',
  desc: '通过Chromium渲染网页并返回截图。',
  status: 'normal',
  link: './Interfaces.html#screenshot',
  basePath: '/screenshot',
  router,
};
