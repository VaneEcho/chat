var Chat = {
	socket: null,

	loading: document.getElementById("loading"),
	chat_box: document.getElementById("chat-box"),
	msgs_list: document.getElementById("msgs"),
	typing_list: document.getElementById("typing"),
	users: document.getElementById("users"),
	online_count: document.getElementById("online-count"),
	textarea: document.getElementById("form_input"),
	send_btn: document.getElementById("send"),

	login_screen: document.getElementById("login-screen"),
	login_form: document.getElementById("login-form"),
	nick_input: document.getElementById("nick-input"),
	password_input: document.getElementById("password-input"),
	login_error: document.getElementById("login-error"),
	chat_screen: document.getElementById("chat-screen"),

	room_address_input: document.getElementById("room-address-input"),
	copy_room_btn: document.getElementById("copy-room-btn"),
	share_btn: document.getElementById("share_btn"),

	room: null,

	is_focused: false,
	is_online: false,
	is_typing: false,
	last_sent_nick: null,

	original_title: document.title,
	new_title: "New messages...",

	scroll: function(){
		setTimeout(function(){
			Chat.chat_box.scrollTop = Chat.chat_box.scrollHeight;
		}, 0)
	},

	notif: {
		enabled: true,

		toggle: function(){
			return Chat.notif.enabled = !Chat.notif.enabled;
		},

		// Title time-out
		active: undefined,
		msgs: 0,

		// Beep notification
		beep: undefined,
		beep_create: function(){
			var audiotypes = {
				"mp3": "audio/mpeg",
				"mp4": "audio/mp4",
				"ogg": "audio/ogg",
				"wav": "audio/wav"
			};

			var audios = [
				'static/beep.ogg'
			];

			var audio_element = document.createElement('audio');
			if(audio_element.canPlayType){
				for(var i = 0;i < audios.length;i++){
					var source_element = document.createElement('source');
					source_element.setAttribute('src', audios[i]);
					if(audios[i].match(/\.(\w+)$/i)){
						source_element.setAttribute('type', audiotypes[RegExp.$1]);
					}
					audio_element.appendChild(source_element);
				}

				audio_element.load();
				audio_element.playclip = function(){
					audio_element.pause();
					audio_element.volume = 0.5;
					audio_element.currentTime = 0;
					audio_element.play();
				};

				return audio_element;
			}
		},

		// Create new notification
		create: function(from, message){
			// If is focused, no notification
			if(Chat.is_focused || !Chat.notif.enabled){
				return;
			}

			// Increase number in title. Set once and leave it — no
			// blinking back and forth, that's just distracting.
			Chat.notif.msgs++;
			Chat.notif.favicon('blue');
			document.title = '(' + Chat.notif.msgs + ') ' + Chat.new_title;

			// Do beep
			Chat.notif.beep.playclip();

			// If are'nt allowed notifications
			if(Notification.permission !== "granted"){
				Notification.requestPermission();
				return;
			}

			// Clear notification
			Chat.notif.clear();

			// Strip tags
			from = from.replace(/(<([^>]+)>)/ig, "");
			message = message.text?.replace(/(<([^>]+)>)/ig, "");

			// Create new notification
			Chat.notif.active = new Notification(from, {
				icon: 'static/images/favicon-blue.png',
				//timeout: 10,
				body: message,
			});

			// On click, focus this window
			Chat.notif.active.onclick = function(){
				parent.focus();
				window.focus();
			};
		},

		// Clear notification
		clear: function(){
			typeof Chat.notif.active === "undefined" || Chat.notif.active.close();
		},

		favicon: function(color){
			var link = document.querySelector("link[rel*='icon']") || document.createElement('link');
			link.type = 'image/x-icon';
			link.rel = 'shortcut icon';
			link.href = 'static/images/favicon-' + color + '.ico';
			document.getElementsByTagName('head')[0].appendChild(link);
		}
	},

	send_msg: function(text){
		Chat.socket.emit("send-msg", {
			m: text
		});
	},

	send_event: function(){
		var value = Chat.textarea.value.trim();
		if(value == "") return;

		console.log("Send message.");

		Chat.send_msg({text: value});

		Chat.textarea.value = '';
		Chat.typing.update();
		Chat.textarea.focus();
	},

	typing: {
		objects: {},

		create: function(nick){
			var li = document.createElement('li');

			var prefix = document.createElement('span');
			prefix.className = 'prefix';
			prefix.innerText = nick;
			li.appendChild(prefix);

			var msg = document.createElement('div');
			msg.className = 'message';

			var body = document.createElement('span');
			body.className = 'body writing'
			body.innerHTML = '<span class="one">&bull;</span><span class="two">&bull;</span><span class="three">&bull;</span>';
			msg.appendChild(body);

			li.appendChild(msg);

			Chat.typing_list.appendChild(li);

			Chat.typing.objects[nick] = li;

			// Scroll to new message
			Chat.scroll();
		},

		remove: function(nick){
			if(Chat.typing.objects.hasOwnProperty(nick)){
				var element = Chat.typing.objects[nick];
				element.parentNode.removeChild(element);
				delete Chat.typing.objects[nick];
			}
		},

		event: function(r){
			if(r.status){
				Chat.typing.create(r.nick);
			} else {
				Chat.typing.remove(r.nick);
			}
		},

		update: function(){
			if(Chat.is_typing && Chat.textarea.value === ""){
				Chat.socket.emit("typing", Chat.is_typing = false);
			}

			if(!Chat.is_typing && Chat.textarea.value !== ""){
				Chat.socket.emit("typing", Chat.is_typing = true);
			}
		}
	},

	new_msg: function(r){
		console.log("New message.");
		const fromSelf = sessionStorage.nick == r.f;

		// Notify user
		Chat.notif.create(r.f, r.m);

		var li = document.createElement('div');
		li.id = r.id;

		var prefix = document.createElement('span');
		prefix.className = 'prefix';
		prefix.innerText = r.f;
		li.appendChild(prefix);

		if(Chat.last_sent_nick === r.f){
			prefix.style.display = "none";
			li.prefix = prefix;
		} else {
			Chat.last_sent_nick = r.f;
		}

		var msg = document.createElement('div');
		msg.className = 'message';

		var body = document.createElement('span');
		body.className = 'body' + (fromSelf ? ' out' : ' in');
		Chat.append_msg(body, r.m);

		msg.appendChild(body);

		li.appendChild(msg);

		var c = document.createElement('li');
		c.appendChild(li);
		if (fromSelf){
			c.classList.add('message-from-self');
		}

		// Prepend because flex-direction: column-reverse
		Chat.msgs_list.prepend(c);

		// Scroll to new message
		Chat.scroll();
	},

	append_msg: function(el, msg){
		if(!msg) return;

		// If is object
		if(typeof msg.text !== 'undefined'){
			// Escape HTML
			el.innerText = msg.text;
			var text = el.innerHTML;

			// Parse urls
			text = text.replace(/(https?:\/\/[^\s]+)/g, function(url, a, b){
				var link = document.createElement('a');
				link.target = "_blank";

				// Un-escape
				link.innerHTML = url;
				url = link.innerText;
				link.href = url;

				// If link is image
				if(url.match(/.(png|jpe?g|gifv?)([?#].*)?$/g)){
					var img = document.createElement('img');
					img.style = 'max-width:100%;';
					img.src = url;

					link.innerText = "";
					link.appendChild(img);
				}

				return link.outerHTML;
			});

			if(typeof Emic !== 'undefined'){
				text = Emic.replace(text);
			}

			el.innerHTML = text;
		}

		if(typeof msg.type !== 'undefined'){
			// Image
			if(msg.type.match(/image.*/)){
				var img = document.createElement('img');
				img.style = 'max-width:100%;';
				img.src = msg.url;
				el.appendChild(img);
				return;
			}

			// Audio / Video
			if(m = msg.type.match(/(audio|video).*/)){
				var audio = document.createElement(m[1]);
				audio.controls = 'controls';

				var source = document.createElement("source");
				source.src = msg.url;
				source.type = msg.type;
				audio.appendChild(source);

				el.appendChild(audio);
				return;
			}

			// Default
			var link = document.createElement('a');
			link.href = msg.url;
			link.download = msg.name;
			link.innerText = msg.name;
			el.appendChild(link);
		}
	},

	// Room id lives in the URL (?room=xxx) so it can be shared as a
	// link. If none is present, generate one and put it in the address
	// bar without a page reload. Adjective-noun-number reads and
	// shares better than a raw random string (~208,000 combinations —
	// plenty for avoiding accidental collisions; a real secret room
	// should still use the password field).
	room_adjectives: ["brave", "calm", "clever", "cosmic", "curious", "daring", "eager", "fuzzy",
		"gentle", "golden", "happy", "hidden", "jolly", "keen", "lively", "lucky", "merry", "mighty",
		"misty", "nimble", "quiet", "quick", "rapid", "rosy", "shiny", "silent", "silly", "sleepy",
		"smooth", "sneaky", "snowy", "sunny", "swift", "tidy", "tiny", "vivid", "witty", "wild",
		"wise", "zesty"],

	room_nouns: ["badger", "breeze", "canyon", "cloud", "comet", "coral", "dune", "eagle", "ember",
		"falcon", "fern", "fjord", "forest", "fox", "glacier", "harbor", "hawk", "island", "jungle",
		"lagoon", "lantern", "meadow", "meteor", "moon", "mountain", "otter", "owl", "panda", "peak",
		"pebble", "phoenix", "planet", "prairie", "puma", "quartz", "raven", "reef", "ridge", "river",
		"robin", "shadow", "shore", "sparrow", "star", "stone", "storm", "summit", "thunder", "tiger",
		"tundra", "valley", "willow", "wolf"],

	random_int: function(max){
		var bytes = new Uint8Array(1);
		crypto.getRandomValues(bytes);
		return bytes[0] % max;
	},

	generate_room_id: function(){
		var adjective = Chat.room_adjectives[Chat.random_int(Chat.room_adjectives.length)];
		var noun = Chat.room_nouns[Chat.random_int(Chat.room_nouns.length)];
		var number = String(Chat.random_int(100)).padStart(2, "0");
		return adjective + "-" + noun + "-" + number;
	},

	room_url: function(){
		var url = new URL(location.href);
		url.search = "";
		url.searchParams.set("room", Chat.room);
		return url.toString();
	},

	setup_room: function(){
		var params = new URLSearchParams(location.search);
		var room = params.get("room");

		if(!room){
			room = Chat.generate_room_id();
			params.set("room", room);
			history.replaceState(null, "", location.pathname + "?" + params.toString());
		}

		Chat.room = room;
		Chat.room_address_input.value = Chat.room_url();
	},

	// Briefly swap a button's label to confirm the copy happened —
	// applied to whichever copy button triggered it.
	flash_copied: function(btn){
		if(!btn || btn.dataset.flashing) return;
		btn.dataset.flashing = "1";

		var original = btn.textContent;
		btn.textContent = "✓";
		setTimeout(function(){
			btn.textContent = original;
			delete btn.dataset.flashing;
		}, 1200);
	},

	copy_room_link: function(e){
		var url = Chat.room_url();
		var btn = e && e.currentTarget;

		if(navigator.clipboard && navigator.clipboard.writeText){
			navigator.clipboard.writeText(url).then(function(){
				Chat.flash_copied(btn);
			});
			return;
		}

		// Fallback that doesn't depend on any particular input being
		// visible/focusable (the room-address field is hidden once past
		// the login screen, so selecting it wouldn't work there).
		var tmp = document.createElement("textarea");
		tmp.value = url;
		tmp.style.position = "fixed";
		tmp.style.opacity = "0";
		document.body.appendChild(tmp);
		tmp.focus();
		tmp.select();
		try { document.execCommand("copy"); } catch (e) {}
		document.body.removeChild(tmp);
		Chat.flash_copied(btn);
	},

	// Show the login screen. If `errorMessage` is set, this is a
	// rejected attempt (empty/too long/duplicate nick/wrong password)
	// rather than a fresh session, so the previous session's
	// credentials are dropped to avoid silently retrying them forever.
	show_login: function(errorMessage){
		Chat.self_nick = null;

		if(errorMessage){
			delete sessionStorage.nick;
			delete sessionStorage.password;
			Chat.login_error.textContent = errorMessage;
			Chat.login_error.hidden = false;
		} else {
			Chat.login_error.hidden = true;
		}

		Chat.nick_input.value = localStorage.nick || "";
		Chat.password_input.value = "";
		Chat.chat_screen.hidden = true;
		Chat.login_screen.hidden = false;
		Chat.nick_input.focus();
	},

	submit_login: function(nick, password){
		nick = (nick || "").trim();
		if(!nick) return;
		password = password || "";

		Chat.self_nick = nick;
		sessionStorage.nick = localStorage.nick = nick;
		sessionStorage.password = password;
		Chat.socket.emit("login", { nick: nick, room: Chat.room, password: password });
	},

	// End this session so the tab is ready for a different nickname:
	// forget the remembered session, then bounce the connection so the
	// server's normal disconnect handling (leave room, notify others)
	// runs and we land back on the login screen.
	logout: function(){
		delete sessionStorage.nick;
		delete sessionStorage.password;
		Chat.socket.disconnect();
		Chat.socket.connect();
	},

	on_login_success: function(){
		Chat.login_screen.hidden = true;
		Chat.chat_screen.hidden = false;
	},

	// If this tab already had a nick this session (e.g. the page was
	// refreshed, or the socket reconnected after a network drop),
	// re-join automatically instead of asking again.
	try_resume_session: function(){
		if(sessionStorage.nick){
			Chat.submit_login(sessionStorage.nick, sessionStorage.password);
		} else {
			Chat.show_login();
		}
	},

	user: {
		objects: {},

		update_count: function(){
			var n = Object.keys(Chat.user.objects).length;
			Chat.online_count.textContent = n + " online";
		},

		// Build a user list entry. Self gets a Logout button so this
		// tab can become a different user next time.
		create_entry: function(nick){
			var li = document.createElement('li');

			var label = document.createElement('span');
			label.className = 'user-name';
			label.innerText = nick;
			li.appendChild(label);

			if(nick === Chat.self_nick){
				li.classList.add('is-self');

				var logoutBtn = document.createElement('button');
				logoutBtn.type = 'button';
				logoutBtn.className = 'logout-btn';
				logoutBtn.innerText = 'Logout';
				logoutBtn.onclick = Chat.logout;
				li.appendChild(logoutBtn);
			}

			return li;
		},

		// Load all users. Self is always shown first.
		start: function(r){
			Chat.users.innerText = '';
			Chat.user.objects = {};

			var names = r.users.slice();
			var selfIndex = names.indexOf(Chat.self_nick);
			if(selfIndex > 0){
				names.splice(selfIndex, 1);
				names.unshift(Chat.self_nick);
			}

			names.forEach(function(name){
				var li = Chat.user.create_entry(name);
				Chat.users.appendChild(li);
				Chat.user.objects[name] = li;
			});

			Chat.user.update_count();
			Chat.on_login_success();
		},

		previous_messages: function(data){
			console.log(`msgs: ${data}`)

			data.msgs.forEach(element => {
				Chat.new_msg(element)
			});
		},

		// User joined room
		enter: function(r){
			console.log("User " + r.nick + " joined.");

			var li = Chat.user.create_entry(r.nick);
			Chat.users.appendChild(li);
			Chat.user.objects[r.nick] = li;
			Chat.user.update_count();
		},

		// User left room
		leave: function(r){
			console.log("User " + r.nick + " left.");

			// Is not typing
			Chat.typing.remove(r.nick);

			// Remove user
			if(Chat.user.objects.hasOwnProperty(r.nick)){
				var element = Chat.user.objects[r.nick];
				element.parentNode.removeChild(element);
				delete Chat.user.objects[r.nick];
			}
			Chat.user.update_count();
		}
	},

	connect: function(){
		// Set green favicon
		Chat.notif.favicon('green');
		Chat.is_online = true;

		document.getElementById('offline').hidden = true;
		Chat.msgs_list.innerText = '';
		Chat.typing_list.innerText = '';
		Chat.users.innerText = '';
		Chat.user.objects = {};
		Chat.last_sent_nick = '';

		Chat.try_resume_session();
	},

	disconnect: function(){
		// Set green favicon
		Chat.notif.favicon('red');
		Chat.is_online = false;

		document.getElementById('offline').hidden = false;
	},

	init: function(socket){
		// Parse/generate the room id before anything else can need it.
		Chat.setup_room();

		// Set green favicon
		Chat.notif.favicon('red');

		// Connect to socket.io
		Chat.socket = socket || io();

		// Create beep object
		Chat.notif.beep = Chat.notif.beep_create();

		// On focus
		window.addEventListener('focus', function(){
			Chat.is_focused = true;

			// If chat is not online, dont care.
			if(!Chat.is_online){
				return;
			}

			// Clear notifications
			Chat.notif.clear();
			Chat.notif.msgs = 0;
			Chat.notif.favicon('green');

			// Set back page title
			document.title = Chat.original_title;
		});

		// On blur
		window.addEventListener('blur', function(){
			Chat.is_focused = false;
		});

		// On click send message
		Chat.send_btn.onclick = Chat.send_event;

		// On enter send message
		Chat.textarea.onkeydown = function(e){
			var key = e.keyCode || window.event.keyCode;

			// If the user has pressed enter
			if(key === 13){
				Chat.send_event();
				return false;
			}

			return true;
		};

		// Check if is user typing
		Chat.textarea.onkeyup = Chat.typing.update;

		// Login form submit
		Chat.login_form.onsubmit = function(e){
			e.preventDefault();
			Chat.submit_login(Chat.nick_input.value, Chat.password_input.value);
			return false;
		};

		// Copy room link (login screen and in-chat header)
		Chat.copy_room_btn.onclick = Chat.copy_room_link;
		Chat.share_btn.onclick = Chat.copy_room_link;

		// On socket events
		Chat.socket.on("connect", Chat.connect);
		Chat.socket.on("disconnect", Chat.disconnect);

		Chat.socket.on("force-login", Chat.show_login);
		Chat.socket.on("typing", Chat.typing.event);
		Chat.socket.on("new-msg", Chat.new_msg);

		Chat.socket.on("previous-msg", Chat.user.previous_messages)
		Chat.socket.on("start", Chat.user.start);
		Chat.socket.on("ue", Chat.user.enter);
		Chat.socket.on("ul", Chat.user.leave);

		var dropZone = document.getElementsByTagName("body")[0];

		// Optional. Show the copy icon when dragging over. Seems to only work for chrome.
		dropZone.addEventListener('dragover', function(e){
			e.stopPropagation();
			e.preventDefault();

			e.dataTransfer.dropEffect = 'copy';
		});

		// Get file data on drop
		dropZone.addEventListener('drop', function(e){
			e.stopPropagation();
			e.preventDefault();

			var files = e.dataTransfer.files; // Array of all files
			for(var i = 0;i < files.length;i++){
				var file = files[i];

				// Max 10 MB
				if(file.size > 10485760){
					alert("Max size of file is 10MB");
					return;
				}

				var reader = new FileReader();
				reader.onload = (function(file){
					return function(e){
						Chat.send_msg({
							type: file.type,
							name: file.name,
							url: e.target.result
						});
					};
				})(file);
				reader.readAsDataURL(file);
			}
		});

		// close socket upon refresh or tab close, free the username
		window.addEventListener("beforeunload", () => {
			if(!Chat.is_online){
				return;
			}
			Chat.socket.disconnect();
		});
	}
};
