/**
 * @param {import('joi').Schema} schema Joi校验规则
 * @param {'body'|'query'|'params'} [property='body'] 校验字段
 * @returns {import('express').RequestHandler} Joi校验中间件
 */
export const validate = (schema, property = 'body') => async (req, res, next) => {
  try {
    const value = await schema.validateAsync(req[property], { abortEarly: false, stripUnknown: true });
    req[property] = value;
    next();
  } catch (error) {
    res.status(400).json({ message: '参数校验失败', details: error.details });
  }
};

export default validate;
