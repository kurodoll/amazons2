$(() => {
  // ======================================================================= //
  // *                                                            Socket.io //
  // ======================================================================//
  const socket = io();


  // ======================================================================= //
  // *                                                     User Interaction //
  // ======================================================================//

  // User has chosen a username
  $('#submit-username').submit((e) => {
    e.preventDefault();
    socket.emit('set_username', $('#input-username').val());

    $('#error-box').hide();

    return false;
  });

  socket.on('error_message', (message) => {
    $('#error-message').text(message);
    $('#error-box').show();
  });
});
