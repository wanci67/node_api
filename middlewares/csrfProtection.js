import csrf from 'csurf';

/**
 * @param {import('express').Express} app Express实例
 */
export const applyCsrfProtection = (app) => {
  const cookieName = process.env.CSRF_COOKIE_NAME || 'secure_csrf';
  app.use(
    csrf({
      cookie: {
        key: cookieName,
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
      },
    }),
  );
  app.use((req, res, next) => {
    res.cookie(cookieName, req.csrfToken(), {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
    next();
  });
};

export default applyCsrfProtection;
