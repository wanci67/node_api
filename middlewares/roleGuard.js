/**
 * @param {Array<string>} roles 允许角色
 * @returns {import('express').RequestHandler} 角色校验
 */
export const requireRole = (roles) => (req, res, next) => {
  const user = res.locals.user;
  if (!user || !roles.includes(user.role)) {
    return res.status(403).json({ message: '权限不足' });
  }
  return next();
};

export default requireRole;
