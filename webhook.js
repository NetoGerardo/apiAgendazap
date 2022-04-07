const express = require('express')
const morgan = require('morgan')
const cors = require('cors')
const app = express();
app.use(morgan('dev'));
app.use(cors());
app.use(express.json({ limit: '200mb' }));

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
        chatBotController.receiveMessage(message, session);

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

app.listen(3334, () => {
    console.log("Webhook at 3334");
})