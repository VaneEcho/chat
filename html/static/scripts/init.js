// optionally set own server where the client connects to
const socket = io(location.protocol + '//' + location.host, { path: location.pathname.replace(/\/$/, '') + '/socket.io/' })

Emic.init();
Chat.init(socket);
