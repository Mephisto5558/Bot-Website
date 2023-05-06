export default {
  method: 'POST',
  run: function run(res, req) { return this.voteSystem.add(req.body?.title, req.body?.description, req.body?.authorId).then(e => res.status(e.errorCode || 200).json(e)); }
};