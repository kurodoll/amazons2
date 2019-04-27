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
      = info.from + ' has invited you to a match: '
      + '<a id="' + this_notification_id + '" href="#">Accept</a> or '
      + '<a id="' + this_notification_id + '" href="#">Decline</a>';

    notification_list.push({
      id:              this_notification_id,
      match_invite_id: info.match_id,
      text:            notification,
      active:          true });

    updateNotifications();
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
    tile_border: 0x446688 };

  const tile_size = 50;

  const app = new PIXI.Application({
    width:  0,
    height: 0,
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
    // Reset all the graphics.
    // I'm not actually sure how this works so this might be wrong...
    // But it works!
    graphics_tile.clear();
    graphics_tile.lineStyle(1, colours.tile_border, 1);

    for (let x = 0; x < board.size; x++) {
      for (let y = 0; y < board.size; y++) {
        graphics_tile.drawRect(
            x * tile_size + 1,
            y * tile_size,
            tile_size,
            tile_size);
      }
    }
  }


  // ======================================================================= //
  // *                                                              Amazons //
  // ======================================================================//
  socket.on('match_begin', (data) => {
    console.log('Match beginning: ID is ' + data.match_id);
    showing_match = data.match_id;

    // Resize the canvas to fit the board
    window_size = data.board.size * tile_size + 1;
    app.renderer.resize(window_size, window_size);

    $('#game-container').show();
    $('#game').html(app.view);

    drawBoard(data.board);

    // Clean up the New Match stuff if present
    $('#new-match').hide();
    setting_up_match = false;

    // Show the Match Info box
    $('#match-info').show();
    $('#match-info-id').text(data.match_id);
  });

  socket.on('board_update', (data) => {
    if (data.match_id == showing_match) {
      drawBoard(data.board);
    }
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
      }

      players_html += '<br />';
    }

    $('#invited-players').html(players_html);
  }
});
