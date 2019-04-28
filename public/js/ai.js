class AI {
  constructor(game_logic) {
    this.game_logic = game_logic;
  }

  getMove(id, game_data, ai_internal_id) {
    if (id.includes('_bot-airi')) {
      const possible_moves = [];
      const amazons = this.game_logic.getAmazons(game_data.board.board);

      for (let i = 0; i < amazons.length; i++) {
        if (amazons[i].owner == ai_internal_id) {
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
    } else if (id.includes('_bot-sai')) {
      const amazons = this.game_logic.getAmazons(game_data.board.board);

      // Get tile point values for herself,
      // and for all opponent players combined
      const my_tpv = getTilePointValues(
          ai_internal_id,
          game_data,
          amazons,
          this.game_logic
      );

      const opponent_tpv = {};

      for (let i = 0; i < game_data.players.length; i++) {
        // Ignore herself
        if (game_data.players[i].id == id) {
          continue;
        }

        const tpv = getTilePointValues(
            game_data.players[i].internal_id,
            game_data,
            amazons,
            this.game_logic
        );

        for (const j in tpv) {
          if (opponent_tpv[j]) {
            opponent_tpv[j] += tpv[j];
          } else {
            opponent_tpv[j] = tpv[j];
          }
        }
      }

      const highest_tpv          = { coord: '', value: 0, move_from: {} };
      const highest_opponent_tpv = { coord: '', value: 0 };

      // Find best move
      for (const i in my_tpv) { // eslint-disable-line guard-for-in
        for (let a = 0; a < amazons.length; a++) {
          // Ignore other players' pieces
          if (amazons[a].owner != ai_internal_id) {
            continue;
          }

          const coord = {
            x: JSON.parse('[' + i + ']')[0],
            y: JSON.parse('[' + i + ']')[1] };

          if (this.game_logic.validMove({ x: amazons[a].x, y: amazons[a].y }, coord, game_data.board.board)) { // eslint-disable-line max-len
            if (my_tpv[i] > highest_tpv.value) {
              highest_tpv.value     = my_tpv[i];
              highest_tpv.coord     = i;
              highest_tpv.move_from = { x: amazons[a].x, y: amazons[a].y };
            }
          }
        }
      }

      const move_to = {
        x: JSON.parse('[' + highest_tpv.coord + ']')[0],
        y: JSON.parse('[' + highest_tpv.coord + ']')[1] };

      // Burn the tile which has the highest point value
      for (const i in opponent_tpv) { // eslint-disable-line guard-for-in
        const coord = {
          x: JSON.parse('[' + i + ']')[0],
          y: JSON.parse('[' + i + ']')[1] };

        if (this.game_logic.validMove(move_to, coord, game_data.board.board)) { // eslint-disable-line max-len
          if (opponent_tpv[i] > highest_opponent_tpv.value) {
            highest_opponent_tpv.value = opponent_tpv[i];
            highest_opponent_tpv.coord = i;
          }
        }
      }

      // Format the move correctly
      const move = {
        from: highest_tpv.move_from,
        to:   move_to };

      const burn = {
        x: JSON.parse('[' + highest_opponent_tpv.coord + ']')[0],
        y: JSON.parse('[' + highest_opponent_tpv.coord + ']')[1] };

      return {
        move: move,
        burn: burn };
    }
  }
}


function getTilePointValues(for_player, game_data, amazons, game_logic) {
  const tile_values = {};

  for (let a = 0; a < amazons.length; a++) {
    // Ignore other players' pieces
    if (amazons[a].owner != for_player) {
      continue;
    }

    for (let i = 0; i < game_data.regions.tiles.length; i++) {
      // Give each tile values for their distance from the player's pieces
      const pos_a = {
        x: amazons[a].x,
        y: amazons[a].y };

      const pos_t = {
        x: game_data.regions.tiles[i].x,
        y: game_data.regions.tiles[i].y };

      const dist_x = pos_a.x - pos_t.x;
      const dist_y = pos_a.y - pos_t.y;
      const dist   = Math.sqrt(dist_x*dist_x + dist_y*dist_y);

      const index =
        game_data.regions.tiles[i].x + ',' + game_data.regions.tiles[i].y;

      if (tile_values[index]) {
        tile_values[index] += dist;
      } else {
        tile_values[index] = dist;
      }

      // Adjust tile values based on their accessibility for the player
      if (game_logic.validMove(pos_a, pos_t, game_data.board.board)) {
        tile_values[index] += (dist / 2);
      } else {
        tile_values[index] -= (dist / 2);
      }
    }
  }

  return tile_values;
}


module.exports = AI;
