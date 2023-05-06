import passport from 'passport';

export default {
  run: (res, req, next) => {
    if (req.query.redirectURL) req.session.redirectURL = req.query.redirectURL;
    return passport.authenticate('discord')(req, res, next);
  }
};