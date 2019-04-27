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
  });


  // ======================================================================= //
  // *                                                     User Interaction //
  // ======================================================================//

  // User has submitted a username
  $('#submit-username').submit((e) => {
    e.preventDefault();
    socket.emit('set_username', $('#input-username').val());

    $('#error-box').hide();

    return false;
  });

  // Server accepted our chosen username
  socket.on('username_set', (username) => {
    user_username = username;

    $('#submit-username').hide();
    $('#user-info').show();
    $('#username-display').text(username);
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
      accepted: 'pending' });

    // Send the invited player a notification
    socket.emit('player_invite', e.target.id);
    updateInvitedPlayers();
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
      match_invite_id: info.match_id,
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
      if (invited_players[i].id == info.player_id) {
        invited_players[i].accepted = info.response;
        break;
      }
    }

    updateInvitedPlayers();
  });

  // User wants to start the match
  $('#new-match-form').submit((e) => {
    e.preventDefault();
    socket.emit('match_start', invited_players);
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
    player_colours: [
      { hex: 0x00FF88, css_hex: '#00FF88' },
      { hex: 0x0088FF, css_hex: '#0088FF' },
      { hex: 0xFF8800, css_hex: '#FF8800' },
      { hex: 0xFF0088, css_hex: '#FF0088' }]};

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

  app.stage.addChild(graphics_tile);
  app.stage.addChild(graphics_amazon);
  app.stage.addChild(graphics_burned);
  app.stage.addChild(graphics_valid);


  // ---------------------------------------------------------------- Rendering
  function drawBoard(board) {
    const offset = 1;

    // Reset all the graphics.
    // I'm not actually sure how this works so this might be wrong...
    // But it works!
    graphics_tile.clear();
    graphics_tile.lineStyle(1, colours.tile_border, 1);
    graphics_burned.clear();
    graphics_burned.lineStyle(1, colours.burned_border, 1);

    graphics_amazon.clear();

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

          if (game_states[showing_match].selected.x == x &&
              game_states[showing_match].selected.y == y) {
            graphics_amazon.beginFill(
                colours.player_colours[board.board[x][y].owner].hex
            );
          }

          graphics_amazon.drawCircle(
              (x * tile_size) + (tile_size / 2) + offset,
              (y * tile_size) + (tile_size / 2) + offset,
              tile_size / 3
          );

          if (game_states[showing_match].selected.x == x &&
              game_states[showing_match].selected.y == y) {
            graphics_amazon.endFill();
          }
        } else if (board.board[x][y].type == 'burned') {
          graphics_burned.beginFill(colours.burned_fill, .1);

          graphics_burned.drawRect(
              (x * tile_size) + offset + 2,
              (y * tile_size) + offset + 2,
              tile_size - 4,
              tile_size - 4
          );

          graphics_burned.endFill();
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

    $('#sound-match-start')[0].play();
  });

  socket.on('board_update', (data) => {
    if (data.match_id == showing_match) {
      if (data.turn != game_states[showing_match].miid) {
        game_states[showing_match].selected = {};
      }

      game_states[data.match_id].board = data.board;
      game_states[data.match_id].turn  = data.turn;
      drawBoard(data.board);

      // Display player info
      let players_html = '';

      for (let i = 0; i < data.players.length; i++) {
        const player_colour
          = colours.player_colours[data.players[i].internal_id].css_hex;

        const cs = '<span style="color: ' +  player_colour +  ';">';
        const ce = '</span>';

        players_html
          += cs + (data.score.points_potential[i] ? data.score.points_potential[i] : 0) + ce // eslint-disable-line max-len
          +  '/'
          +  cs + (data.score.points[i] ? data.score.points[i] : 0) + ce
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


  // ------------------------------------------------------------- Handle Input
  $('#game').click(function(e) {
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
        notifications_html += notification_list[i].text + '<br />';
      }
    }

    $('#notification-message').html(notifications_html);

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
