export default {
  method: 'POST',
  run: function run(res, req) { return this.voteSystem.update(req.body, req.user?.id).then(e => res.status(e.errorCode || 200).json(e)); }
};