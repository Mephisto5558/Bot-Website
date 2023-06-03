export default {
  run: function (res, req) { return this.voteSystem.delete(req.query.featureId, req.query.userId).then(e => res.status(e.errorCode || 200).json(e)); }
};