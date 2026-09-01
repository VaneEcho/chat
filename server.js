require('dotenv').config()
const express = require('express')
const app = express()

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
const MAX_CACHE_SIZE = 500;

let messageCache = [];
// default cache size to zero. override in environment. clamped so it
// can't be set to something large enough to grow memory unbounded.
let cache_size = Math.min(Math.max(parseInt(process.env.CACHE_SIZE) || 0, 0), MAX_CACHE_SIZE)

http.listen(port, function(){
	console.log("Starting server on port %s", port);
});

const users = [];
let msg_id = 1;
io.sockets.on("connection", function(socket){
	console.log("New connection!");

	var nick = null;

	socket.on("login", function(data){
		// Security checks
		if(typeof data !== "object" || data === null || typeof data.nick !== "string"){
			socket.emit("force-login", "Nick can't be empty.");
			nick = null;
			return;
		}

		data.nick = data.nick.trim();

		// If is empty
		if(data.nick == ""){
			socket.emit("force-login", "Nick can't be empty.");
			nick = null;
			return;
		}

		// If is too long
		if(data.nick.length > MAX_NICK_LENGTH){
			socket.emit("force-login", `Nick is too long (max ${MAX_NICK_LENGTH} characters).`);
			nick = null;
			return;
		}

		// If is already in
		if(users.indexOf(data.nick) != -1){
			socket.emit("force-login", "This nick is already in chat.");
			nick = null;
			return;
		}

		// Save nick
		nick = data.nick;
		users.push(data.nick);

		console.log("User %s joined.", nick.replace(/(<([^>]+)>)/ig, ""));
		socket.join("main");

		// Tell everyone, that user joined
		io.to("main").emit("ue", {
			"nick": nick
		});

		// Tell this user who is already in
		socket.emit("start", {
			"users": users
		});

		// Send the message cache to the new user
		console.log(`going to send cache to ${nick}`)
		socket.emit("previous-msg", {
			"msgs": messageCache
		});
	});

	socket.on("send-msg", function(data){
		// If is logged in
		if(nick == null){
			socket.emit("force-login", "You need to be logged in to send message.");
			return;
		}

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
			"id": "msg_" + (msg_id++)
		}

		// Keep file/image attachments out of the in-memory history cache,
		// so a handful of large uploads can't balloon server memory.
		if(isTextMessage){
			messageCache.push(msg);
			if(messageCache.length > cache_size){
				messageCache.shift(); // Remove the oldest message
			}
		}

		// Send everyone message
		io.to("main").emit("new-msg", msg);

		console.log("User %s sent message.", nick.replace(/(<([^>]+)>)/ig, ""));
	});

	socket.on("typing", function(typing){
		// Only logged in users
		if(nick != null){
			socket.broadcast.to("main").emit("typing", {
				status: typing,
				nick: nick
			});

			console.log("%s %s typing.", nick.replace(/(<([^>]+)>)/ig, ""), typing ? "is" : "is not");
		}
	});

	socket.on("disconnect", function(){
		console.log("Got disconnect!");

		if(nick != null){
			// Remove user from users
			users.splice(users.indexOf(nick), 1);

			// Tell everyone user left
			io.to("main").emit("ul", {
				"nick": nick
			});

			console.log("User %s left.", nick.replace(/(<([^>]+)>)/ig, ""));
			socket.leave("main");
			nick = null;
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
