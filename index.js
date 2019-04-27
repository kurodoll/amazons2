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
const clients = {};


// ========================================================================= //
// *                                                              Socket.io //
// ========================================================================//
io.on('connection', (socket) => {
  const client = new Client(genID(), socket);
  log('socket.io', 'A client has connected', { client_id: client.id });

  clients[client.id] = client;

  // User has chosen a username
  socket.on('set_username', (username) => {
    if (username.length >= 3 && username.length <= 20) {
      client.setUsername(username);
      socket.emit('username_set', username);

      log(
          'socket.io',
          'Client has set username',
          {
            client_id: client.id,
            username: username,
            users_online: Object.keys(clients).length });

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
function genID() {
  return '_' + Math.random().toString(36).substr(2, 9);
}

function log(caller, message, data) {
  const time     = new Date();
  const time_str = time.toLocaleString();

  process.stdout.write(time_str + ' [' + caller + '] ' + message + ' ');
  console.dir(data);
}
