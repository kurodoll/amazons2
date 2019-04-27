// ========================================================================= //
//                                                     Game Logic Functions //
// ======================================================================= //

// Determines whether a piece can move to a certain tile
function validMove(from, to, board) {
  // A piece can't move to its own tile
  if (from.x == to.x && from.y == to.y) {
    return false;
  }

  // Handle vertical movements (where y changes)
  if (from.x == to.x) {
    // Get the starting and ending y coordinates,
    // ensuring that the start is lower than the end
    let start = (from.y > to.y ? to.y : from.y);
    let end   = (from.y > to.y ? from.y : to.y);

    // A small hack to make things work correctly
    if (from.y < to.y) {
      start += 1;
      end   += 1;
    }

    // Look through each tile along the path and ensure that it is empty
    for (let i = start; i < end; i++) {
      if (board[from.x][i].type != 'tile') {
        return false;
      }
    }

    // No obstacles, so the move is valid!
    return true;
  }

  // Handle horizontal movements (where x changes)
  if (from.y == to.y) {
    // Get the starting and ending x coordinates,
    // ensuring that the start is lower than the end
    let start = (from.x > to.x ? to.x : from.x);
    let end   = (from.x > to.x ? from.x : to.x);

    // A small hack to make things work correctly
    if (from.x < to.x) {
      start += 1;
      end   += 1;
    }

    // Look through each tile along the path and ensure that it is empty
    for (let i = start; i < end; i++) {
      if (board[i][from.y].type != 'tile') {
        return false;
      }
    }

    // No obstacles, so the move is valid!
    return true;
  }

  // Handle diagonal movements
  if (Math.abs(from.x - to.x) == Math.abs(from.y - to.y)) {
    // We iterate over the path using delta movements
    let x_change = 1;
    let y_change = 1;

    if (from.x > to.x) {
      x_change = -1;
    }
    if (from.y > to.y) {
      y_change = -1;
    }

    let x = from.x;
    let y = from.y;

    // Look through each tile along the path and ensure that it is empty
    while (true) {
      x += x_change;
      y += y_change;

      if (board[x][y].type != 'tile') {
        return false;
      }

      if (x == to.x && y == to.y) {
        return true;
      }
    }
  }

  // No other movement types are valid, so this move mustn't be valid
  return false;
}


// ========================================================================= //
//                                                 Board Analysis Functions //
// ======================================================================= //
function getBoardRegions(board) {
  const free_tiles = [];

  for (let x = 0; x < board.length; x++) {
    for (let y = 0; y < board[x].length; y++) {
      if (board[x][y].type != 'burned') {
        free_tiles.push({ x: x, y: y, region: 0 });
      }
    }
  }

  let regions = 0;

  while (true) {
    let done = true;

    for (let i = 0; i < free_tiles.length; i++) {
      if (free_tiles[i].region == 0) {
        regions += 1;
        free_tiles[i].region = regions;

        done = false;
        break;
      }
    }

    if (done) {
      break;
    }

    let changed = 1;

    while (changed > 0) {
      changed = 0;

      for (let i = 0; i < free_tiles.length; i++) {
        if (free_tiles[i].region == 0) {
          for (let j = 0; j < free_tiles.length; j++) {
            if (free_tiles[j].region != 0) {
              const distance_x = Math.abs(free_tiles[i].x - free_tiles[j].x);
              const distance_y = Math.abs(free_tiles[i].y - free_tiles[j].y);

              if (distance_x <= 1 && distance_y <= 1) {
                free_tiles[i].region = free_tiles[j].region;
                changed += 1;
              }
            }
          }
        }
      }
    }
  }

  return {
    tiles: free_tiles,
    n_regions: regions };
}


module.exports = {
  validMove:       validMove,
  getBoardRegions: getBoardRegions };
