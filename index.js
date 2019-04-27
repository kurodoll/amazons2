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
// *                                                              Socket.io //
// ========================================================================//
io.on('connection', (socket) => {
  const client = new Client(socket);

  socket.on('disconnect', () => {
    delete client;
  });
});


http.listen(process.env.PORT || 3000, () => {
  console.log('listening on *:' + (process.env.PORT || 3000));
});
