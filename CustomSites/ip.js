export default {
  title: 'Your IP',

  /**@param {Res}res @param {Req}req*/
  run: function (res, req) {
    res.send(req.header('x-forwarded-for') || req.socket.remoteAddress || 'unknown');
  }
};