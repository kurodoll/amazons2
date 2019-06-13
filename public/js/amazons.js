class Amazons {
  constructor(match_id, players, board, turn_timer, game_logic, ai, ranked) {
    this.match_id   = match_id;
    this.players    = players;
    this.board      = board;
    this.board_orig = board;
    this.turn_timer = turn_timer;
    this.game_logic = game_logic;
    this.ai         = ai;
    this.ranked     = ranked;

    this.turn = 0;
    this.turn_ends = new Date().getTime() + this.turn_timer * 1000;
    this.piece_has_moved = false;
    this.moved_piece = { x: -1, y: -1 };

    this.last_move = {};

    this.match_started = new Date().getTime();
    this.match_ended   = null;

    this.timer = setInterval(() => {
      if (this.turn_timer && (new Date().getTime() > this.turn_ends)) {
        this.advanceTurn();
      }
    }, 10);

    // History
    this.turn_history = [];

    // Match end
    this.losers = [];
    this.winner = null;
  }

  begin(clients) {
    for (let i = 0; i < this.players.length; i++) {
      // If the player has disconnected, ignore them
      if (!clients[this.players[i].id]) {
        continue;
      }

      clients[this.players[i].id].socket.emit('match_begin', {
        match_id:      this.match_id,
        players:       this.players,
        board:         this.board,
        match_started: this.match_started });
    }
  }

  attemptMove(from, to) {
    if (this.winner) {
      return;
    }

    // Check whether a piece has already moved this turn
    if (this.piece_has_moved) {
      return false;
    }

    if (!(from.x >= 0 && from.y >= 0 && from.x < this.board.size && from.y < this.board.size)) { // eslint-disable-line max-len
      return false;
    }
    if (!(to.x >= 0 && to.y >= 0 && to.x < this.board.size && to.y < this.board.size)) { // eslint-disable-line max-len
      return false;
    }

    if (this.board.board[from.x][from.y].type == 'amazon') {
      if (this.game_logic.validMove(from, to, this.board.board)) {
        this.board.board[to.x][to.y]     = this.board.board[from.x][from.y];
        this.board.board[to.x][to.y].x   = to.x;
        this.board.board[to.x][to.y].y   = to.y;
        this.board.board[from.x][from.y] = { type: 'tile' };

        this.piece_has_moved = true;
        this.turn_history.push({
          time:   new Date().getTime() - this.match_started,
          type:   'move',
          player: this.turn,
          from:   from,
          to:     to });

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
    if (this.winner) {
      return;
    }

    // Make sure that a piece has already moved this turn
    if (!this.piece_has_moved) {
      return false;
    }

    if (!(tile.x >= 0 && tile.y >= 0 && tile.x < this.board.size && tile.y < this.board.size)) { // eslint-disable-line max-len
      return false;
    }

    if (this.board.board[tile.x][tile.y].type == 'tile') {
      if (this.game_logic.validMove(this.moved_piece, tile, this.board.board)) {
        this.board.board[tile.x][tile.y] = { type: 'burned' };

        this.last_move[this.last_mover].burn = {
          from: this.moved_piece,
          to: tile };

        this.turn_history.push({
          time:   new Date().getTime() - this.match_started,
          type:   'burn',
          player: this.turn,
          from:   this.moved_piece,
          to:     tile });

        this.advanceTurn();
        return true;
      }
    }

    return false;
  }

  advanceTurn() {
    if (this.winner) {
      return;
    }

    this.turn += 1;
    if (this.turn == this.players.length) {
      this.turn = 0;
    }

    if (this.losers.indexOf(this.turn) != -1) {
      this.advanceTurn();
    } else {
      this.turn_ends = new Date().getTime() + this.turn_timer * 1000;

      this.piece_has_moved = false;
      this.moved_piece = { x: -1, y: -1 };

      if (this.clients) {
        this.emitBoard(this.clients);
      }

      // Check whether the next move is an AI move
      this.checkForAITurn();
    }
  }

  checkForAITurn() {
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i].internal_id == this.turn &&
          this.players[i].type == 'bot') {
        const move = this.ai.getMove(
            this.players[i].id,
            { players: this.players,
              board:   this.board,
              regions: this.game_logic.getBoardRegions(this.board.board) },
            this.players[i].internal_id,
            this.players[i].bot_type
        );

        if (move && move.move && move.burn) {
          this.attemptMove(move.move.from, move.move.to);
          this.attemptBurn(move.burn);
        } else {
          this.resign(this.players[i].internal_id);
          this.advanceTurn();
        }
      }
    }
  }

  resign(player_id) {
    if (this.winner) {
      return;
    }

    this.losers.push(player_id);

    if (this.losers.length >= this.players.length - 1) {
      for (let i = 0; i < this.players.length; i++) {
        if (this.losers.indexOf(this.players[i].internal_id) == -1) {
          this.winner = this.players[i];
          this.match_ended = new Date().getTime();
        }
      }
    }
  }

  emitBoard(clients) {
    const board_regions = this.game_logic.getBoardRegions(this.board.board);
    const score         = this.game_logic.getScoreSimple(this.board.board, board_regions.tiles); // eslint-disable-line max-len

    // Check for players that have no valid moves left
    let highest_score = 0;

    for (const i in score.points) {
      if (score.points[i] > highest_score) {
        highest_score = score.points[i];
      }
    }

    for (const i in score.points) {
      if (score.points[i] == score.points_potential[i] &&
          score.points[i] != highest_score) {
        if (this.losers.indexOf(parseInt(i)) == -1) {
          this.resign(parseInt(i));
        }
      }
    }

    for (let i = 0; i < this.players.length; i++) {
      // If the player has disconnected, ignore them
      if (!clients[this.players[i].id]) {
        continue;
      }

      clients[this.players[i].id].socket.emit('board_update', {
        match_id:    this.match_id,
        players:     this.players,
        board:       this.board,
        regions:     board_regions,
        score:       score,
        turn:        this.turn,
        turn_ends:   this.turn_timer ? this.turn_ends : 0,
        last_move:   this.last_move,
        server_time: new Date().getTime(),
        history:     JSON.stringify(this.turn_history),
        losers:      this.losers,
        winner:      this.winner,
        match_ended: this.match_ended });
    }

    this.clients = clients;
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

  completed() {
    return this.winner;
  }

  getInfo() {
    const board_regions = this.game_logic.getBoardRegions(this.board.board);
    const score         = this.game_logic.getScoreSimple(this.board.board, board_regions.tiles); // eslint-disable-line max-len

    return {
      match_id:      this.match_id,
      players:       this.players,
      board:         this.board,
      board_orig:    this.board_orig,
      turn_timer:    this.turn_timer,
      score:         score,
      history:       JSON.stringify(this.turn_history),
      losers:        this.losers,
      winner:        this.winner,
      match_started: this.match_started,
      match_ended:   this.match_ended,
      ranked:        this.ranked };
  }
}

module.exports = Amazons;
