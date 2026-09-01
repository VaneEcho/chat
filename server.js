require('dotenv').config()
const express = require('express')
const app = express()

// Basic security headers. style-src keeps 'unsafe-inline' because the
// client sets inline styles via the DOM style API (e.g. img.style.cssText)
// when rendering shared images; script-src does not need it since the
// page ships no inline <script> content.
app.use(function(req, res, next){
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("X-Frame-Options", "DENY");
	res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
	res.setHeader("Content-Security-Policy", [
		"default-src 'self'",
		"script-src 'self'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"media-src 'self' data: blob:",
		"connect-src 'self' ws: wss:",
		"object-src 'none'",
		"base-uri 'self'",
		"frame-ancestors 'none'",
	].join('; '));
	next();
});

app.get('/healthz', function(req, res){
	res.json({ status: "ok" });
});

const path = require('path')
const html = path.join(__dirname, '/html');
app.use(express.static(html))

const port = process.env.PORT || process.argv[2] || 8090;
const http = require("http").Server(app);

const maxHttpBufferSizeInMb = parseInt(process.env.MAX_HTTP_BUFFER_SIZE_MB || '1');
const io = require("socket.io")(http, {
  maxHttpBufferSize: maxHttpBufferSizeInMb * 1024 * 1024,
});

const MAX_NICK_LENGTH = parseInt(process.env.MAX_NICK_LENGTH) || 32;
const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH) || 4000;
const MAX_MESSAGES_PER_WINDOW = parseInt(process.env.MAX_MESSAGES_PER_WINDOW) || 5;
const MESSAGE_WINDOW_MS = parseInt(process.env.MESSAGE_WINDOW_MS) || 5000;
const MAX_CACHE_SIZE = 500;

// default cache size to zero. override in environment. clamped so it
// can't be set to something large enough to grow memory unbounded.
const cache_size = Math.min(Math.max(parseInt(process.env.CACHE_SIZE) || 0, 0), MAX_CACHE_SIZE)

const MAX_ROOM_LENGTH = parseInt(process.env.MAX_ROOM_LENGTH) || 64;
const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function isValidRoomId(room){
	return typeof room === "string" && room.length > 0 && room.length <= MAX_ROOM_LENGTH && ROOM_ID_PATTERN.test(room);
}

http.listen(port, function(){
	// Log the actually-bound port, not the requested one — matters
	// when PORT=0 asks the OS to pick a free port for us.
	console.log("Starting server on port %s", http.address().port);
});

// roomId -> { users: string[], messageCache: object[], msgId: number, password: string }
// Rooms are created on first join and deleted once the last member
// leaves, so memory use tracks live occupancy rather than growing
// without bound.
const rooms = new Map();

io.sockets.on("connection", function(socket){
	console.log("New connection!");

	var nick = null;
	var currentRoom = null;
	var messageTimestamps = [];

	socket.on("login", function(data){
		// Security checks
		if(typeof data !== "object" || data === null || typeof data.nick !== "string" || typeof data.room !== "string"){
			socket.emit("force-login", "Nick can't be empty.");
			return;
		}

		const room = data.room.trim();
		if(!isValidRoomId(room)){
			socket.emit("force-login", "Invalid room.");
			return;
		}

		data.nick = data.nick.trim();

		// If is empty
		if(data.nick == ""){
			socket.emit("force-login", "Nick can't be empty.");
			return;
		}

		// If is too long
		if(data.nick.length > MAX_NICK_LENGTH){
			socket.emit("force-login", `Nick is too long (max ${MAX_NICK_LENGTH} characters).`);
			return;
		}

		const password = typeof data.password === "string" ? data.password : "";
		let roomState = rooms.get(room);

		if(roomState){
			// If room password doesn't match
			if(roomState.password !== password){
				socket.emit("force-login", "Wrong room password.");
				return;
			}

			// If nick is already in this room
			if(roomState.users.indexOf(data.nick) != -1){
				socket.emit("force-login", "This nick is already in chat.");
				return;
			}
		} else {
			// First person in: create the room, and set its password.
			roomState = { users: [], messageCache: [], msgId: 1, password: password };
			rooms.set(room, roomState);
		}

		// Save nick
		nick = data.nick;
		currentRoom = room;
		roomState.users.push(nick);

		console.log("User %s joined room %s.", nick.replace(/(<([^>]+)>)/ig, ""), room);
		socket.join(room);

		// Tell everyone, that user joined
		io.to(room).emit("ue", {
			"nick": nick
		});

		// Tell this user who is already in
		socket.emit("start", {
			"users": roomState.users,
			"room": room
		});

		// Send the message cache to the new user
		socket.emit("previous-msg", {
			"msgs": roomState.messageCache
		});
	});

	socket.on("send-msg", function(data){
		// If is logged in
		if(nick == null){
			socket.emit("force-login", "You need to be logged in to send message.");
			return;
		}

		const roomState = rooms.get(currentRoom);
		if(!roomState) return;

		// Flood protection: drop messages once this connection exceeds
		// MAX_MESSAGES_PER_WINDOW within MESSAGE_WINDOW_MS.
		const now = Date.now();
		messageTimestamps = messageTimestamps.filter(t => now - t < MESSAGE_WINDOW_MS);
		if(messageTimestamps.length >= MAX_MESSAGES_PER_WINDOW){
			console.log("Rate limit triggered for %s.", nick.replace(/(<([^>]+)>)/ig, ""));
			return;
		}
		messageTimestamps.push(now);

		if(typeof data !== "object" || data === null || typeof data.m !== "object" || data.m === null){
			return;
		}

		// If it's a text message, enforce a length cap. Non-text payloads
		// (file/image attachments) are bounded separately by
		// MAX_HTTP_BUFFER_SIZE_MB at the transport level.
		const isTextMessage = typeof data.m.text !== "undefined";
		if(isTextMessage && (typeof data.m.text !== "string" || data.m.text.length > MAX_MESSAGE_LENGTH)){
			return;
		}

		const msg = {
			"f": nick,
			"m": data.m,
			"id": "msg_" + (roomState.msgId++)
		}

		// Keep file/image attachments out of the in-memory history cache,
		// so a handful of large uploads can't balloon server memory.
		if(isTextMessage){
			roomState.messageCache.push(msg);
			if(roomState.messageCache.length > cache_size){
				roomState.messageCache.shift(); // Remove the oldest message
			}
		}

		// Send everyone message
		io.to(currentRoom).emit("new-msg", msg);

		console.log("User %s sent message.", nick.replace(/(<([^>]+)>)/ig, ""));
	});

	socket.on("typing", function(typing){
		// Only logged in users
		if(nick != null){
			socket.broadcast.to(currentRoom).emit("typing", {
				status: typing,
				nick: nick
			});

			console.log("%s %s typing.", nick.replace(/(<([^>]+)>)/ig, ""), typing ? "is" : "is not");
		}
	});

	socket.on("disconnect", function(){
		console.log("Got disconnect!");

		if(nick != null){
			const roomState = rooms.get(currentRoom);

			if(roomState){
				// Remove user from room
				roomState.users.splice(roomState.users.indexOf(nick), 1);

				// Tell everyone user left
				io.to(currentRoom).emit("ul", {
					"nick": nick
				});

				// Destroy the room once it's empty.
				if(roomState.users.length === 0){
					rooms.delete(currentRoom);
				}
			}

			console.log("User %s left room %s.", nick.replace(/(<([^>]+)>)/ig, ""), currentRoom);
			socket.leave(currentRoom);
			nick = null;
			currentRoom = null;
		}
	});
});

function shutdown(){
	console.log("Shutting down...");
	io.close(function(){
		http.close(function(){
			process.exit(0);
		});
	});

	// Force exit if connections don't close in time.
	setTimeout(function(){
		process.exit(1);
	}, 5000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
