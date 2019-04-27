class Amazons {
  constructor(match_id, players, board, game_logic) {
    this.match_id   = match_id;
    this.players    = players;
    this.board      = board;
    this.game_logic = game_logic;

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

  attemptMove(from, to) {
    if (this.board.board[from.x][from.y].type == 'amazon') {
      if (this.game_logic.validMove(from, to, this.board.board)) {
        this.board.board[to.x][to.y] = this.board.board[from.x][from.y];
        this.board.board[from.x][from.y] = { type: 'tile' };

        this.turn += 1;
        if (this.turn == this.players.length) {
          this.turn = 0;
        }

        return true;
      }
    }

    return false;
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

  getInternalId(client_id) {
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i].id == client_id) {
        return this.players[i].internal_id;
      }
    }

    return -1;
  }
}

module.exports = Amazons;
