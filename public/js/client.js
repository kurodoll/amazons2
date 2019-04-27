class Client {
  constructor(id, socket) {
    this.id     = id;
    this.socket = socket;
  }

  setUsername(username) {
    this.username = username;
  }
}

module.exports = Client;
