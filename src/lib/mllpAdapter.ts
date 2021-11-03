import { config } from './config'
import * as net from 'net'
import logger from 'winston'

export class MllpAdapter {
    port: Number
    callback: Function

    constructor(callback: Function) {
        this.port = config.get('app:mllpPort')
        this.callback = callback
    }

    /**
     * Start Mllp Adapter Server
     */
    public start() {
        const mllpServer = net.createServer()

        let sockets: net.Socket[] = [];

        mllpServer.on('connection', (sock: net.Socket) => {
            logger.info('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
            sockets.push(sock);
        
            sock.on('data', (data) => {
                logger.info('DATA ' + sock.remoteAddress + ': ' + data);

                // Write the data back to all the connected, the client will receive it as data from the server
                sock.write(sock.remoteAddress + ':' + sock.remotePort + " said ACK!!!" + data + '\n');
            });
        
            // Add a 'close' event handler to this instance of socket
            sock.on('close', (hadError) => {
                let index = sockets.findIndex(function(o) {
                    return o.remoteAddress === sock.remoteAddress && o.remotePort === sock.remotePort;
                })
                if (index !== -1) sockets.splice(index, 1);
                logger.info('CLOSED: ' + sock.remoteAddress + ' ' + sock.remotePort);
            });

            // When the client requests to end the TCP connection with the server, the server
            // ends the connection.
            sock.on('end', function() {
                logger.info('Closing connection with the client');
            });

            // Don't forget to catch error, for your own sake.
            sock.on('error', function(err) {
                logger.error(`Error: ${err}`);
            });
            
        });

        mllpServer.listen(this.port, this.callback(mllpServer))
    }
}