class Amazons {
  constructor(match_id, players, board) {
    this.match_id = match_id;
    this.players  = players;
    this.board    = board;
  }

  begin(clients) {
    for (let i = 0; i < this.players.length; i++) {
      clients[this.players[i].id].socket.emit('match_begin', {
        match_id: this.match_id,
        board:    this.board });
    }
  }

  emitBoard(clients) {
    for (let i = 0; i < this.players.length; i++) {
      clients[this.players[i].id].socket.emit('board_update', {
        match_id: this.match_id,
        board:    this.board });
    }
  }
}

module.exports = Amazons;
