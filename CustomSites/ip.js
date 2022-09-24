export default {
  run: function (req, res) {
    res.send(req.ip);
  }
}