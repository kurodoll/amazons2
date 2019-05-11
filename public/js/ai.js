const { VM } = require('vm2');


class AI {
  constructor(game_logic, db) {
    this.game_logic = game_logic;
    this.db = db;
    this.ai = {};

    const query = 'SELECT * FROM ai;';

    this.db.query(query, (err, result) => {
      if (err) {
        console.error(err);
      } else {
        for (let i = 0; i < result.rows.length; i++) {
          this.ai[result.rows[i].name] = result.rows[i];
        }
      }
    });
  }

  getMove(id, game_data, ai_internal_id, ai_type) {
    const vm = new VM({
      sandbox: {
        id: id,
        game_data: game_data,
        ai_internal_id: ai_internal_id,
        game_logic: this.game_logic }});

    return vm.run(this.ai[ai_type].code);
  }
}


/* function getTilePointValues(for_player, game_data, amazons, game_logic) {
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
} */


module.exports = AI;
