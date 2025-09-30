const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const { setCache, getCache } = require('./cache');
const { logger } = require('./logger');

let browserInstance;
let launchingPromise;

const screenshotDir = path.resolve(process.env.SCREENSHOT_DIR || 'storage/screenshots');

const ensureDirectory = async () => {
  await fs.mkdir(screenshotDir, { recursive: true });
};

/**
 * @returns {Promise<import('puppeteer').Browser>} 浏览器实例
 */
const getBrowser = async () => {
  if (browserInstance) {
    return browserInstance;
  }
  if (!launchingPromise) {
    launchingPromise = puppeteer.launch({
      headless: process.env.PUPPETEER_HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    });
  }
  browserInstance = await launchingPromise;
  launchingPromise = null;
  return browserInstance;
};

/**
 * @param {import('puppeteer').Browser} browser 浏览器实例
 * @returns {Promise<void>} 关闭浏览器
 */
const closeBrowser = async (browser) => {
  if (browser && browser.isConnected()) {
    await browser.close();
  }
  browserInstance = null;
};

/**
 * @param {object} options 截图参数
 * @param {string} options.url 需要渲染的 URL
 * @param {boolean} options.fullPage 是否截图完整页面
 * @param {import('puppeteer').Viewport} options.viewport 视口配置
 * @param {number} options.timeout 超时时间
 * @param {string} options.waitUntil 网络空闲条件
 * @param {'base64'|'link'} options.format 输出格式
 * @param {number} [options.quality] 图片质量
 * @param {boolean} options.cache 是否启用缓存
 * @param {number} [options.cacheTtlMs] 缓存过期时间
 * @param {Record<string,string>} options.headers 自定义请求头
 * @param {Array<import('puppeteer').Protocol.Network.CookieParam>} options.cookies Cookie 配置
 * @returns {Promise<{format: string, data?: string, url?: string, metadata: object}>}
 */
const captureScreenshot = async (options) => {
  const cacheKey = crypto.createHash('sha256').update(JSON.stringify(options)).digest('hex');
  if (options.cache) {
    const cached = getCache(cacheKey);
    if (cached) {
      return cached;
    }
  }

  await ensureDirectory();

  const browser = await getBrowser();
  const page = await browser.newPage();
  const start = performance.now();

  try {
    if (options.headers && Object.keys(options.headers).length > 0) {
      await page.setExtraHTTPHeaders(options.headers);
    }
    if (options.cookies && options.cookies.length > 0) {
      await page.setCookie(...options.cookies);
    }
    await page.setViewport(options.viewport);
    await page.goto(options.url, {
      waitUntil: options.waitUntil,
      timeout: options.timeout,
    });

    const screenshotOptions = {
      type: 'png',
      fullPage: options.fullPage,
      quality: options.quality,
      encoding: options.format === 'base64' ? 'base64' : 'binary',
    };

    let response;

    if (options.format === 'base64') {
      const base64Data = await page.screenshot(screenshotOptions);
      response = {
        format: 'base64',
        data: base64Data,
        metadata: {
          cacheKey,
          durationMs: performance.now() - start,
        },
      };
    } else {
      const buffer = await page.screenshot(screenshotOptions);
      const fileName = `${Date.now()}-${uuidv4()}.png`;
      const filePath = path.resolve(screenshotDir, fileName);
      await fs.writeFile(filePath, buffer);
      const baseUrl = process.env.RENDER_PUBLIC_BASE_URL || '';
      const publicPath = `/public/screenshots/${fileName}`;
      response = {
        format: 'link',
        url: baseUrl ? `${baseUrl.replace(/\/$/, '')}/${fileName}` : publicPath,
        metadata: {
          cacheKey,
          durationMs: performance.now() - start,
          filePath,
          publicPath,
        },
      };
    }

    if (options.cache) {
      setCache(cacheKey, response, options.cacheTtlMs);
    }

    return response;
  } catch (error) {
    if (process.env.AUTO_RECOVER_BROWSER === 'true') {
      await closeBrowser(browser);
    }
    logger.error('截图失败', {
      message: error.message,
      stack: error.stack,
    });
    throw error;
  } finally {
    await page.close();
  }
};

/**
 * @returns {Promise<void>} 释放浏览器资源
 */
const shutdown = async () => {
  if (browserInstance) {
    await closeBrowser(browserInstance);
  }
};

module.exports = {
  captureScreenshot,
  shutdown,
};
