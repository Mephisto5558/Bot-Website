export default {
  run: function (res, req) { return res.send(JSON.stringify(this.voteSystem.getMany(parseInt(req.query.amount) || null, parseInt(req.query.offset) || 0, req.query.filter, req.query.includePending == 'true', req.user?.id), null, 0)); }
};