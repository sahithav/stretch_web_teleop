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


app.use(express.json());

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

app.listen(process.env.port);

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
let humanApiRosbagProcess = null;

app.post('/start_rosbag', (req, res) => {
    if (rosbagProcess) {
        return res.status(400).json({ error: 'Rosbag recording already in progress.' });
    }

    const { userId, rosbagNumber } = req.body;
    if (!userId || !rosbagNumber) {
        return res.status(400).json({ error: 'Missing userId or rosbagNumber in request body.' });
    }

    const outputDir = `/media/hello-robot/HCRLAB/rosbags/${userId}_${rosbagNumber}`;
    rosbagProcess = spawn('ros2', [
        'bag', 'record',
        '-a',
        '-s', 'mcap',
        '-o', outputDir
    ], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    rosbagProcess.stdout.on('data', (data) => {
        console.log(`[rosbag stdout]: ${data}`);
    });
    rosbagProcess.stderr.on('data', (data) => {
        console.error(`[rosbag stderr]: ${data}`);
    });
    rosbagProcess.on('exit', (code, signal) => {
        console.log(`ros2 bag record exited with code ${code}, signal ${signal}`);
        rosbagProcess = null; 
    });
    res.json({ status: 'started', dir: outputDir });
});

app.post('/stop_rosbag', (req, res) => {
    if (!rosbagProcess) {
        return res.status(400).json({ error: 'No rosbag recording in progress.' });
    }
    
    const { userId, rosbagNumber } = req.body;
    if (!userId || !rosbagNumber) {
        return res.status(400).json({ error: 'Missing userId or rosbagNumber in request body.' });
    }
    
    try {
        process.kill(-rosbagProcess.pid, 'SIGINT');
        res.json({ status: 'stopped', rosbagName: `${userId}_${rosbagNumber}` });
    } catch (e) {
        console.error('Error stopping rosbag process:', e);
        return res.status(500).json({ error: 'Failed to stop rosbag process.' });
    }
});

app.post('/start_humanapi_rosbag', (req, res) => {
    if (humanApiRosbagProcess) {
        return res.status(400).json({ error: 'Human API rosbag recording already in progress.' });
    }

    const { userId, rosbagNumber } = req.body;
    if (!userId || !rosbagNumber) {
        return res.status(400).json({ error: 'Missing userId or rosbagNumber in request body.' });
    }

    const outputDir = `/media/hello-robot/HCRLAB/rosbags-humanapi/${userId}_${rosbagNumber}`;
    humanApiRosbagProcess = spawn('ros2', [
        'bag', 'record',
        '-a',
        '-s', 'mcap',
        '-o', outputDir
    ], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    humanApiRosbagProcess.stdout.on('data', (data) => {
        console.log(`[humanapi rosbag stdout]: ${data}`);
    });
    humanApiRosbagProcess.stderr.on('data', (data) => {
        console.error(`[humanapi rosbag stderr]: ${data}`);
    });
    humanApiRosbagProcess.on('exit', (code, signal) => {
        console.log(`humanapi ros2 bag record exited with code ${code}, signal ${signal}`);
        humanApiRosbagProcess = null; 
    });
    res.json({ status: 'started', dir: outputDir });
});

app.post('/stop_humanapi_rosbag', (req, res) => {
    if (!humanApiRosbagProcess) {
        return res.status(400).json({ error: 'No human API rosbag recording in progress.' });
    }
    
    const { userId, rosbagNumber } = req.body;
    if (!userId || !rosbagNumber) {
        return res.status(400).json({ error: 'Missing userId or rosbagNumber in request body.' });
    }
    
    try {
        process.kill(-humanApiRosbagProcess.pid, 'SIGINT');
        res.json({ status: 'stopped', rosbagName: `${userId}_${rosbagNumber}` });
    } catch (e) {
        console.error('Error stopping human API rosbag process:', e);
        return res.status(500).json({ error: 'Failed to stop human API rosbag process.' });
    }
});

app.post('/save_study_data', (req, res) => {
    
    try {
        const { userId, studyData } = req.body;
        
        if (!userId || !studyData) {
            console.error('Missing required fields:', { userId, hasStudyData: !!studyData });
            return res.status(400).json({ error: 'Missing required fields: userId or studyData' });
        }
        
        const filePath = `/media/hello-robot/HCRLAB/data/user_${userId}_study_data.json`;
        const content = JSON.stringify(studyData, null, 2);
        
        
        fs.writeFileSync(filePath, content, 'utf8');
        
        
        res.json({ success: true, message: 'Study data saved successfully' });
    } catch (error) {
        console.error('Error saving study data:', error);
        res.status(500).json({ error: 'Failed to save study data file' });
    }
});
