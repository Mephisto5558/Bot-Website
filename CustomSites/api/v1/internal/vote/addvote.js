export default {
  run: function run(res, req) { return this.voteSystem.addVote(req.query.featureId, req.user?.id, 'up').then(e => res.status(e.errorCode || 200).json(e)); }
};