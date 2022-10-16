export default {
  title: 'Your IP',
  run: function (res, req) {
    res.send(req.header('x-forwarded-for') || req.socket.remoteAddress || 'unknown');
  }
}