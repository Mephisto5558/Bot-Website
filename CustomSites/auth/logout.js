export default {
  /**@param {Res}res @param {Req}req @param {import('express').NextFunction}next*/
  run: (res, req, next) => req.logOut(err => err ? next(err) : res.redirect('/'))
};