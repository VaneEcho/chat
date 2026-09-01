var Theme = {
	key: "chat-theme",
	order: ["system", "light", "dark"],
	icons: { system: "◐", light: "☀", dark: "☾" },

	get: function(){
		try {
			var v = localStorage.getItem(Theme.key);
			return Theme.order.indexOf(v) !== -1 ? v : "system";
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
		var next = Theme.order[(Theme.order.indexOf(current) + 1) % Theme.order.length];
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
