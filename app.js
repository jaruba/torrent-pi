var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    swig = require('swig'),
    path = require('path'),
    address = require('network-address'),
    io = require('socket.io').listen(server),
    readTorrent = require('read-torrent'),
    peerflix = require('peerflix'),
    vlc = require('vlc-api')(),
    omx = require('omxctrl'),
    spawn = require('child_process').spawn,
	url,
	firstTime,
	firstTimer,
	allPieces = 0,
	nextTorrent = "0";
	
setInterval(function() {
	if (engine && engine.torrent) {
		updDownload = Math.floor((allPieces / (((engine.torrent.length - engine.torrent.lastPieceLength) / engine.torrent.pieceLength) +1)) *100);
		io.sockets.emit('DownloadUpdate', updDownload);
	}
},5000);

function play() {
	if (firstTimer) {
		clearTimeout(firstTimer);
		firstTimer = null;
	}
	if (status.player.running) {
		if (status.player.which == "omx") omx.pause();
		else vlc.status.resume();

		status.video.playing = true;
		io.sockets.emit('StatusUpdate', status);
	} else {
		status.video.stream_address = 'http://' + address() + ':' + engine.server.address().port;
		
		if (status.player.which == "omx") {
			omx.play(status.video.stream_address,['-o hdmi','-b','-p','-r']);
			
			omx.on('ended', function() {
				status.player.running = false;
				status.video.playing = false;
				io.sockets.emit('StatusUpdate', status);
			});
		} else {
			vlc_process = spawn('vlc', [
				status.video.stream_address, '--fullscreen',
				'--video-on-top', '--no-video-title-show'
			]);

			vlc_process.on('exit', function(code) {
				status.player.running = false;
				status.video.playing = false;
				io.sockets.emit('StatusUpdate', status);
			});
		}

		status.player.running = true;
		status.video.playing = true;
		io.sockets.emit('StatusUpdate', status);
	}
}

function processTorrent(err, torrent) {
	if (err) throw err;
	
	allPieces = 0;

	engine = peerflix(torrent, {
		connections: 100,
		path: '/tmp/tpi'
	});

	engine.server.listen(8888);

	engine.on('download', onpiece);

	status.torrent.address = torrent_address;
	status.torrent.streaming = true;
	io.sockets.emit('StatusUpdate', status);

	console.log("Torrent streaming at http://" + address() + ':' + engine.server.address().port);
}

function onpiece(piece) {
	allPieces++;
}

app.engine('html', swig.renderFile);

app.set('port', process.env.TEST_PORT || 3000);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'views'));

app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res) {
    res.render('index', {
        socket_address: 'http://' + address() + ':' + app.get('port')
    });
});

app.get('/remote', function(req, res) {
	
	if (firstTime) {
		var sendTime = '15';
		firstTime = false;
		firstTimer = setTimeout(function() { play(); },15000);
	} else var sendTime = '0';
	
	if (nextTorrent.magnet && nextTorrent.id) var nextEpisode = '{"magnet":"'+nextTorrent["magnet"]+'","type":"show","id":'+nextTorrent["id"]+'}';
	else var nextEpisode = '0';
	
    res.render('remote', {
        socket_address: 'http://' + address() + ':' + app.get('port'),
		timer: sendTime,
		nextEp: nextEpisode
    });
});

app.get('/quality', function(req, res) {
    res.render('quality', {
        socket_address: 'http://' + address() + ':' + app.get('port'),
		id: req.query.id,
		type: req.query.type
    });
});

app.get('/show', function(req, res) {
    res.render('show', {
        socket_address: 'http://' + address() + ':' + app.get('port'),
		id: req.query.id
    });
});

server.listen(app.get('port'), function() {
	url = "http://" + address() + ':' + app.get('port');
    console.log("Express server started at " + url);
});

var engine;
var vlc_process;

var status = {
    torrent: {
        address: null,
        streaming: false
    },
    player: {
        which: "omx",
        running: false
    },
    video: {
        stream_address: null,
        playing: false
    }
};

io.set('log level', 1);

io.sockets.on('connection', function(socket) {
    socket.emit('StatusUpdate', status);

    socket.on('RequestStatusUpdate', function() {
        socket.emit('StatusUpdate', status);
    });

    socket.on('remote-LoadTorrent', function(jsonObj) {
		torrent_address = jsonObj.magnet;
        console.log("Loading torrent file " + torrent_address);

		firstTime = true;
		
		nextTorrent = "0";
		
		if (jsonObj.type == "show") {
			var request = require('request');
			request(window.atob("aHR0cDovL2dhbmdzdGFmaWxtcy5uZXQvcGlfbmV4dF9lcC5waHA/cXVhbGl0eT0=")+jsonObj.quality+window.atob("JmlkPQ==")+jsonObj.id, function (error, response, body) {
				if (!error && response.statusCode == 200 && body != "none") {
					jsonParsed = JSON.parse(body);
					jsonNew = jsonObj;
					jsonNew.magnet = jsonParsed.magnet;
					jsonNew.id = jsonParsed.id;
					nextTorrent = jsonNew;
					setTimeout(function() {
						io.sockets.emit('NextTorrent', jsonNew);
					},1000);
				}
			});
		}
		
		if (status.player.running) {
            if (status.player.which == "omx") {
				omx.stop();
			} else {
                vlc.status.stop();
                vlc_process.kill();
            }

            status.player.running = false;
            status.video.playing = false;
            io.sockets.emit('StatusUpdate', status);
        }

		if (engine) {
			engine.removeListener('download', onpiece);
			engine.server.close(function() {
				engine.remove(function() {
					engine.destroy(function() {
						status.torrent.address = null;
						status.torrent.streaming = false;
						io.sockets.emit('StatusUpdate', status);
						engine = null;
						readTorrent(torrent_address, processTorrent);
					});
				});
			});
		} else {
			readTorrent(torrent_address, processTorrent);
		}
    });

    socket.on('next-ep', function() {
        console.log("Play button pressed");
		play();
    });

    socket.on('remote-Play', function() {
        console.log("Play button pressed");
		play();
    });

    socket.on('remote-Pause', function() {
        console.log("Pause button pressed");

        if (status.player.running) {
            if (status.player.which == "omx") omx.pause();
            else vlc.status.pause();

            status.video.playing = false;
            io.sockets.emit('StatusUpdate', status);
        }
    });

    socket.on('remote-Stop', function() {
        console.log("Stop button pressed");

        if (status.player.running) {
            if (status.player.which == "omx") {
				omx.stop();
			} else {
                vlc.status.stop();
                vlc_process.kill();
            }

            status.player.running = false;
            status.video.playing = false;
            io.sockets.emit('StatusUpdate', status);
        }
    });

    socket.on('remote-Forward', function() {
        console.log("Forward button pressed");

        if (status.player.running) {
            if (status.player.which == "omx") omx.seekForward();
            else vlc.status.seek('+2', null);
        }
    });

    socket.on('remote-Backward', function() {
        console.log("Backward button pressed");

        if (status.player.running) {
            if (status.player.which == "omx") omx.stop();
            else vlc.status.seek('-2', null);
        }
    });
	
    socket.on('remote-Trash', function() {
        console.log("Deleting Torrent");

        if (status.player.running) {
            if (status.player.which == "omx") {
				omx.stop();
			} else {
                vlc.status.stop();
                vlc_process.kill();
            }

            status.player.running = false;
            status.video.playing = false;
            io.sockets.emit('StatusUpdate', status);
        }

		engine.removeListener('download', onpiece);
		engine.server.close(function() {
			engine.remove(function() {
				engine.destroy(function() {
					status.torrent.address = null;
		            status.torrent.streaming = false;
					io.sockets.emit('StatusUpdate', status);
					engine = null;
				});
			});
		});
    });
    socket.on('volume-up', function() {
		if (status.player.running) {
            if (status.player.which == "omx") {
				omx.increaseVolume();
			}
		}
	});
    socket.on('volume-down', function() {
		if (status.player.running) {
            if (status.player.which == "omx") {
				omx.decreaseVolume();
			}
		}
	});
    socket.on('reboot', function() {
        console.log("Rebooting");

        if (status.player.running) {
            if (status.player.which == "omx") {
				omx.stop();
			} else {
                vlc.status.stop();
                vlc_process.kill();
            }

            status.player.running = false;
            status.video.playing = false;
            io.sockets.emit('StatusUpdate', status);
        }

		engine.removeListener('download', onpiece);
		engine.server.close(function() {
			engine.remove(function() {
				engine.destroy(function() {
					status.torrent.address = null;
		            status.torrent.streaming = false;
					io.sockets.emit('StatusUpdate', status);
					engine = null;
					exec = require('child_process').exec;
					exec('sudo reboot');
				});
			});
		});
    });
});