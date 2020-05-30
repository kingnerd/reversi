/*********************************************/
/* Set up the file server                    */
/* include the static file webserver library */
var static = require('node-static');

/* Include the http server library */
var http = require('http');

/* Assume that we are running on Heroku */
var port = process.env.PORT;
var directory = __dirname + '/public';

/* If we aren't on Heroku then we need to readjust the port and directory
 * information and we know that because port won't be set */
 if(typeof port == 'undefined' || !port){
 	directory = './public';
 	port = 8080;
 }

 /* Set up a static web-server that will deliver files from the filesystem */
 var file = new static.Server(directory);

 /* Construct an http server that gets files from the file server */
 var app = http.createServer(
 	function(request,response){
 		request.addListener('end',
 			function(){
 				file.serve(request,response);
 			}).resume();
 	}).listen(port);

 console.log('The server is running');

/*********************************************/
/* Set up web socket server                  */

/* A list of players */
var players = [];

var io = require('socket.io').listen(app);

io.sockets.on('connection', function (socket){

	log('Client Connection By ' + socket.id);

	function log (){
		var array = ['*** Server Log Message: '];
		for (var i = 0; i < arguments.length; i++){
			array.push(arguments[i]);
			console.log(arguments[i]);
		}
		socket.emit('log', array);
		socket.broadcast.emit( 'log', array);
	}

	log('A web site connected to the server');

	/* Join room command */
	/* Payload:
		{
			'room' : Room to join
			'username' : Username of person joining
		}

		join_room_response:
		{
			'result' : 'success'
			'room' : Room to join
			'username' : username that joined
			socket_id : socket id of the person that joined
			'membership' : number of people in the room including this new one
		}
		or
		{
			'result' : 'fail'
			'message' : failure message
		}
	*/
	socket.on('join_room', function(payload){
		log('\'join_room\' command ' + JSON.stringify(payload));

		/* Check that the client sent a payload */
		if (('undefined' === typeof payload) || !payload){
			var error_message = 'join_room had no payload, command aborted';
			log(error_message);
			socket.emit('join_room_response', { result: 'fail',
												message: error_message
											  });
			return;
		}

		/* Check that the payload has a room to join */
		var room = payload.room;
		if (('undefined' === typeof room) || !room){
			var error_message = 'join_room had didn\'t specify a room, command aborted';
			log(error_message);
			socket.emit('join_room_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		/* Check that a username has been provided */
		var username = payload.username;
		if (('undefined' === typeof username) || !username){
			var error_message = 'join_room had didn\'t specify a username, command aborted';
			log(error_message);
			socket.emit('join_room_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		/* Store information about this new player */
		players[socket.id] = {};
		players[socket.id].username = username;
		players[socket.id].room = room;

		/* Actually have the user join the room */
		socket.join(room);

		/* Get the room obect */
		var roomObject = io.sockets.adapter.rooms[room];

		/* Announce room join */
		var numClients = roomObject.length;
		var success_data = {
			results : 'success',
			room: room,
			username: username,
			socket_id: socket.id,
			membership: numClients
		};

		io.in(room).emit('join_room_response', success_data);

		for (var socket_in_room in roomObject.sockets){
			var success_data = {
				result: 'success',
				room: room,
				username: players[socket_in_room].username,
				socket_id: socket_in_room,
				membership: numClients
			};

			socket.emit('join_room_response', success_data);
		}
		log('join_room success');
	});

	socket.on('disconnect', function(){
		log('Client Disconnected ' + JSON.stringify(players[socket.id]));

		if ('undefined' !== typeof players[socket.id] && players[socket.id]){
			var username = players[socket.id].username;
			var room = players[socket.id].room;
			var payload = {
				username: username,
				socket_id: socket.id
			};
			delete players[socket.id];
			io.in(room).emit('player_disconnected', payload);
		}
	});

	/* send_message command */
	/* Payload:
		{
			'room' : Room to join,
			'message' : the message to send
		}

		send_message_response:
		{
			'result' : 'success',
			'username' : username that spoke,
			'message' : the message spoken
		}
		or
		{
			'result' : 'fail'
			'message' : failure message
		}
	*/
	socket.on('send_message', function(payload){
		log('Server received a command', 'send_message', payload);

		if (('undefined' === typeof payload) || !payload){
			var error_message = 'send_message had no payload, command aborted';
			log(error_message);
			socket.emit('send_message_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		var room = payload.room;
		if (('undefined' === typeof room) || !room){
			var error_message = 'send_message had didn\'t specify a room, command aborted';
			log(error_message);
			socket.emit('send_message_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		var username = players[socket.id].username;
		if (('undefined' === typeof username) || !username){
			var error_message = 'send_message had didn\'t specify a username, command aborted';
			log(error_message);
			socket.emit('send_message_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		var message = payload.message;
		if (('undefined' === typeof message) || !message){
			var error_message = 'send_message had didn\'t specify a message, command aborted';
			log(error_message);
			socket.emit('send_message_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		//io.sockets.in(room).emit('join_room_response', success_data);
		log('Room ' + room + ' was just joined by ' + username);

		var success_data = {
			result : 'success',
			room: room,
			username: username,
			message: message
		};

		io.in(room).emit('send_message_response', success_data);
		log('Message sent to room ' + room + ' by ' + username);
	});

	/* invite command */
	/* Payload:
		{
			'requested_users': The socket id of the person invited
		}

		invite_response:
		{
			'result' : 'success',
			'socket_id' : the socket id of the person invited
		}
		or
		{
			'result' : 'fail'
			'message' : failure message
		}

		invited_response:
		{
			'result' : 'success',
			'socket_id' : the socket id of the person invited
		}
		or
		{
			'result' : 'fail'
			'message' : failure message
		}
	*/
	socket.on('invite', function(payload){
		log('invite with ' + JSON.stringify(payload));

		if (('undefined' === typeof payload) || !payload){
			var error_message = 'invite had no payload, command aborted';
			log(error_message);
			socket.emit('invite_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		/* Check that the message can be traced to a username */
		var username = players[socket.id].username;
		if (('undefined' === typeof username) || !username){
			var error_message = 'invite can\'t identify who sent message';
			log(error_message);
			socket.emit('invite_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		var requested_user = payload.requested_user;
		if (('undefined' === typeof requested_user) || !requested_user){
			var error_message = 'invite didn\'t specify requested user, command aborted';
			log(error_message);
			socket.emit('invite_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		var room = players[socket.id].room;
		var roomObject = io.sockets.adapter.rooms[room];
		/* Make sure that the user is in the room */
		if(!roomObject.sockets.hasOwnProperty(requested_user)){
			var error_message = 'invite requested a user that wasn\'t in the room, command aborted';
			log(error_message);
			socket.emit('invite_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		/* All data is good. Respond to inviter */
		var success_data = {
			result : 'success',
			socket_id : requested_user
		};

		log('Emitting invite_response');
		socket.emit('invite_response', success_data);

		/* Tell the invitee that they have been invited */
		var success_data = {
			result : 'success',
			socket_id : socket.id
		};
		socket.to(requested_user).emit('invited', success_data);
		log ('invite successful')
	});

	/* uninvite command */
	/* Payload:
		{
			'requested_user': The socket id of the person uninvited
		}

		uinvite_response:
		{
			'result' : 'success',
			'socket_id' : the socket id of the person being uninvited
		}
		or
		{
			'result' : 'fail'
			'message' : failure message
		}

		uninvited:
		{
			'result' : 'success',
			'socket_id' : the socket id of the person doing the uninviting
		}
		or
		{
			'result' : 'fail'
			'message' : failure message
		}
	*/
	socket.on('uninvite', function(payload){
		log('uninvite with ' + JSON.stringify(payload));

		if (('undefined' === typeof payload) || !payload){
			var error_message = 'uninvite had no payload, command aborted';
			log(error_message);
			socket.emit('uninvite_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		/* Check that the message can be traced to a username */
		var username = players[socket.id].username;
		if (('undefined' === typeof username) || !username){
			var error_message = 'uninvite can\'t identify who sent message';
			log(error_message);
			socket.emit('uninvite_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		var requested_user = payload.requested_user;
		if (('undefined' === typeof requested_user) || !requested_user){
			var error_message = 'uninvite didn\'t specify requested user, command aborted';
			log(error_message);
			socket.emit('uninvite_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		var room = players[socket.id].room;
		var roomObject = io.sockets.adapter.rooms[room];
		/* Make sure that the user is in the room */
		if(!roomObject.sockets.hasOwnProperty(requested_user)){
			var error_message = 'invite requested a user that wasn\'t in the room, command aborted';
			log(error_message);
			socket.emit('invite_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		/* All data is good. Respond to inviter */
		var success_data = {
			result : 'success',
			socket_id : requested_user
		};

		log('Emitting uninvite_response');
		socket.emit('uninvite_response', success_data);

		/* Tell the uninvitee that they have been uninvited */
		var success_data = {
			result : 'success',
			socket_id : socket.id
		};
		socket.to(requested_user).emit('uninvited', success_data);
		log ('uninvite successful')
	});

	/* game_start command */
	/* Payload:
		{
			'requested_user': The socket id of the person to play with
		}

		game_start_response:
		{
			'result' : 'success',
			'socket_id' : the socket id of the person you are playing with
			'game_id' : id of the room that you are playing in
		}
		or
		{
			'result' : 'fail'
			'message' : failure message
		}
	*/
	socket.on('game_start', function(payload){
		log('game_start with ' + JSON.stringify(payload));

		if (('undefined' === typeof payload) || !payload){
			var error_message = 'game_start had no payload, command aborted';
			log(error_message);
			socket.emit('game_start_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		/* Check that the message can be traced to a username */
		var username = players[socket.id].username;
		if (('undefined' === typeof username) || !username){
			var error_message = 'game_start can\'t identify who sent message';
			log(error_message);
			socket.emit('game_start_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		var requested_user = payload.requested_user;
		if (('undefined' === typeof requested_user) || !requested_user){
			var error_message = 'game_start didn\'t specify requested user, command aborted';
			log(error_message);
			socket.emit('game_start_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		var room = players[socket.id].room;
		var roomObject = io.sockets.adapter.rooms[room];
		/* Make sure that the user is in the room */
		if(!roomObject.sockets.hasOwnProperty(requested_user)){
			var error_message = 'game_start requested a user that wasn\'t in the room, command aborted';
			log(error_message);
			socket.emit('game_start_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		/* All data is good. Respond to game starter */
		var game_id = Math.floor((1+Math.random()) * 0x10000).toString(16).substring(1);
		var success_data = {
			result : 'success',
			socket_id : requested_user,
			game_id : game_id
		};

		log('Emitting game_start_response');
		socket.emit('game_start_response', success_data);

		/* Tell the other player to play */
		var success_data = {
			result : 'success',
			socket_id : socket.id,
			game_id : game_id
		};
		socket.to(requested_user).emit('game_start_response', success_data);
		log ('game_start successful')
	});
});