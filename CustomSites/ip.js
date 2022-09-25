export default {
  title: 'Your IP',
  run: function (res, req) {
    res.send(req.ip);
  }
}