import passport from 'passport';

export default {
  run: async (res, req, next) => passport.authenticate('discord', (err, user) => {
    if (err) return next(err);
    if (!user) return res.redirect('/auth/discord');

    let redirectURL;
    if (req.session.redirectURL) {
      redirectURL = req.session.redirectURL;
      delete req.session.redirectURL;
    }

    req.logIn(user, err => err ? next(err) : res.redirect(redirectURL || '/'));
  })(req, res, next)
};