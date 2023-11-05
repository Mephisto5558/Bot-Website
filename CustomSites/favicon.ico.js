export default {
  /**@this Client @param {Res}res*/
  run: function (res) { res.redirect(this.user.displayAvatarURL()); }
};