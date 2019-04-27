const express = require('express');
const path = require('path');

const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  'pingInterval': 2000,
  'pingTimeout': 5000 });

app.use(express.static(path.join(__dirname, 'public')));

// Local JavaScripts
const Client = require(path.join(__dirname, 'public/js/client.js'));


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
        from:     client.username,
        match_id: match_invite_id });
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
    clients[match_invites[match_invite_id].from].socket.emit(
        'invite_response',
        {
          player_id: match_invites[match_invite_id].to,
          response: 'accepted' });

    log('socket.io', 'Match invite accepted', {
      id:   match_invite_id,
      from: match_invites[match_invite_id].from,
      to:   match_invites[match_invite_id].to });

    delete match_invies[match_invite_id];
  });

  socket.on('match_decline', (match_invite_id) => {
    clients[match_invites[match_invite_id].from].socket.emit(
        'invite_response',
        {
          player_id: match_invites[match_invite_id].to,
          response: 'declined' });

    log('socket.io', 'Match invite declined', {
      id:   match_invite_id,
      from: match_invites[match_invite_id].from,
      to:   match_invites[match_invite_id].to });

    delete match_invies[match_invite_id];
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
