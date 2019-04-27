class Board {
  constructor(size, pieces) {
    this.size = size;

    // Populate the board as a 2D array with preset data
    this.board = [];

    for (let i = 0; i < size; i++) {
      // Each tile is represented as an object that has at least a type
      const column = Array(size).fill({ type: 'tile' });
      this.board.push(column);
    }

    // Set piece positions
    for (let i = 0; i < pieces.length; i++) {
      this.board[pieces[i].x][pieces[i].y] = pieces[i];
    }
  }
}

module.exports = Board;
