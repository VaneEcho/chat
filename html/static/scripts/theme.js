// Two states only: "system" (follow the OS), or a manual override
// that's always the opposite of whatever the OS currently resolves
// to. Clicking toggles between them — no separate "light"/"dark"
// choices to think about.
var Theme = {
	key: "chat-theme",
	icons: { system: "◐", light: "☀", dark: "☾" },

	systemPrefersDark: function(){
		return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
	},

	get: function(){
		try {
			var v = localStorage.getItem(Theme.key);
			return (v === "light" || v === "dark") ? v : "system";
		} catch (e) {
			return "system";
		}
	},

	apply: function(value){
		if(value === "system"){
			document.documentElement.removeAttribute("data-theme");
		} else {
			document.documentElement.setAttribute("data-theme", value);
		}

		var btn = document.getElementById("theme_btn");
		if(btn){
			btn.textContent = Theme.icons[value];
			btn.title = "Theme: " + value + " (click to change)";
		}
	},

	cycle: function(){
		var current = Theme.get();
		var next = current === "system"
			? (Theme.systemPrefersDark() ? "light" : "dark")
			: "system";

		try { localStorage.setItem(Theme.key, next); } catch (e) {}
		Theme.apply(next);
	},

	init: function(){
		Theme.apply(Theme.get());

		var btn = document.getElementById("theme_btn");
		if(btn){
			btn.addEventListener("click", Theme.cycle);
		}
	}
};

Theme.init();
