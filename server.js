const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

var port = 5000;
if (process.argv.length > 2) {
	port = parseInt(process.argv[2]);
}

var ltServer = null;

app.set('views', './views');
app.set('view engine', 'pug');

app.use(express.urlencoded({'extended': true}));

app.get('/', (req, res) => {
	res.render('index', ltServer != null ? ltServer.settings : {});
});

app.post('/', (req, res) => {
	let node = req.body.node;
	if(ltServer !== null) {
		ltServer.pass(node);
	}
	res.render('index', ltServer != null ? ltServer.settings : {});
});

console.log('Listening on '+port);
server.listen(port);

io.on('connection', (socket) => {
	console.log('connected');
	ltServer = new LiveTimeServer(socket);
});

function LiveTimeServer(socket) {
	this.socket = socket;
	this.version = {
		'major': 0,
		'minor': 1
	};
	var nodeSettings = [];
	for(var i=0; i<8; i++) {
		nodeSettings.push({'frequency': 0, 'trigger_rssi': 0});
	}
	this.settings = {
		'nodes': nodeSettings,
		'calibration_threshold': 0,
		'calibration_offset': 0,
		'trigger_threshold': 0
	};
	this.nodes = {'current_rssi': nodeSettings.map(n => 0)};

	this.heartbeatTimer = setInterval(this.heartbeat.bind(this), 500);

	// for debugging
	socket.use((packet, next) => {
		console.log(packet);
		next();
	});

	socket.on('get_version', (ack) => {
		ack(this.version);
	});
	socket.on('get_settings', (ack) => {
		ack(this.settings);
	});
	socket.on('get_timestamp', (ack) => {
		ack({'timestamp': this.timestamp()});
	});

	socket.on('set_calibration_threshold', this.setCalibrationThreshold.bind(this));
	socket.on('set_calibration_offset', this.setCalibrationOffset.bind(this));
	socket.on('set_trigger_threshold', this.setTriggerThreshold.bind(this));
	socket.on('set_frequency', this.setFrequency.bind(this));

	socket.on('reset_auto_calibration', (data) => {
	});
	socket.on('disconnect', () => {
		if(this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
		}
		console.log('disconnected');
	});
}

LiveTimeServer.prototype.timestamp = function() {
	return Date.now();
};

LiveTimeServer.prototype.pass = function (node) {
	this.socket.emit('pass_record', {'node': node, 'frequency': this.settings.nodes[node].frequency, 'timestamp': this.timestamp()});
};

LiveTimeServer.prototype.heartbeat = function() {
	this.socket.emit('heartbeat', this.nodes);
};

LiveTimeServer.prototype.updateSettings = function(data) {
	const jsonData = JSON.parse(data);
	this.settings = {...this.settings, ...jsonData};
	console.log('settings updated: '+JSON.stringify(this.settings));
	return jsonData;
};

LiveTimeServer.prototype.setCalibrationThreshold = function(data, ack) {
	const jsonData = this.updateSettings(data);
	this.socket.emit('calibration_threshold_set', jsonData);
};

LiveTimeServer.prototype.setCalibrationOffset = function(data) {
	const jsonData = this.updateSettings(data);
	this.socket.emit('calibration_offset_set', jsonData);
};

LiveTimeServer.prototype.setTriggerThreshold = function(data) {
	const jsonData = this.updateSettings(data);
	this.socket.emit('trigger_threshold_set', jsonData);
};

LiveTimeServer.prototype.setFrequency = function(data) {
	const jsonData = JSON.parse(data);
	this.settings.nodes[jsonData.node].frequency = jsonData.frequency;
	console.log('settings updated: '+JSON.stringify(this.settings));
	this.socket.emit('frequency_set', jsonData);
};
