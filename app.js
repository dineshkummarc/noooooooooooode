require.paths.unshift('./node_modules/express/node_modules'); // wtf-fix

var path    = require('path'),
    express = require('express'),
    connect = require('connect'),
    app     = express.createServer(),
    io      = require('socket.io').listen(app);

var config      = require('./config.js'),
    currentShow = require('./lib/show.js'),
    skripts     = require('./lib/skript.js').loadAllSkripts(config.skriptsPath);
    votes       = {};

var args = process.argv.slice(2);

var theaters = {
    irc: require('./lib/irctheater.js')
};

app.configure(function(){
    app.use(express.methodOverride());
    app.use(express.bodyParser());
    app.use(app.router);
});

app.configure('development', function() {
    app.use(express.static(__dirname + '/static'));
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function() {
  var oneYear = 31557600000;
  app.use(express.static(__dirname + '/static', { maxAge: oneYear }));
  app.use(express.errorHandler());
});

app.get('/api/theatres', function(req, res) {
  res.send(JSON.stringify(theaters));
});

app.get('/api/skripts', function(req, res) {
  res.send(JSON.stringify(skripts));
});

app.post('/api/vote/:id', function(req, res) {
    if (!skripts[req.params.id]) {
        res.send(404);
        return;
    }
    var voteId = getVoteId(req);
    if (voteId) {
        res.send(403);
        return;
    } 
    votes[req.params.id] += 1;
    io.sockets.emit('votes', votes);
    res.cookie('vote_id', req.params.id, { });
    io.sockets.emit('current show', currentShow.toJSON());
    res.send(200);
});

function getVoteId(request) {
    var cookieString = (request && request.headers.cookie) || "";
    var parsedCookies = connect.utils.parseCookie(cookieString);
    return parsedCookies['vote_id'];
}

app.get('/', function(req, res) {
  res.sendfile(path.join(__dirname, 'static', 'index.html'));
});

app.listen(config.port, config.host);

io.sockets.on('connection', function(socket) {
    socket.emit('current show', currentShow.toJSON());
    socket.emit('skripts', skripts);
    var voteId = getVoteId(socket.request);
    if (voteId)
        socket.emit('my vote', voteId);
});

if (args.length > 0){
    console.log("Running with", args[0]);
    var theater = theaters.irc.getTheater();
    var hamlet = skripts[args[0]];
    var scene = parseInt(args[1] || 0, 10);
    var runSkript = hamlet.skript;
    if (scene !== undefined){
        console.log("Cut to", scene);
        runSkript = hamlet.skript.slice(scene);
    }
    theater.setup(hamlet.setup, function(){
        theater.run(runSkript);
    });
}
