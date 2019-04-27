class Board {
  constructor(size) {
    this.size = size;

    // Populate the board as a 2D array with preset data
    this.board = [];

    for (let i = 0; i < size; i++) {
      // Each tile is represented as an object that has at least a type
      const column = Array(size).fill({ type: 'tile' });
      this.board.push(column);
    }
  }
}

module.exports = Board;
