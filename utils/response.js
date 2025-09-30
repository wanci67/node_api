/**
 * @param {import('express').Response} res 响应对象
 * @param {any} data 返回数据
 * @param {number} [status=200] 状态码
 */
export const success = (res, data, status = 200) => {
  res.status(status).json({ success: true, data });
};

/**
 * @param {import('express').Response} res 响应对象
 * @param {string} message 错误信息
 * @param {number} [status=400] 状态码
 */
export const failure = (res, message, status = 400) => {
  res.status(status).json({ success: false, message });
};

export default {
  success,
  failure,
};
