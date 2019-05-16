const express = require('express');
const path = require('path');

const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  'pingInterval': 2000,
  'pingTimeout': 5000 });

const bcrypt = require('bcrypt');

app.use(express.static(path.join(__dirname, 'public')));

// Local JavaScripts
const game_logic = require(path.join(__dirname, 'public/js/game_logic'));

const Client  = require(path.join(__dirname, 'public/js/client'));
const Board   = require(path.join(__dirname, 'public/js/board'));
const Amazons = require(path.join(__dirname, 'public/js/amazons'));

let config;
try {
  config = require(path.join(__dirname, 'config'));
} catch (e) {
  console.warn('No config file found.');
}


// ========================================================================= //
// *                                                                DB Init //
// ========================================================================//
const pg  = require('pg');
const url = require('url');

let db_url;
let pg_pool;

if (process.env.DATABASE_URL) {
  db_url = process.env.DATABASE_URL;
} else {
  db_url = config.db.url;
}

if (db_url) {
  const params = url.parse(db_url);
  const auth = params.auth.split(':');

  const pg_config = {
    host: params.hostname,
    port: params.port,
    user: auth[0],
    password: auth[1],
    database: params.pathname.split('/')[1],
    ssl: true,
    max: 10,
    idleTimeoutMillis: 30000 };

  pg_pool = new pg.Pool(pg_config);
} else {
  console.error('Couldn\'t connect to database as no config could be loaded.');
}

pg_pool.on('error', function(err, client) {
  console.error('Idle client error: ', err.message, err.stack);
});


const AI = new (require(path.join(__dirname, 'public/js/ai')))(
    game_logic,
    pg_pool
);


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

let ai_players = [];

pg_pool.query('SELECT * FROM ai;', (err, result) => {
  if (err) {
    console.error(err);
  } else {
    ai_players = result.rows;
  }
});


// ========================================================================= //
// *                                                              Socket.io //
// ========================================================================//
io.on('connection', (socket) => {
  calculatePlayerRatings();
  const client = new Client(genID(), socket);
  clients[client.id] = client;

  log(
      'socket.io',
      'A client has connected',
      { client_id: client.id, users_online: Object.keys(clients).length });

  // Send client their ID
  socket.emit('id', client.id);

  // Send client server data
  socket.emit('ai_players', ai_players);

  // User has chosen a username
  let logging_in = false;

  socket.on('set_username', (data) => {
    const username = data.username;
    const password = data.password;

    let success = false;

    if (username.length >= 3 && username.length <= 20 && !logging_in) {
      logging_in = true;

      // Save username to DB or get saved ID
      let query = 'SELECT * FROM users WHERE username = $1;';
      let vars  = [ username ];

      let rating;

      pg_pool.query(query, vars, (err, result) => {
        if (err) {
          console.error(err);
        } else if (result.rows.length == 0) {
          query = `INSERT INTO users (username, user_id, password)
            VALUES ($1, $2, $3);`;

          let pw_final = password;

          if (password.length > 0) {
            const salt = bcrypt.genSaltSync(10);
            pw_final = bcrypt.hashSync(password, salt);
          }

          vars = [ username, client.id, pw_final ];

          pg_pool.query(query, vars, (err2, result2) => {
            if (err2) {
              console.error(err2);
            }

            socket.emit('logged_in');
            emitUsers();
          });

          success = true;
        } else {
          if (!result.rows[0].password && password.length > 0) {
            const salt = bcrypt.genSaltSync(10);
            const pass = bcrypt.hashSync(password, salt);

            query = 'UPDATE users SET password = $1 WHERE id = $2;';
            vars  = [ pass, result.rows[0].id ];

            pg_pool.query(query, vars, (err2, result2) => {
              if (err2) {
                console.error(err2);
              }
            });

            success = true;
          } else if (!result.rows[0].password) {
            success = true;
          } else {
            if (bcrypt.compareSync(password, result.rows[0].password)) {
              success = true;
            }
          }

          if (success) {
            client.setUsername(username);
            socket.emit('username_set', username);

            const old_id = client.id;
            client.changeID(result.rows[0].user_id);
            clients[client.id] = client;
            delete clients[old_id];

            rating = result.rows[0].rating;
            clients[client.id].rating = rating;
            socket.emit('rating_set', rating);

            socket.emit('id', client.id);
            socket.emit('logged_in');
            emitUsers();

            logging_in = false;

            log(
                'socket.io',
                'Client has set username',
                { client_id: client.id, username: username });
          } else {
            socket.emit(
                'error_message',
                'Username taken/Incorrect credentials');

            logging_in = false;
          }
        }
      });
    } else if (!logging_in) {
      socket.emit(
          'error_message',
          'Username must be 3 to 20 characters long (inclusive)');

      log(
          'socket.io',
          'Client has attempted to set an invalid username',
          { client_id: client.id, username: username });
    }
  });

  function emitUsers() {
    // Broadcast the list of users to all clients,
    // so that everybody has a live list of all online users
    const users_info =
      Object.keys(clients)
          .filter((c) => {
            return clients[c].username;
          })
          .map((c) => {
            if (c) {
              return {
                id:       clients[c].id,
                username: clients[c].username,
                rating:   clients[c].rating };
            }
          });

    io.emit('users_list', users_info);
  }


  // ---------------------------------------------------------------- User Info
  socket.on('get_match_history', () => {
    const query = 'SELECT * FROM matches_json;';

    pg_pool.query(query, (err, result) => {
      if (err) {
        console.error(err);
      } else {
        const user_matches = [];

        for (let i = 0; i < result.rows.length; i++) {
          const match_info = JSON.parse(result.rows[i].match_info);

          for (let j = 0; j < match_info.players.length; j++) {
            if (match_info.players[j].id == client.id) {
              user_matches.push(match_info);
            }
          }
        }

        socket.emit('match_history', user_matches);
      }
    });
  });


  // ----------------------------------------------------------------------- AI
  socket.on('new_ai', (data) => {
    const query = 'SELECT name FROM ai;';

    pg_pool.query(query, (err, result) => {
      if (err) {
        console.error(err);
      } else {
        for (let i = 0; i < result.rows.length; i++) {
          if (result.rows[i].name == data.name) {
            /* const query2 = 'UPDATE ai SET code = $1 WHERE name = $2;';
            const vars2  = [ data.code, data.name ];

            pg_pool.query(query2, vars2, (err2, result2) => {
              if (err2) {
                console.error(err2);
              }
            });*/

            return;
          }
        }

        const query2 = 'INSERT INTO ai (name, code) VALUES ($1, $2);';
        const vars2  = [ data.name, data.code ];

        pg_pool.query(query2, vars2, (err2, result2) => {
          if (err2) {
            console.error(err2);
          }
        });
      }
    });
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
        // If the player is a bot, give them a unique ID
        if (settings.players[i].type == 'bot') {
          settings.players[i].bot_type = settings.players[i].id;
          settings.players[i].id = genID('_' + settings.players[i].id);
        }

        n_players += 1;
        players_real.push(settings.players[i]);
      }
    }

    let pieces;
    try {
      pieces = JSON.parse(settings.piece_config);
    } catch (e) {
      return;
    }

    let correct_players = 0;

    for (let i = 0; i < pieces.length; i++) {
      if (pieces[i].owner > correct_players) {
        correct_players = pieces[i].owner;
      }
    }

    if (n_players != correct_players + 1) {
      return;
    }

    // Initialize the match data
    const match_id = genID('match');

    const board = new Board(parseInt(settings.board_size), pieces);

    const game = new Amazons(
        match_id,
        players_real,
        board,
        parseInt(settings.turn_timer),
        game_logic,
        AI
    );

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
              username: clients[c].username,
              rating:   clients[c].rating };
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


// ========================================================================= //
// *                                                       Match Monitoring //
// ========================================================================//

setInterval(() => {
  for (const m in matches) { // eslint-disable-line guard-for-in
    const game = matches[m];

    if (game.completed()) {
      // Save match info
      const game_info = game.getInfo();

      const query = 'INSERT INTO matches_json (match_info) VALUES ($1);';
      const vars  = [ JSON.stringify(game_info) ];

      pg_pool.query(query, vars, (err, result) => {
        if (err) {
          console.error(err);
        }
      });

      delete matches[game_info.match_id];
      log(
          'socket.io',
          'Match completed ('
            + Object.keys(matches).length
            + ' still on-going)',
          game_info
      );

      calculatePlayerRatings();
    }
  }
}, 60000);

function calculatePlayerRatings() {
  let query = 'SELECT * FROM matches_json;';

  pg_pool.query(query, (err, result) => {
    if (err) {
      console.error(err);
    } else {
      const player_ratings = {};

      for (let i = 0; i < result.rows.length; i++) {
        const match = JSON.parse(result.rows[i].match_info);
        const match_ratings = game_logic.getMatchRatings(match);

        for (const r in match_ratings) { // eslint-disable-line guard-for-in
          if (player_ratings[r]) {
            player_ratings[r] += match_ratings[r];
          } else {
            player_ratings[r] = 1200 + match_ratings[r];
          }
        }
      }

      // Store the ratings
      let n = 1;

      query = 'UPDATE users SET rating = new.rating FROM (values ';
      const vars = [];

      for (const i in player_ratings) { // eslint-disable-line guard-for-in
        query += '($' + n + ', $' + (n+1) + '), ';
        vars.push(i);
        vars.push(Math.floor(player_ratings[i]));

        n += 2;
      }

      query  = query.substring(0, query.length - 2);
      query += ') AS new(id, rating) WHERE users.user_id = new.id;';

      pg_pool.query(query, vars, (err2, result2) => {
        if (err2) {
          console.error(err2);
        }
      });
    }
  });
}
