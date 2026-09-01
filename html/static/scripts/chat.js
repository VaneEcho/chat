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
	login_connecting: document.getElementById("login-connecting"),
	login_card_content: document.getElementById("login-card-content"),
	login_form: document.getElementById("login-form"),
	nick_input: document.getElementById("nick-input"),
	password_input: document.getElementById("password-input"),
	login_error: document.getElementById("login-error"),
	chat_screen: document.getElementById("chat-screen"),

	room_preview_name: document.getElementById("room-preview-name"),
	reroll_room_btn: document.getElementById("reroll-room-btn"),
	copy_room_btn: document.getElementById("copy-room-btn"),
	share_btn: document.getElementById("share_btn"),
	new_room_btn: document.getElementById("new_room_btn"),
	qr_btn: document.getElementById("qr_btn"),
	qr_modal: document.getElementById("qr-modal"),
	qr_modal_backdrop: document.getElementById("qr-modal-backdrop"),
	qr_close_btn: document.getElementById("qr-close-btn"),
	qr_code_container: document.getElementById("qr-code-container"),

	users_panel: document.getElementById("users-panel"),
	users_backdrop: document.getElementById("users-backdrop"),

	attach_btn: document.getElementById("attach_btn"),
	file_input: document.getElementById("file_input"),
	photo_btn: document.getElementById("photo_btn"),
	photo_input: document.getElementById("photo_input"),

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

	// Matches the server's default MAX_HTTP_BUFFER_SIZE_MB (10). A
	// deployment that overrides that env var won't be reflected here —
	// the server enforces the real limit regardless, this is just an
	// early, friendlier check before spending time reading the file.
	MAX_UPLOAD_BYTES: 10 * 1024 * 1024,

	send_file: function(file){
		if(file.size > Chat.MAX_UPLOAD_BYTES){
			alert("Max file size is 10MB");
			return;
		}

		var reader = new FileReader();
		reader.onload = function(e){
			Chat.send_msg({
				type: file.type,
				name: file.name,
				url: e.target.result
			});
		};
		reader.readAsDataURL(file);
	},

	send_files: function(fileList){
		for(var i = 0; i < fileList.length; i++){
			Chat.send_file(fileList[i]);
		}
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
			if(Object.prototype.hasOwnProperty.call(Chat.typing.objects, nick)){
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

		// The <li> holds the prefix and message bubble as direct
		// children — it's already the flex column that
		// align-items:flex-end/flex-start (below) positions them
		// with. An earlier version wrapped them in an extra unstyled
		// div first, which put a block-level element with
		// indeterminate shrink-to-fit sizing between the flex
		// container and its real content, and bubbles ended up
		// inconsistently widthed/positioned depending on their
		// content.
		var c = document.createElement('li');
		c.id = r.id;
		if (fromSelf){
			c.classList.add('message-from-self');
		}

		var prefix = document.createElement('span');
		prefix.className = 'prefix';
		prefix.innerText = r.f;
		c.appendChild(prefix);

		if(Chat.last_sent_nick === r.f){
			prefix.hidden = true;
		} else {
			Chat.last_sent_nick = r.f;
		}

		var msg = document.createElement('div');
		msg.className = 'message';

		var body = document.createElement('span');
		body.className = 'body' + (fromSelf ? ' out' : ' in');
		Chat.append_msg(body, r.m);

		msg.appendChild(body);
		c.appendChild(msg);

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
			text = text.replace(/(https?:\/\/[^\s]+)/g, function(url){
				var link = document.createElement('a');
				link.target = "_blank";

				// Un-escape
				link.innerHTML = url;
				url = link.innerText;
				link.href = url;

				// If link is image
				if(url.match(/.(png|jpe?g|gifv?)([?#].*)?$/g)){
					var img = document.createElement('img');
					img.className = 'shared-image';
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
			// A cached placeholder for a file/image that was never
			// stored in history — the message existed, its data didn't.
			if(msg.placeholder){
				var placeholder = document.createElement('span');
				placeholder.className = 'file-placeholder';
				placeholder.innerText = "📎 " + (msg.name || "a file") + " (not available in history)";
				el.appendChild(placeholder);
				return;
			}

			// Image
			if(msg.type.match(/image.*/)){
				var img = document.createElement('img');
				img.className = 'shared-image';
				img.style = 'max-width:100%;';
				img.src = msg.url;
				el.appendChild(img);
				return;
			}

			// Audio / Video
			var m = msg.type.match(/(audio|video).*/);
			if(m){
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

	// Shared word lists for generating both room ids and default
	// nicknames — adjective-noun-number reads and shares better than a
	// raw random string.
	word_adjectives: ["brave", "calm", "clever", "cosmic", "curious", "daring", "eager", "fuzzy",
		"gentle", "golden", "happy", "hidden", "jolly", "keen", "lively", "lucky", "merry", "mighty",
		"misty", "nimble", "quiet", "quick", "rapid", "rosy", "shiny", "silent", "silly", "sleepy",
		"smooth", "sneaky", "snowy", "sunny", "swift", "tidy", "tiny", "vivid", "witty", "wild",
		"wise", "zesty"],

	word_nouns: ["badger", "breeze", "canyon", "cloud", "comet", "coral", "dune", "eagle", "ember",
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

	// ~208,000 combinations — plenty for avoiding accidental room
	// collisions; a real secret room should still use the password
	// field.
	generate_room_id: function(){
		var adjective = Chat.word_adjectives[Chat.random_int(Chat.word_adjectives.length)];
		var noun = Chat.word_nouns[Chat.random_int(Chat.word_nouns.length)];
		var number = String(Chat.random_int(100)).padStart(2, "0");
		return adjective + "-" + noun + "-" + number;
	},

	generate_nickname: function(){
		var cap = function(s){ return s.charAt(0).toUpperCase() + s.slice(1); };
		var adjective = Chat.word_adjectives[Chat.random_int(Chat.word_adjectives.length)];
		var noun = Chat.word_nouns[Chat.random_int(Chat.word_nouns.length)];
		return cap(adjective) + cap(noun);
	},

	room_url: function(){
		var url = new URL(location.href);
		url.search = "";
		url.searchParams.set("room", Chat.room);
		return url.toString();
	},

	show_qr: function(){
		// Regenerated on every open rather than cached, so it always
		// reflects the current room even if it somehow changed since
		// the modal was last shown.
		var qr = qrcode(0, "M");
		qr.addData(Chat.room_url());
		qr.make();
		Chat.qr_code_container.innerHTML = qr.createSvgTag({ scalable: true });

		Chat.qr_modal.hidden = false;
	},

	close_qr: function(){
		Chat.qr_modal.hidden = true;
	},

	// A real navigation (not history.replaceState, which is what
	// setup_room uses for the initial silent room assignment): this is
	// a deliberate "leave this room" action, so it should land in
	// browser history — the back button then correctly returns to the
	// room this was clicked from, since that room's id is still in the
	// previous history entry's URL and setup_room() always prefers an
	// explicit ?room= over localStorage's remembered one.
	start_new_room: function(){
		// Forget the current session so the new room lands on the real
		// login screen instead of silently auto-joining with whatever
		// nickname/password happened to be remembered — a new room is
		// a deliberate fresh start, you should get to reconsider both.
		delete sessionStorage.nick;
		delete sessionStorage.password;

		var url = new URL(location.href);
		url.search = "";
		url.searchParams.set("room", Chat.generate_room_id());
		location.href = url.toString();
	},

	setup_room: function(){
		var params = new URLSearchParams(location.search);
		var room = params.get("room");

		if(!room){
			// No room in the URL: return to wherever we were last
			// (matters for the PWA home screen icon, which always
			// launches at the bare URL) instead of minting a brand
			// new empty room every time.
			room = localStorage.room || Chat.generate_room_id();
			params.set("room", room);
			history.replaceState(null, "", location.pathname + "?" + params.toString());
		}

		Chat.room = room;
		localStorage.room = room;
		Chat.update_room_preview();
	},

	update_room_preview: function(){
		Chat.room_preview_name.textContent = Chat.room;
	},

	// Login-screen-only "give me a different one": unlike
	// start_new_room (a real navigation, used once you've actually
	// joined a room and are deliberately leaving it), there's nothing
	// to leave yet here — just swap which room the login form would
	// join, silently, the same way setup_room's own random pick works.
	reroll_room: function(){
		var room = Chat.generate_room_id();
		var url = new URL(location.href);
		url.search = "";
		url.searchParams.set("room", room);
		history.replaceState(null, "", url.pathname + url.search);

		Chat.room = room;
		localStorage.room = room;
		Chat.update_room_preview();
	},

	// CSS's 100dvh doesn't reliably shrink when the on-screen keyboard
	// opens across mobile browsers — some just push the whole layout
	// up instead, hiding the top of the conversation behind the
	// keyboard. window.visualViewport reports the actual visible area
	// in real time, so drive .app's height from that directly when
	// it's available (falls back to plain CSS dvh/vh otherwise).
	setup_viewport_height: function(){
		if(!window.visualViewport) return;

		var apply = function(){
			document.getElementById("app").style.height = window.visualViewport.height + "px";
		};

		window.visualViewport.addEventListener("resize", apply);
		apply();
	},

	// Briefly swap a button's label to confirm the copy happened —
	// applied to whichever copy button triggered it.
	check_icon_svg: function(size){
		return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
	},

	flash_copied: function(btn){
		if(!btn || btn.dataset.flashing) return;
		var icon = btn.querySelector("svg");
		if(!icon) return;
		btn.dataset.flashing = "1";

		// Swap just the <svg> (via outerHTML, not the icon-only
		// btn.textContent trick this used to use — that read back as
		// "" and silently destroyed the icon instead of restoring it)
		// rather than the whole button: some of these buttons also
		// carry a text label ("Copy link"), and replacing all of it
		// would shrink the button for the flash's duration, shifting
		// its sibling in the row. Match the replacement's size to the
		// icon actually being replaced — not every copy button uses
		// the same icon size (header vs. login screen), and a
		// hardcoded size grew the button during the flash on whichever
		// one it didn't match.
		var size = icon.getAttribute("width") || "18";
		var original = icon.outerHTML;
		icon.outerHTML = Chat.check_icon_svg(size);
		setTimeout(function(){
			var current = btn.querySelector("svg");
			if(current) current.outerHTML = original;
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

		// Fallback that doesn't depend on any particular visible element
		// existing on the page (the header's share button has no
		// associated input to select from at all).
		var tmp = document.createElement("textarea");
		tmp.value = url;
		tmp.style.position = "fixed";
		tmp.style.opacity = "0";
		document.body.appendChild(tmp);
		tmp.focus();
		tmp.select();
		try { document.execCommand("copy"); } catch { /* best effort */ }
		document.body.removeChild(tmp);
		Chat.flash_copied(btn);
	},

	// Show the login screen. If `errorMessage` is set, this is a
	// rejected attempt (empty/too long/duplicate nick/wrong password)
	// rather than a fresh session, so the previous session's
	// credentials are dropped to avoid silently retrying them forever.
	// Shown instead of the (briefly blank) login form while a
	// remembered session is auto-resuming — on a real navigation (e.g.
	// the "new room" button) that round trip is a full page load, not
	// just a quick reconnect, so the flash was clearly visible and
	// looked like the nickname had been forgotten.
	show_connecting: function(){
		Chat.login_error.hidden = true;
		Chat.login_connecting.hidden = false;
		Chat.login_card_content.hidden = true;
		Chat.chat_screen.hidden = true;
		Chat.login_screen.hidden = false;
	},

	show_login: function(errorMessage){
		Chat.self_nick = null;
		Chat.login_connecting.hidden = true;
		Chat.login_card_content.hidden = false;

		if(errorMessage){
			delete sessionStorage.nick;
			delete sessionStorage.password;
			Chat.login_error.textContent = errorMessage;
			Chat.login_error.hidden = false;
		} else {
			Chat.login_error.hidden = true;
		}

		// Fresh browser, nothing remembered yet: suggest a random name
		// instead of an empty field. A rejected attempt already wrote
		// its (rejected) value to localStorage.nick before the server
		// replied, so this only kicks in for a genuinely first visit.
		Chat.nick_input.value = localStorage.nick || Chat.generate_nickname();
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
	// Mobile-width users drawer. On desktop the panel is always visible
	// via CSS and this is a harmless no-op (the "open" class/backdrop
	// only have any effect under the mobile breakpoint).
	toggle_users_panel: function(){
		var open = !Chat.users_panel.classList.contains("open");
		Chat.users_panel.classList.toggle("open", open);
		Chat.users_backdrop.hidden = !open;
	},

	close_users_panel: function(){
		Chat.users_panel.classList.remove("open");
		Chat.users_backdrop.hidden = true;
	},

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
				logoutBtn.className = 'icon-btn logout-btn';
				logoutBtn.title = 'Logout';
				logoutBtn.setAttribute('aria-label', 'Logout');
				logoutBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h9"/><path d="M11 12h9M17 8l4 4-4 4"/></svg>';
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
			if(Object.prototype.hasOwnProperty.call(Chat.user.objects, r.nick)){
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
		Chat.setup_viewport_height();

		// Decide the very first paint synchronously, before the socket
		// even connects: a remembered session is about to auto-resume,
		// so show a neutral "reconnecting" message instead of a
		// once-visible blank login form (only try_resume_session, on
		// the async "connect" event, actually knows for sure — this
		// just avoids the flash while that's in flight).
		if(sessionStorage.nick){
			Chat.show_connecting();
		}

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
		Chat.reroll_room_btn.onclick = Chat.reroll_room;
		Chat.share_btn.onclick = Chat.copy_room_link;
		Chat.new_room_btn.onclick = Chat.start_new_room;

		Chat.qr_btn.onclick = Chat.show_qr;
		Chat.qr_close_btn.onclick = Chat.close_qr;
		Chat.qr_modal_backdrop.onclick = Chat.close_qr;

		Chat.online_count.onclick = Chat.toggle_users_panel;
		Chat.users_backdrop.onclick = Chat.close_users_panel;

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
			Chat.send_files(e.dataTransfer.files);
		});

		// Click-to-upload: drag-and-drop alone isn't a thing on touch
		// devices, so there was previously no way to attach a file on
		// mobile at all. Two separate inputs rather than one: an
		// unrestricted file input (any file type, no camera/gallery
		// chooser) and a dedicated image/video one (accept="image/*,
		// video/*", no `capture` attribute so mobile browsers offer
		// BOTH "Take Photo" and "Choose from Library", not just one).
		Chat.attach_btn.onclick = function(){
			Chat.file_input.click();
		};
		Chat.file_input.onchange = function(){
			Chat.send_files(Chat.file_input.files);
			Chat.file_input.value = ""; // allow re-selecting the same file later
		};

		Chat.photo_btn.onclick = function(){
			Chat.photo_input.click();
		};
		Chat.photo_input.onchange = function(){
			Chat.send_files(Chat.photo_input.files);
			Chat.photo_input.value = "";
		};

		// close socket upon refresh or tab close, free the username
		window.addEventListener("beforeunload", () => {
			if(!Chat.is_online){
				return;
			}
			Chat.socket.disconnect();
		});
	}
};
