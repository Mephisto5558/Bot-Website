export default {
  run: function (res, req) { return this.voteSystem.approve(req.query.featureId, req.user?.id).then(e => res.status(e.errorCode || 200).json(e)); }
};