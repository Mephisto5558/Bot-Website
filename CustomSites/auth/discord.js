import passport from 'passport';

export default {
  /**@param {Res}res @param {Req}req @param {import('express').NextFunction}next*/
  run: (res, req, next) => {
    if (req.query.redirectURL) req.session.redirectURL = req.query.redirectURL;
    return passport.authenticate('discord')(req, res, next);
  }
};