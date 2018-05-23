class hexdump {

  static u8Array2hex(u8Array) {
    return Array.prototype.map.call(u8Array, x => ('00' + x.toString(16)).slice(-2)).join(' ');
  }


}
module.exports = hexdump

