export default {
  run: (res, req) => res.json(req.user ?? { error: 401 })
};