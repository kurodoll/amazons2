class Client {
  constructor(id, socket) {
    this.id     = id;
    this.socket = socket;
  }

  setUsername(username) {
    this.username = username;
  }

  // Return whether the client has been initialized
  ready() {
    return (this.username != null);
  }
}

module.exports = Client;
