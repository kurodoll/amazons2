class AI {
  constructor(game_logic) {
    this.game_logic = game_logic;
  }

  getMove(id, game_data, ai_interal_id) {
    if (id.includes('_bot-air')) {
      const possible_moves = [];
      const amazons = this.game_logic.getAmazons(game_data.board.board);

      for (let i = 0; i < amazons.length; i++) {
        if (amazons[i].owner == ai_interal_id) {
          for (let j = 0; j < game_data.regions.tiles.length; j++) {
            const from = { x: amazons[i].x,                 y: amazons[i].y };
            const to   = { x: game_data.regions.tiles[j].x, y: game_data.regions.tiles[j].y }; // eslint-disable-line max-len

            if (this.game_logic.validMove(from, to, game_data.board.board)) {
              possible_moves.push({ from, to });
            }
          }
        }
      }

      if (possible_moves.length == 0) {
        return null;
      }

      const move = possible_moves[Math.floor(Math.random() * possible_moves.length)]; // eslint-disable-line max-len
      const burnable_tiles = [];

      for (let i = 0; i < game_data.regions.tiles.length; i++) {
        const from = { x: move.to.x,                    y: move.to.y };
        const to   = { x: game_data.regions.tiles[i].x, y: game_data.regions.tiles[i].y }; // eslint-disable-line max-len

        if (this.game_logic.validMove(from, to, game_data.board.board)) {
          burnable_tiles.push(to);
        }
      }

      if (burnable_tiles.length == 0) {
        return null;
      }

      const burn = burnable_tiles[Math.floor(Math.random() * burnable_tiles.length)]; // eslint-disable-line max-len

      return {
        move: move,
        burn: burn };
    }
  }
}

module.exports = AI;
