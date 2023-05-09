export default {
  run: function (res) { res.redirect(this.user.displayAvatarURL()); }
};