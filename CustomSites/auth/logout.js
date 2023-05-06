export default {
  run: (res, req, next) => req.logOut(err => err ? next(err) : res.redirect('/'))
};