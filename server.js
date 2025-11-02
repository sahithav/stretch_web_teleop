var fs = require('fs');
require('dotenv').config();

var options = {
    key: fs.readFileSync(`certificates/${process.env.keyfile}`),
    cert: fs.readFileSync(`certificates/${process.env.certfile}`),
};

const socket = require('socket.io');
var express = require('express');
var app = express();
app.all('*', ensureSecure); // at top of routing calls

function ensureSecure(req, res, next) {
    if (!req.secure) {
        // handle port numbers if you need non defaults
        console.log('redirecting insecure request');
        return res.redirect('https://' + req.hostname + req.url);
        // res.redirect(`https://${req.hostname}${process.env.NGROK_URL}`);
    }

    return next();
}

var server = require('http').Server(app);
var secure_server = require('https').Server(options, app);
const io = socket(secure_server, {
    allowEIO3: true,
});
app.enable('trust proxy');
app.set('port', 443);
server.listen(80);
secure_server.listen(443);

var path = require('path');
app.use('/', express.static(path.join(__dirname, 'dist')));

io.on('connect_error', (err) => {
    console.log(`connect_error due to ${err.message}`);
});

const ROOM = 'default';
let robo_sock = undefined;
let oper_sock = undefined;
let protocol = undefined; // TODO(binit): ensure robot/operator protocol match
let status = 'offline'; // ["online", "offline", "occupied"]
function updateRooms() {
    io.emit('update_rooms', {
        robot_id: {
            name: process.env.HELLO_FLEET_ID,
            protocol: protocol,
            status: status,
        },
    });
}

io.on('connection', function (socket) {
    console.log('new socket.io connection');
    // console.log('socket.handshake = ');
    // console.log(socket.handshake);

    socket.on('join_as_robot', (callback) => {
        console.log('Received join_as_robot request');
        if (!robo_sock) {
            socket.join(ROOM);
            robo_sock = socket.id;
            status = 'online';
            console.log('join_as_robot SUCCESS');
            callback({ success: true });
        } else {
            status = 'occupied';
            console.log('join_as_robot FAILURE');
            callback({ success: false });
        }
        updateRooms();
    });

    socket.on('list_rooms', () => {
        updateRooms();
    });

    socket.on('join_as_operator', (callback) => {
        console.log('Received join_as_operator request');
        if (robo_sock) {
            status = 'occupied';
            if (!oper_sock) {
                socket.join(ROOM);
                socket.in(ROOM).emit('joined');
                oper_sock = socket.id;
                console.log('join_as_operator SUCCESS');
                callback({ success: true });
            } else {
                console.log(
                    'join_as_operator FAILURE: occupied by another operator'
                );
                callback({ success: false });
            }
        } else {
            status = 'offline';
            console.log('join_as_operator FAILURE: robot is not available');
            callback({ success: false });
        }
        updateRooms();
    });

    socket.on('signalling', (message) => {
        if (robo_sock && oper_sock && io.sockets.adapter.rooms.get(ROOM)) {
            socket.to(ROOM).emit('signalling', message);
        } else {
            console.log(
                `signaling FAILURE: robo_sock=${robo_sock} oper_sock=${oper_sock} room=${io.sockets.adapter.rooms.get(ROOM)}`
            );
        }
    });

    socket.on('bye', (role) => {
        console.log(`Received bye from ${role}`);
        if (socket.rooms.has(ROOM)) {
            socket.to(ROOM).emit('bye');
            if (socket.id == robo_sock) {
                status = 'offline';
                robo_sock = undefined;
                console.log('Robot disconnected');
            }
            if (socket.id == oper_sock) {
                status = 'online';
                oper_sock = undefined;
                console.log('Operator disconnected');
            }
            socket.leave(ROOM);
        }
        updateRooms();
    });

    socket.on('disconnect', () => {
        if (socket.id == robo_sock) {
            status = 'offline';
            robo_sock = undefined;
            console.log('Robot disconnected');
        }
        if (socket.id == oper_sock) {
            status = 'online';
            oper_sock = undefined;
            console.log('Operator disconnected');
        }
        updateRooms();
    });
});

const { spawn } = require('child_process');
let rosbagProcess = null;

app.use(express.json());

app.post('/start_rosbag', (req, res) => {
    if (rosbagProcess) {
        console.log('[rosbag start] Already recording, rejecting request');
        return res.status(400).json({ error: 'Rosbag recording already in progress.' });
    }

    const bagName = 'latest_' + Date.now();
    const outputDir = '/home/hello-robot/rosbags';
    console.log(`[rosbag start] Starting recording: bagName=${bagName}, outputDir=${outputDir}`);
    
    rosbagProcess = spawn('ros2', [
        'bag', 'record',
        '-a',
        '-s', 'mcap',
        '-o', bagName
    ], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: outputDir
    });

    console.log(`[rosbag start] Spawned process with PID: ${rosbagProcess.pid}`);

    rosbagProcess.stdout.on('data', (data) => {
        console.log(`[rosbag stdout]: ${data}`);
    });
    rosbagProcess.stderr.on('data', (data) => {
        console.error(`[rosbag stderr]: ${data}`);
    });
    rosbagProcess.on('exit', (code, signal) => {
        console.log(`[rosbag exit] ros2 bag record exited with code ${code}, signal ${signal}`);
        rosbagProcess = null; 
    });
    
    console.log(`[rosbag start] Sending success response`);
    res.json({ status: 'started', dir: outputDir, bagName: bagName });
});

app.post('/stop_rosbag', (req, res) => {
    if (!rosbagProcess) {
        console.log('[rosbag stop] No recording in progress, rejecting request');
        return res.status(400).json({ error: 'No rosbag recording in progress.' });
    }
    try {
        console.log(`[rosbag stop] Killing process with PID: ${rosbagProcess.pid}`);
        process.kill(-rosbagProcess.pid, 'SIGINT');
        console.log('[rosbag stop] SIGINT sent successfully');
        
        // Wait a moment to see if process exits cleanly
        setTimeout(() => {
            if (rosbagProcess && !rosbagProcess.killed) {
                console.log('[rosbag stop] Process still running, sending SIGTERM');
                process.kill(-rosbagProcess.pid, 'SIGTERM');
            }
        }, 2000);
        
        res.json({ status: 'stopped' });
    } catch (e) {
        console.error('[rosbag stop] Error stopping rosbag process:', e);
        return res.status(500).json({ error: 'Failed to stop rosbag process.' });
    }
});

app.post('/save_program', (req, res) => {
    try {
        const { filePath, fileName, content } = req.body;
        
        if (!filePath || !fileName || !content) {
            return res.status(400).json({ error: 'Missing required fields: filePath, fileName, or content' });
        }
        const dir = path.dirname(filePath);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Program saved to: ${filePath}`);
        
        res.json({ success: true, message: 'Program saved successfully' });
    } catch (error) {
        console.error('Error saving program:', error);
        res.status(500).json({ error: 'Failed to save program file' });
    }
});
