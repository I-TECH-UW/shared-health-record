var mllp = require('mllp-node');

var server = new mllp.MLLPServer('127.0.0.1', 1234);

// Send outbound messages
server.send('127.0.0.1', 4321, 'outbound-hl7-message', function (err, ackData) {
    // async callback code here
});