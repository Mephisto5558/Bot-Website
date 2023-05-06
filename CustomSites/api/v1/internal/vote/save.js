export default {
  method: 'POST',
  run: function run(res, req) { return this.voteSystem.addVote(req.body?.featureId, req.body?.userId, 'up').then(e => res.status(e.errorCode || 200).json(e)); }
};