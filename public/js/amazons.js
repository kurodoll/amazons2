class Amazons {
  constructor(match_id, players, board, game_logic) {
    this.match_id   = match_id;
    this.players    = players;
    this.board      = board;
    this.game_logic = game_logic;

    this.turn = 0;
    this.piece_has_moved = false;
    this.moved_piece = { x: -1, y: -1 };

    this.last_move = {};
  }

  begin(clients) {
    for (let i = 0; i < this.players.length; i++) {
      // If the player has disconnected, ignore them
      if (!clients[this.players[i].id]) {
        continue;
      }

      clients[this.players[i].id].socket.emit('match_begin', {
        match_id: this.match_id,
        board:    this.board,
        players:  this.players });
    }
  }

  attemptMove(from, to) {
    // Check whether a piece has already moved this turn
    if (this.piece_has_moved) {
      return false;
    }

    if (this.board.board[from.x][from.y].type == 'amazon') {
      if (this.game_logic.validMove(from, to, this.board.board)) {
        this.board.board[to.x][to.y] = this.board.board[from.x][from.y];
        this.board.board[from.x][from.y] = { type: 'tile' };

        this.piece_has_moved = true;

        // Set new position of the piece so we can check for valid burn next
        this.moved_piece = { x: to.x, y: to.y };

        this.last_move[this.board.board[to.x][to.y].owner]       = {};
        this.last_move[this.board.board[to.x][to.y].owner].piece = { from, to };
        this.last_mover = this.board.board[to.x][to.y].owner;

        return true;
      }
    }

    return false;
  }

  attemptBurn(tile) {
    // Make sure that a piece has already moved this turn
    if (!this.piece_has_moved) {
      return false;
    }

    if (this.board.board[tile.x][tile.y].type == 'tile') {
      if (this.game_logic.validMove(this.moved_piece, tile, this.board.board)) {
        this.board.board[tile.x][tile.y] = { type: 'burned' };

        this.turn += 1;
        if (this.turn == this.players.length) {
          this.turn = 0;
        }

        this.last_move[this.last_mover].burn = {
          from: this.moved_piece,
          to: tile };

        this.piece_has_moved = false;
        this.moved_piece = { x: -1, y: -1 };

        return true;
      }
    }

    return false;
  }

  emitBoard(clients) {
    const board_regions = this.game_logic.getBoardRegions(this.board.board);
    const score         = this.game_logic.getScoreSimple(this.board.board, board_regions.tiles); // eslint-disable-line max-len

    for (let i = 0; i < this.players.length; i++) {
      // If the player has disconnected, ignore them
      if (!clients[this.players[i].id]) {
        continue;
      }

      clients[this.players[i].id].socket.emit('board_update', {
        match_id:  this.match_id,
        board:     this.board,
        regions:   board_regions,
        players:   this.players,
        score:     score,
        turn:      this.turn,
        last_move: this.last_move });
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
