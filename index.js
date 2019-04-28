const express = require('express');
const path = require('path');

const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  'pingInterval': 2000,
  'pingTimeout': 5000 });

app.use(express.static(path.join(__dirname, 'public')));

// Local JavaScripts
const Client  = require(path.join(__dirname, 'public/js/client'));
const Board   = require(path.join(__dirname, 'public/js/board'));
const Amazons = require(path.join(__dirname, 'public/js/amazons'));

const game_logic = require(path.join(__dirname, 'public/js/game_logic'));


// ========================================================================= //
// *                                                                Routing //
// ========================================================================//
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/index.html'));
});


// ========================================================================= //
// *                                           Game Server Global Variables //
// ========================================================================//
const clients       = {};
const match_invites = {};
const matches       = {};


// ========================================================================= //
// *                                                              Socket.io //
// ========================================================================//
io.on('connection', (socket) => {
  const client = new Client(genID(), socket);
  clients[client.id] = client;

  log(
      'socket.io',
      'A client has connected',
      { client_id: client.id, users_online: Object.keys(clients).length });

  // Send client their ID
  socket.emit('id', client.id);

  // User has chosen a username
  socket.on('set_username', (username) => {
    if (username.length >= 3 && username.length <= 20) {
      client.setUsername(username);
      socket.emit('username_set', username);

      log(
          'socket.io',
          'Client has set username',
          { client_id: client.id, username: username });

      // Broadcast the list of users to all clients,
      // so that everybody has a live list of all online users
      const users_info =
        Object.keys(clients)
            .filter((c) => {
              return clients[c].username;
            })
            .map((c) => {
              return {
                id:       clients[c].id,
                username: clients[c].username };
            });

      io.emit('users_list', users_info);
    } else {
      socket.emit(
          'error_message',
          'Username must be 3 to 20 characters long (inclusive)');

      log(
          'socket.io',
          'Client has attempted to set an invalid username',
          { client_id: client.id, username: username });
    }
  });


  // -------------------------------------------------------------- Match Setup
  // User has invited a player to a match
  socket.on('player_invite', (player_id) => {
    if (!client.ready()) {
      return;
    }

    const match_invite_id = genID('matchinvite');

    if (clients[player_id]) {
      clients[player_id].socket.emit('match_invite', {
        from:            client.username,
        match_invite_id: match_invite_id });

      socket.emit('set_invite_id', {
        player:          player_id,
        match_invite_id: match_invite_id });
    }

    match_invites[match_invite_id] = {
      from: client.id,
      to:   player_id };

    log('socket.io', 'Match invite sent', {
      id:   match_invite_id,
      from: client.id,
      to:   player_id });
  });

  socket.on('match_accept', (match_invite_id) => {
    // Check whether the requester is still around
    if (!clients[match_invites[match_invite_id].from]) {
      return;
    }

    clients[match_invites[match_invite_id].from].socket.emit(
        'invite_response',
        {
          player_id:       match_invites[match_invite_id].to,
          match_invite_id: match_invite_id,
          response:        'accepted' });

    log('socket.io', 'Match invite accepted', {
      id:   match_invite_id,
      from: match_invites[match_invite_id].from,
      to:   match_invites[match_invite_id].to });

    delete match_invites[match_invite_id];
  });

  socket.on('match_decline', (match_invite_id) => {
    // Check whether the requester is still around
    if (!clients[match_invites[match_invite_id].from]) {
      return;
    }

    clients[match_invites[match_invite_id].from].socket.emit(
        'invite_response',
        {
          player_id: match_invites[match_invite_id].to,
          match_invite_id: match_invite_id,
          response: 'declined' });

    log('socket.io', 'Match invite declined', {
      id:   match_invite_id,
      from: match_invites[match_invite_id].from,
      to:   match_invites[match_invite_id].to });

    delete match_invites[match_invite_id];
  });

  socket.on('match_start', (settings) => {
    // Make sure the match is valid
    let   n_players    = 0;
    const players_real = [];

    for (let i = 0; i < settings.players.length; i++) {
      if (settings.players[i].accepted == 'accepted') {
        n_players += 1;
        players_real.push(settings.players[i]);
      }
    }

    const pieces = JSON.parse(settings.piece_config);
    let   correct_players = 0;

    for (let i = 0; i < pieces.length; i++) {
      if (pieces[i].owner > correct_players) {
        correct_players = pieces[i].owner + 1;
      }
    }

    if (n_players != correct_players) {
      return;
    }

    // Initialize the match data
    const match_id = genID('match');

    const board = new Board(parseInt(settings.board_size), pieces);
    const game  = new Amazons(match_id, players_real, board, game_logic);
    matches[match_id] = game;

    // Set players
    for (let i = 0; i < n_players; i++) {
      game.setPlayer(players_real[i].id, i);
      game.setPlayer(players_real[i].id, i);
    }

    log('socket.io', 'Match begun', { id: match_id });
    game.begin(clients);
    game.emitBoard(clients);
  });


  // -------------------------------------------------------- Match Interaction
  socket.on('attempt_move', (data) => {
    if (!matches[data.match_id]) {
      // Invalid match ID
      return;
    }

    const board = matches[data.match_id].board.board;
    const miid  = matches[data.match_id].getInternalId(client.id);

    // Ensure that the move is valid
    if (board[data.from.x][data.from.y].owner == miid &&
        matches[data.match_id].turn == miid) {
      if (matches[data.match_id].attemptMove(data.from, data.to)) {
        socket.emit('move_success', data.to);
        matches[data.match_id].emitBoard(clients);
      }
    }
  });

  socket.on('attempt_burn', (data) => {
    if (!matches[data.match_id]) {
      // Invalid match ID
      return;
    }

    const miid  = matches[data.match_id].getInternalId(client.id);

    // Ensure that the move is valid
    if (matches[data.match_id].turn == miid) {
      if (matches[data.match_id].attemptBurn(data.tile)) {
        socket.emit('burn_success');
        matches[data.match_id].emitBoard(clients);
      }
    }
  });


  // ------------------------------------------------------------------ Cleanup
  socket.on('disconnect', () => {
    delete clients[client.id];
    log('socket.io', 'A client has disconnected', { client_id: client.id });

    // Broadcast the list of users to all clients,
    // so that everybody has a live list of all online users
    const users_info =
      Object.keys(clients)
          .filter((c) => {
            return clients[c].username;
          })
          .map((c) => {
            return {
              id:       clients[c].id,
              username: clients[c].username };
          });

    io.emit('users_list', users_info);
  });
});


http.listen(process.env.PORT || 3000, () => {
  console.log('listening on *:' + (process.env.PORT || 3000));
});


// ========================================================================= //
// *                                                       Helper Functions //
// ========================================================================//
function genID(type=null) {
  if (type) {
    return type + '_' + Math.random().toString(36).substr(2, 9);
  } else {
    return '_' + Math.random().toString(36).substr(2, 9);
  }
}

function log(caller, message, data) {
  const time     = new Date();
  const time_str = time.toLocaleString();

  process.stdout.write(time_str + ' [' + caller + '] ' + message + ' ');
  console.dir(data);
}
