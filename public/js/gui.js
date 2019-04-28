$(() => {
  // ======================================================================= //
  // *                                                            Socket.io //
  // ======================================================================//
  const socket = io();

  // For showing latency to the server
  socket.on('pong', (ms) => {
    $('#latency').text(ms + 'ms');

    // Give the latency display a nice colour depending on user's ping
    let clr_red = Math.floor(ms / 3);
    let clr_grn = 255 - clr_red;

    clr_red = clr_red > 255 ? 255 : clr_red;
    clr_grn = clr_grn <   0 ?   0 : clr_grn;

    const rgb_value = 'rgb(' + clr_red + ', ' + clr_grn + ', 0)';
    $('#latency').css('border-bottom', '2px ' + rgb_value + ' dotted');
  });


  // ======================================================================= //
  // *                                                            User Data //
  // ======================================================================//
  let user_id;
  let user_username;

  // Receive our ID
  socket.on('id', (id) => {
    user_id = id;
    $('#user-id-display').text(user_id);
  });


  // ======================================================================= //
  // *                                                     User Interaction //
  // ======================================================================//

  // User has submitted a username
  $('#submit-username').submit((e) => {
    e.preventDefault();
    socket.emit('set_username', $('#input-username').val());

    $('#error-box').hide();
    $('#logging-in-message').show();

    return false;
  });

  // Server accepted our chosen username
  socket.on('username_set', (username) => {
    user_username = username;
  });

  socket.on('logged_in', () => {
    $('#logging-in-message').hide();
    $('#submit-username').hide();
    $('#user-info').show();
    $('#username-display').text(user_username);
    $('#navbar').show();
    $('#main-content').show();
  });

  socket.on('users_list', (users) => {
    let list_html = '';

    for (let i = 0; i < users.length; i++) {
      list_html
        += '<a id="'
        +  users[i].id
        +  '" href="#">'
        +  users[i].username
        +  '</a><br />';
    }

    $('#users-list').html(list_html);
    $('#users-count').text(users.length);
  });

  socket.on('error_message', (message) => {
    $('#error-message').text(message);
    $('#error-box').show();
  });


  // -------------------------------------------------------------- Match Setup
  let   setting_up_match  = false;
  let   invited_players   = [];
  const notification_list = [];
  let   notification_id   = 0;

  // Links
  $('#navbar').on('click', 'a', (e) => {
    if (e.target.id == 'link-new-match') {
      setting_up_match = true;

      // Reset match settings to defaults
      invited_players = [{
        id:       user_id,
        username: user_username,
        accepted: 'accepted' }];

      updateInvitedPlayers();
      $('#new-match').show();
    }
  });

  // User is inviting a player to their match
  $('#users-list-box').on('click', 'a', (e) => {
    // Ensure that the New Match dialog is open
    if (!setting_up_match) {
      return;
    }

    // Ensure that the player hasn't already been invited
    for (let i = 0; i < invited_players.length; i++) {
      if (invited_players[i].id == e.target.id) {
        return;
      }
    }

    invited_players.push({
      id:       e.target.id,
      username: e.target.text,
      type:     'human',
      accepted: 'pending' });

    // Send the invited player a notification
    socket.emit('player_invite', e.target.id);
    updateInvitedPlayers();
  });

  // User is inviting a bot to their match
  $('#bot-list-box').on('click', 'a', (e) => {
    // Ensure that the New Match dialog is open
    if (!setting_up_match) {
      return;
    }

    invited_players.push({
      id:       e.target.id,
      username: e.target.text,
      type:     'bot',
      accepted: 'accepted' });

    updateInvitedPlayers();
  });

  socket.on('set_invite_id', (info) => {
    for (let i = 0; i < invited_players.length; i++) {
      if (invited_players[i].id == info.player) {
        invited_players[i].match_invite_id = info.match_invite_id;
        return;
      }
    }
  });

  // User has received an invite to a match
  socket.on('match_invite', (info) => {
    const this_notification_id = notification_id;
    notification_id += 1;

    const notification
      = '<b>' + info.from + '</b> has invited you to a match: '
      + '<a id="' + this_notification_id + '" href="#">Accept</a> or '
      + '<a id="' + this_notification_id + '" href="#">Decline</a>';

    notification_list.push({
      id:              this_notification_id,
      match_invite_id: info.match_invite_id,
      text:            notification,
      active:          true });

    updateNotifications();
    $('#sound-request-received')[0].play();
  });

  $('#notification-box').on('click', 'a', (e) => {
    let match_invite_id = -1;

    for (let i = 0; i < notification_list.length; i++) {
      if (notification_list[i].id == e.target.id) {
        match_invite_id = notification_list[i].match_invite_id;

        notification_list[i].active = false;
        break;
      }
    }

    if (e.target.text == 'Accept') {
      socket.emit('match_accept', match_invite_id);
    } else if (e.target.text == 'Decline') {
      socket.emit('match_decline', match_invite_id);
    }

    updateNotifications();
  });

  socket.on('invite_response', (info) => {
    for (let i = 0; i < invited_players.length; i++) {
      if (invited_players[i].id == info.player_id &&
          invited_players[i].match_invite_id == info.match_invite_id) {
        invited_players[i].accepted = info.response;
        break;
      }
    }

    updateInvitedPlayers();
  });

  // User wants to start the match
  $('#new-match-form').submit((e) => {
    e.preventDefault();

    socket.emit('match_start', {
      players:      invited_players,
      board_size:   $('#set-board-size').val(),
      piece_config: $('#set-pieces').val(),
      turn_timer:   $('#set-turn-timer').val() });

    return false;
  });


  // ======================================================================= //
  // *                                                               PixiJS //
  // ======================================================================//
  let showing_match;

  const colours = {
    tile_border:   0x446688,
    burned_border: 0xFF0000,
    burned_fill:   0xFF0000,
    valid_border:  0xFFFFFF,
    player_colours: [
      { hex: 0x00FF88, css_hex: '#00FF88' },
      { hex: 0x0088FF, css_hex: '#0088FF' },
      { hex: 0xFF8800, css_hex: '#FF8800' },
      { hex: 0xFF0000, css_hex: '#FF0000' }]};

  const tile_size = 50;

  const app = new PIXI.Application({
    width:  0,
    height: 0,
    antialias:   true,
    transparent: true });

  app.renderer.autoResize = true;

  // Graphics for the board itself
  const graphics_tile = new PIXI.Graphics();

  // Graphics for the Amazon pieces
  const graphics_amazon = new PIXI.Graphics();

  // Graphics for "burned" tiles
  const graphics_burned = new PIXI.Graphics();

  // Graphics for tiles that are valid to move to
  const graphics_valid = new PIXI.Graphics();

  // Graphics for movement lines
  const graphics_movement = new PIXI.Graphics();

  app.stage.addChild(graphics_tile);
  app.stage.addChild(graphics_amazon);
  app.stage.addChild(graphics_burned);
  app.stage.addChild(graphics_valid);
  app.stage.addChild(graphics_movement);


  // ---------------------------------------------------------------- Rendering
  function drawBoard(board) {
    const offset = 1;

    // Reset all the graphics.
    // I'm not actually sure how this works so this might be wrong...
    // But it works!
    graphics_tile.clear();
    graphics_tile.lineStyle(1, colours.tile_border, 1);
    graphics_amazon.clear();
    graphics_burned.clear();
    graphics_burned.lineStyle(1, colours.burned_border, 1);
    graphics_valid.clear();
    graphics_valid.lineStyle(1, colours.valid_border, 1);
    graphics_movement.clear();

    const sel_x = game_states[showing_match].selected.x;
    const sel_y = game_states[showing_match].selected.y;

    // Draw all the elements of the board
    for (let x = 0; x < board.size; x++) {
      for (let y = 0; y < board.size; y++) {
        if (board.board[x][y].type != 'empty') {
          graphics_tile.drawRect(
              x * tile_size + offset,
              y * tile_size + offset,
              tile_size,
              tile_size);
        }

        if (board.board[x][y].type == 'amazon') {
          graphics_amazon.lineStyle(
              2, colours.player_colours[board.board[x][y].owner].hex, 1
          );

          if (sel_x == x && sel_y == y) {
            graphics_amazon.beginFill(
                colours.player_colours[board.board[x][y].owner].hex
            );
          } else {
            graphics_amazon.beginFill(
                colours.player_colours[board.board[x][y].owner].hex, .1
            );
          }

          graphics_amazon.drawCircle(
              (x * tile_size) + (tile_size / 2) + offset,
              (y * tile_size) + (tile_size / 2) + offset,
              tile_size / 3
          );

          graphics_amazon.endFill();
        } else if (board.board[x][y].type == 'burned') {
          graphics_burned.beginFill(colours.burned_fill, .1);

          graphics_burned.drawRect(
              (x * tile_size) + offset + 2,
              (y * tile_size) + offset + 2,
              tile_size - 4,
              tile_size - 4
          );

          graphics_burned.endFill();
        } else {
          // Draw an icon if the tile is a valid movement/action point
          if (validMove({ x: sel_x, y: sel_y }, { x: x, y: y }, board.board)) {
            if (game_states[showing_match].moved) {
              graphics_valid.beginFill(colours.valid_border, .1);

              graphics_valid.drawRect(
                  (x * tile_size) + offset + 2,
                  (y * tile_size) + offset + 2,
                  tile_size - 4,
                  tile_size - 4
              );

              graphics_valid.endFill();
            } else {
              graphics_valid.drawCircle(
                  (x * tile_size) + (tile_size / 2) + offset,
                  (y * tile_size) + (tile_size / 2) + offset,
                  3
              );
            }
          }
        }
      }
    }

    const lm = game_states[showing_match].last_move;
    if (lm) {
      for (let i = 0; i < game_states[showing_match].players.length; i++) {
        if (lm[i] && lm[i].piece && lm[i].piece.from) {
          graphics_movement.lineStyle(1, colours.player_colours[i].hex, .5);

          graphics_movement.moveTo(
              lm[i].piece.from.x * tile_size + (tile_size / 2),
              lm[i].piece.from.y * tile_size + (tile_size / 2));

          graphics_movement.lineTo(
              lm[i].piece.to.x * tile_size + (tile_size / 2),
              lm[i].piece.to.y * tile_size + (tile_size / 2));
        }

        if (lm[i] && lm[i].burn && lm[i].burn.from) {
          graphics_movement.lineStyle(1, colours.burned_border, .5);

          graphics_movement.moveTo(
              lm[i].burn.from.x * tile_size + (tile_size / 2),
              lm[i].burn.from.y * tile_size + (tile_size / 2));

          graphics_movement.lineTo(
              lm[i].burn.to.x * tile_size + (tile_size / 2),
              lm[i].burn.to.y * tile_size + (tile_size / 2));
        }
      }
    }
  }


  // ======================================================================= //
  // *                                                              Amazons //
  // ======================================================================//
  game_states = {};

  socket.on('match_begin', (data) => {
    console.log('Match beginning: ID is ' + data.match_id);

    showing_match = data.match_id;
    game_states[data.match_id] = data;
    game_states[data.match_id].selected = {};
    game_states[data.match_id].moved = false;

    // Shortcut for this user's internal_id
    for (let i = 0; i < data.players.length; i++) {
      if (data.players[i].id == user_id) {
        game_states[data.match_id].miid = data.players[i].internal_id;
        break;
      }
    }

    // Resize the canvas to fit the board
    window_size = data.board.size * tile_size + 2;
    app.renderer.resize(window_size, window_size);

    $('#game-container').show();
    $('#game').html(app.view);

    // Clean up the New Match stuff if present
    $('#new-match').hide();
    setting_up_match = false;

    // Show the Match Info box
    $('#match-info').show();
    $('#match-info-id').text(data.match_id);
    $('#turn-timer').html('');

    $('#sound-match-start')[0].play();
  });

  socket.on('board_update', (data) => {
    if (data.match_id == showing_match) {
      if (data.turn != game_states[showing_match].miid) {
        game_states[showing_match].selected = {};
      }

      game_states[data.match_id].board     = data.board;
      game_states[data.match_id].turn      = data.turn;
      game_states[data.match_id].turn_ends = data.turn_ends;
      game_states[data.match_id].last_move = data.last_move;
      drawBoard(data.board);

      game_states[data.match_id].time_offset =
        data.server_time - new Date().getTime();
      console.log('Server time offset is ' + game_states[data.match_id].time_offset); // eslint-disable-line max-len

      // This is to reset the local move data if a player's turn time runs out
      if (data.turn != game_states[showing_match].miid) {
        game_states[showing_match].moved = false;
      }

      // Display player info
      let players_html = '';

      for (let i = 0; i < data.players.length; i++) {
        const player_colour
          = colours.player_colours[data.players[i].internal_id].css_hex;

        const cs = '<span style="color: ' +  player_colour +  ';">';
        const ce = '</span>';

        players_html
          += cs + '<b>' + (data.score.points[i] ? data.score.points[i] : 0) + '</b>' + ce                                    // eslint-disable-line max-len
          +  '/<span class="subdued-2">' + (data.score.points_potential[i] ? data.score.points_potential[i] : 0) + '</span>' // eslint-disable-line max-len
          +  '&emsp;'
          +  cs + '<b>' + data.players[i].username + '</b>' + ce
          + '</b></span><span class="subdued-2">'
          +  data.players[i].id
          + '</span>';

        if (data.turn == data.players[i].internal_id) {
          players_html += ' (current player)';
        }

        players_html += '<br />';
      }

      $('#match-info-players').html(players_html);
      $('#match-info-n_regions').text(data.regions.n_regions);
    }
  });

  function turn_timer() {
    // Update match time
    if (game_states[showing_match]) {
      const seconds           = Math.floor((new Date().getTime() - game_states[showing_match].match_started - game_states[showing_match].time_offset) / 1000); // eslint-disable-line max-len
      const minutes           = Math.floor(seconds / 60);
      const seconds_of_minute = seconds % 60;

      $('#match-time').html(minutes + '<span class="subdued">m</span>:' + seconds_of_minute + '<span class="subdued">s</span>'); // eslint-disable-line max-len

      // Update turn timer
      if (game_states[showing_match].turn_ends) {
        let text = ((game_states[showing_match].turn_ends - new Date().getTime() - game_states[showing_match].time_offset) / 1000).toFixed(1); // eslint-disable-line max-len

        if (!(game_states[showing_match].turn == game_states[showing_match].miid)) { // eslint-disable-line max-len
          text = '<span class="subdued">' + text + '</span>';
        } else {
          text
            = '<span style="color: '
            + colours.player_colours[game_states[showing_match].miid].css_hex
            + '";>'
            + text
            + '</span>';
        }

        $('#turn-timer').html(text);
      }
    }
  }

  setInterval(turn_timer, 100);


  // ------------------------------------------------------------- Handle Input
  $('#game').on('click tap', function(e) {
    // Only allow clicks if it's the user's turn
    if (game_states[showing_match].turn == game_states[showing_match].miid) {
      // Get the mouse position
      const element = $(this);
      const mouse_x = e.pageX - element.offset().left;
      const mouse_y = e.pageY - element.offset().top;

      // Determine which tile was clicked, if any
      tile_x = Math.floor((mouse_x) / tile_size);
      tile_y = Math.floor((mouse_y) / tile_size);

      const board = game_states[showing_match].board;

      if (tile_x < 0 || tile_x >= board.size ||
          tile_y < 0 || tile_y >= board.size) {
        // The user didn't click on a tile
        return;
      }

      // We only want to try to select/move a piece if it hasn't happened yet
      if (!game_states[showing_match].moved) {
        // First check whether the user is selected a piece
        const sel_x = game_states[showing_match].selected.x;
        const sel_y = game_states[showing_match].selected.y;

        if (board.board[tile_x][tile_y].type  == 'amazon' &&
            board.board[tile_x][tile_y].owner == game_states[showing_match].miid) { // eslint-disable-line max-len
          if (sel_x == tile_x && sel_y == tile_y) {
            game_states[showing_match].selected = {};
          } else {
            game_states[showing_match].selected = { x: tile_x, y: tile_y };
          }

          drawBoard(board);
        } else {
          // The user may be trying to move a piece
          if (!(sel_x === undefined || sel_y === undefined)) {
            socket.emit('attempt_move', {
              match_id: showing_match,
              from: { x: sel_x,  y: sel_y },
              to:   { x: tile_x, y: tile_y }});
          }
        }
      } else {
        // We must be trying to burn a tile
        if (board.board[tile_x][tile_y].type == 'tile') {
          socket.emit('attempt_burn', {
            match_id: showing_match,
            tile: { x: tile_x, y: tile_y }});
        }
      }

      console.log(
          'Selected tile: ' + JSON.stringify(board.board[tile_x][tile_y]));
    }
  });

  socket.on('move_success', (new_selected) => {
    game_states[showing_match].selected = new_selected;
    game_states[showing_match].moved    = true;

    drawBoard(game_states[showing_match].board);
    $('#sound-piece-move')[0].play();
  });

  socket.on('burn_success', () => {
    game_states[showing_match].selected = {};
    game_states[showing_match].moved    = false;

    drawBoard(game_states[showing_match].board);
    $('#sound-burn')[0].play();
  });


  // ======================================================================= //
  // *                                                     Helper Functions //
  // ======================================================================//
  function updateNotifications() {
    let notifications_html = '';

    for (let i = 0; i < notification_list.length; i++) {
      if (notification_list[i].active) {
        notifications_html
          += '<p class="notification-message">'
          +  notification_list[i].text + '</p>';
      }
    }

    $('#notification-box').html(notifications_html);

    if (notifications_html) {
      $('#notification-box').show();
    } else {
      $('#notification-box').hide();
    }
  }

  function updateInvitedPlayers() {
    let players_html = '';

    for (let i = 0; i < invited_players.length; i++) {
      players_html += invited_players[i].username;

      if (invited_players[i].accepted == 'pending') {
        players_html += ' (<span class="highlight">pending</span>)';
      } else if (invited_players[i].accepted == 'declined') {
        players_html += ' (<span class="highlight-red">declined</span>)';
      } else if (invited_players[i].accepted == 'accepted') {
        players_html += ' (<span class="highlight-green">accepted</span>)';
      }

      players_html += '<br />';
    }

    $('#invited-players').html(players_html);
  }
});
