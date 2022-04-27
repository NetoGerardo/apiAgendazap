const express = require('express')
const morgan = require('morgan')
const cors = require('cors')
const app = express();
app.use(morgan('dev'));
app.use(cors());
app.use(express.json({ limit: '200mb' }));

const http = require('http').Server(app);
const io = require('socket.io')(http);

const chatBotController = require('./chatBotController.js');

app.get('/', (req, res) => {

    envios.list().then(rows => {
        console.log(rows);
    })

    let response = {
        "status": "OK"
    }

    return res.json(response);
})

app.post('/whatsapp/message-received', (req, res) => {

    let session = req.body.apiId;
    let message = req.body.message;

    console.log("\n\n");
    console.log("Sessão - " + session);
    console.log(`Mensagem Recebida: \nTelefone: '${message.from}\nMensagem: ${message.body}`)

    try {
        chatBotController.receiveMessage(message, session, io);

        let response = {
            "status": "OK"
        }

        return res.json(response);
    } catch (error) {

        console.log("ERROOOO!!!");

        let response = {
            "status": "OK"
        }

        return res.json(response);
    }
})

var clients = {};

io.on("connection", function (client) {

    console.log("Conectou no webhook socket");

    client.on("join", function (name) {
        console.log("Joined: " + name);
        clients[client.id] = name;
        client.emit("update", "You have connected to the server.");
        client.broadcast.emit("update", name + " has joined the server.")
    });

    client.on("disconnect", function () {
        console.log("Disconnect");
        io.emit("update", clients[client.id] + " has left the server.");
        delete clients[client.id];
    });
});

http.listen(3334, () => {
    console.log("Webhook at 3334");
})