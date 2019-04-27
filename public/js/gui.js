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
    $('#submit-username').hide();
    $('#user-info').show();
    $('#username-display').text(username);
    $('#main-content').show();
  });

  socket.on('users_list', (users) => {
    let list_html = '';

    for (let i = 0; i < users.length; i++) {
      list_html
        += '<a href="'
        +  users[i].id
        +  '">'
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
});
