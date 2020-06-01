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

		if (room !== 'lobby'){
			send_game_update(socket, room, 'initial_update');
		}
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

		log ('The uninvited user is : '+requested_user);
		socket.to(requested_user).emit('uninvite_response', success_data);
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

	/* game_start command */
	/* Payload:
		{
			'row': 0-7,
			'column': 0-7,
			'color': 'white' or 'black'
		}
		If successful a success message will be followed by a game_update message

		play_token_response:
		{
			'result' : 'success',
		}
		or
		{
			'result' : 'fail'
			'message' : failure message
		}
	*/
	socket.on('play_token', function(payload) {
		log('play_token with ' + JSON.stringify(payload));

		if (('undefined' === typeof payload) || !payload) {
			var error_message = 'play_token had no payload, command aborted';
			log(error_message);
			socket.emit('play_token_response', {
				result: 'fail',
				message: error_message
			});
			return;
		}

		/* Check that the player has previously registered */
		var player = players[socket.id];
		if (('undefined' === typeof player) || !player) {
			var error_message = 'Unrecognized by server: Go back one screen';
			log(error_message);
			socket.emit('play_token_response', {
				result: 'fail',
				message: error_message
			});
			return;
		}

		/* Check that the message can be traced to a username */
		var username = players[socket.id].username;
		if (('undefined' === typeof username) || !username){
			var error_message = 'play_token can\'t identify who sent message';
			log(error_message);
			socket.emit('play_token_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		/* Check the game_id */
		var game_id = players[socket.id].room;
		if (('undefined' === typeof game_id) || !game_id){
			var error_message = 'play_token can\'t find your game board';
			log(error_message);
			socket.emit('play_token_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		/* Check the row */
		var row = payload.row;
		if (('undefined' === typeof row) || row < 0 || row > 7){
			var error_message = 'play_token didn\'t specify a row: Command Aborted';
			log(error_message);
			socket.emit('play_token_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		/* Check the row */
		var column = payload.column;
		if (('undefined' === typeof column) || column < 0 || column > 7){
			var error_message = 'play_token didn\'t specify a column: Command Aborted';
			log(error_message);
			socket.emit('play_token_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		/* Check the color */
		var color = payload.color;
		if (('undefined' === typeof color) || !color || (color != 'white' && color != 'black')){
			var error_message = 'play_token didn\'t specify a valid color: Command Aborted';
			log(error_message);
			socket.emit('play_token_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		/* Check the game */
		var game = games[game_id];
		if (('undefined' === typeof game) || !game){
			var error_message = 'play_token couldn\'t find your game board: Command Aborted';
			log(error_message);
			socket.emit('play_token_response', { result: 'fail',
				message: error_message
			});
			return;
		}

		var success_data = {
			result: 'success'
		};

		socket.emit('play_token_response', success_data);

		/* Execute the move */
		if(color == 'white'){
			game.board[row][column] = 'w';
			game.whose_turn = 'black';
		} else if (color == 'black') {
			game.board[row][column] = 'b';
			game.whose_turn = 'white';
		}

		var d = new Date();
		game.last_move_time = d.getTime();

		send_game_update(socket, game_id, 'played a token');
	});
});

/*****************************************/
/* Code related to game state */

var games = [];

function create_new_game(){
	var new_game = {};
	new_game.player_white = {};
	new_game.player_black = {};
	new_game.player_white.socket = '';
	new_game.player_white.username = '';
	new_game.player_black.socket = '';
	new_game.player_black.username = '';

	var d = new Date();
	new_game.last_move_time = d.getTime();

	new_game.whose_turn = 'white';

	new_game.board = [
		[' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
		[' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
		[' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
		[' ', ' ', ' ', 'w', 'b', ' ', ' ', ' '],
		[' ', ' ', ' ', 'b', 'w', ' ', ' ', ' '],
		[' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
		[' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
		[' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ']
	];

	return new_game;


}

function send_game_update(socket, game_id, message){
	/* Check to see if a game with game_id exists */
	if (('undefined' === typeof games[game_id]) || !games[game_id]){
		/* No game exists so make one */
		console.log('No game exists. Creating '+game_id+' for '+socket.id);
		games[game_id] = create_new_game();
	}

	/* Make sure that only two people are in the room */
	var roomObject;
	var numClients;
	do{
		roomObject = io.sockets.adapter.rooms[game_id];
		numClients = roomObject.length;
		if(numClients > 2){
			console.log('Too many clients in room: '+game_id+' #: '+numClients);
			if(games[game_id].player_white.socket == roomObject.sockets[0]){
				games[game_id].player_white.socket = '';
				games[game_id].player_white.username = '';
			}

			if(games[game_id].player_black.socket == roomObject.sockets[0]){
				games[game_id].player_black.socket = '';
				games[game_id].player_black.username = '';
			}
			/* Kick one of the extra people out */
			var sacrifice = Object.keys(roomObject.sockets)[0];
			io.of('/').connected[sacrifice].leave(game_id);
		}
	}while((numClients-1) > 2);

	/* Assign this socket a color */
	/* If the current player isn't assigned a color */
	if ((games[game_id].player_white.socket != socket.id) && (games[game_id].player_black.socket != socket.id)){
		console.log('Player isn\'t assigned a color: '+socket.id);
		/* and there isn't a color to give them */
		if ((games[game_id].player_black.socket != '') && (games[game_id].player_white.socket != '')){
			games[game_id].player_white.socket = '';
			games[game_id].player_white.username = '';
			games[game_id].player_black.socket = '';
			games[game_id].player_black.username = '';
		}
	}

	/* Assign colors to the players if they aren't already done */
	if (games[game_id].player_white.socket == ''){
		if(games[game_id].player_black.socket != socket.id){
			games[game_id].player_white.socket = socket.id;
			games[game_id].player_white.username = players[socket.id].username;
		}
	}

	if (games[game_id].player_black.socket == ''){
		if(games[game_id].player_white.socket != socket.id){
			games[game_id].player_black.socket = socket.id;
			games[game_id].player_black.username = players[socket.id].username;
		}
	}

	/* Send game update */
	var success_data = {
		result : 'success',
		game: games[game_id],
		message: message,
		game_id: game_id
	};

	io.in(game_id).emit('game_update', success_data);

	/* Check to see if the game is over */
}
