class Amazons {
  constructor(match_id, players, board) {
    this.match_id = match_id;
    this.players  = players;
    this.board    = board;

    this.turn = 0;
  }

  begin(clients) {
    for (let i = 0; i < this.players.length; i++) {
      clients[this.players[i].id].socket.emit('match_begin', {
        match_id: this.match_id,
        board:    this.board,
        players:  this.players });
    }
  }

  emitBoard(clients) {
    for (let i = 0; i < this.players.length; i++) {
      clients[this.players[i].id].socket.emit('board_update', {
        match_id: this.match_id,
        board:    this.board,
        players:  this.players,
        turn:     this.turn });
    }
  }

  setPlayer(client_id, internal_id) {
    // internal_id is the ID that concerns the board, i.e. 0 for player 1
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i].id == client_id) {
        this.players[i].internal_id = internal_id;
      }
    }
  }
}

module.exports = Amazons;
