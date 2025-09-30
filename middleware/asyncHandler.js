/**
 * @param {(req: import('express').Request, res: import('express').Response) => Promise<any>} fn 异步控制器
 * @returns {import('express').RequestHandler}
 */
const asyncHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

module.exports = asyncHandler;
