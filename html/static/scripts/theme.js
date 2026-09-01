// Two states only: "system" (follow the OS), or a manual override
// that's always the opposite of whatever the OS currently resolves
// to. Clicking toggles between them — no separate "light"/"dark"
// choices to think about.
function themeSvg(inner){
	return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
}

var Theme = {
	key: "chat-theme",
	icons: {
		system: themeSvg('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none"/>'),
		light: themeSvg('<circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
		dark: themeSvg('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>'),
	},

	systemPrefersDark: function(){
		return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
	},

	get: function(){
		try {
			var v = localStorage.getItem(Theme.key);
			return (v === "light" || v === "dark") ? v : "system";
		} catch {
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
			btn.innerHTML = Theme.icons[value];
			btn.title = "Theme: " + value + " (click to change)";
		}
	},

	cycle: function(){
		var current = Theme.get();
		var next = current === "system"
			? (Theme.systemPrefersDark() ? "light" : "dark")
			: "system";

		try { localStorage.setItem(Theme.key, next); } catch { /* localStorage may be unavailable */ }
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
