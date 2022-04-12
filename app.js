const express = require('express')
const morgan = require('morgan')
const cors = require('cors')
const bodyParser = require('body-parser')
const fs = require('fs');

const dateFormat = require('dateformat');

const app = express();

app.use(morgan('dev'));
app.use(cors());
app.use(express.json({ limit: '200mb' }));

const wppconnect = require('@wppconnect-team/wppconnect');

const mysql = require("mysql2");

var cloudinary = require('cloudinary');
const { start } = require('repl');

var wppClient = null
var statusSessionGlobal = null

const http = require('http').Server(app);
const io = require('socket.io')(http);
const qrcode = require('qrcode');

let clientsArray = [];

var chromiumArgs = ['--disable-web-security', '--no-sandbox', '--disable-web-security', '--aggressive-cache-discard', '--disable-cache', '--disable-application-cache', '--disable-offline-load-stale-cache', '--disk-cache-size=0', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--disable-translate', '--hide-scrollbars', '--metrics-recording-only', '--mute-audio', '--no-first-run', '--safebrowsing-disable-auto-update', '--ignore-certificate-errors', '--ignore-ssl-errors', '--ignore-certificate-errors-spki-list'];

app.get('/', (req, res) => {
    res.sendFile('index.html', {
        root: __dirname
    });
});

app.get('/load/:sessionName', (req, res) => {

    console.log("Criando sessão " + req.params.sessionName);

    let tentativas = 0;

    if (clientsArray[req.params.sessionName] && clientsArray[req.params.sessionName].browserAberto) {

        console.log("Broser aberto, retornando...");

        let response = {
            "status": "SCANNING"
        }

        return res.json(response);
    } else {

        resetQrCode(req.params.sessionName);

        clientsArray[req.params.sessionName] = { status: "SCANNING", browserAberto: true };

        wppconnect
            .create({
                session: req.params.sessionName,
                catchQR: (base64Qr, asciiQR) => {
                    console.log(asciiQR); // Optional to log the QR in the terminal

                    console.log("Novo qr");
                    console.log('qr-' + req.params.sessionName);

                    io.emit('qr-' + req.params.sessionName, base64Qr);
                    io.emit('message', 'QR Code received, scan please!');
                }, statusFind: (statusSession, session) => {

                    if (statusSession == "browserClose" && clientsArray[session]) {
                        clientsArray[session].browserAberto = false;
                    }

                    if (statusSession == "qrReadError") {
                        io.emit('qr', "");
                    }

                    if (statusSession == "qrReadSuccess" || statusSession == "inChat") {
                        io.emit('ready', "");
                    }

                    console.log('Status Session: ', statusSession); //return isLogged || notLogged || browserClose || qrReadSuccess || qrReadFail || autocloseCalled || desconnectedMobile || deleteToken
                    console.log('Session name: ', session);

                    if (clientsArray[session]) {
                        clientsArray[session].status = statusSession;
                    }


                },
                deviceName: 'WhatsNews',
                //sessionToken: myToken,
                puppeteerOptions: {
                    userDataDir: './tokens/' + req.params.sessionName, // or your custom directory
                },
                headless: true,
                devtools: false,
                useChrome: true,
                debug: false,
                logQR: true,
                browserArgs: chromiumArgs,
                whatsappVersion: "2.2204.13",
                disableSpins: true,
                autoClose: 100000,
            })
            .then((client) => start(client, req.params.sessionName))
            .catch((error) => {

                console.log(error);

            });


    }

    async function start(client, apiId) {

        //wppClient = client;

        client.status = "CONNECTED";

        clientsArray[req.params.sessionName] = client;

        getInfo(clientsArray[req.params.sessionName], apiId);

        console.log("QR Code Escaneado");

        receiveMessage(client)
    }
})

async function receiveMessage(client, apiId) {

    await client.onMessage(async message => {

        let data = {
            message: message,
            apiId: apiId
        }

        //PASS MESSAGE TO THE WEBHOOK
        axios.post(webhook_endpoint + `/whatsapp/message-received`, data)
            .then((response) => {
                console.log("Mensagem encaminhada para o webhook");
            })
    });
}

app.get('/sessionStatus/:sessionName', (req, res) => {
    if (clientsArray[req.params.sessionName]) {
        let response = {
            "status": clientsArray[req.params.sessionName].status
        }

        return res.json(response);
    } else {
        let response = {
            "status": "not found"
        }

        return res.json(response);
    }
})

function resetQrCode(sessionName) {
    base64Qr = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQgAAAEIAgMAAADemIJsAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAACVBMVEUSLjH///////8TphEWAAAAAnRSTlOKirqS18cAAAABYktHRAH/Ai3eAAAAB3RJTUUH5QgEFCYnSLTB5AAAAAFvck5UAc+id5oAAAOUSURBVHja7ZvLcSMxDEShA0NgPhMCD4P8U1kPgW6AlvZk6AaWy2Xx81SlFr4ci3DMJbp/RF6qt0x9xjX0ZyIWLltb8mk0wnfaEfH9e+fF5b3/mf3Z5ZQfpI3ViHLELfZ77ul9Dto9f4wNftiQ2hEObsQ3EYL9W1Ho+ux85Hu5jhdMshFfR5ioMKhz4LBtb8QXEcnx+bQZmP9WhCJGJ/N3//GdjfgzgoPJAUKR/dDxjXtLf8MkP4xGFCA0D7ebYSJT1AHtpqaUgYcakQ8JYjbc0DNP/8QPHSctuA9NXqsRpQgTinLtzVtLJsBGhY3YxsjAGlGOuM+sihGDunq4yF7LLI+hqBGFCPdeVmOA8krBfbjvO4L94S0bUYrwki8MivLRBL1EWdy7tzt4NKIYEWnAZfJJMjOx8/gjRL0YxxpRjUj1yELQcUeI7NcyuHCPU9FFie9FI+ILLm/fe1BT8/CxHHdZRwNLGlGMcKFQTe9XuU0IX4aSJIF9eyNKEXH4ylmV0P4WEquFVtVUv/IQT5YbUY0QiSOIGDmORAskRXYYXyPKEeoVoimIeuTtGmM32HG/kdVuRC3ibJqbQSkLwd8jlZKCHlgjahFReTAFSwi20lXxXi98BxZRjShF+NydrpBsv3s5+rdxttIb8QnhUSE+4oGb00sORVDeMRdYrEcaUYtIbojRGhViWsANd3JnblWNKEUgTmu+p1MXNYcSv9NzymJO3IhiRKoQF3WlmUlcQom93ZFu7dGIasSvDvmScHHCyoPNwpnO+zs2ohTh0zAl9hRzB2vRzGBzRkFJ04hKRCoHIV8oaiJDbRjfhKKuayMyQvHZa+RP0enwiKHpmQMzDW+7D21ELSKuSS+sxNMFMVZugdzoW6mbWSMKEZAzt8fHaXnULlWTmh79b0QpIj1KsNyA4lZJUm/kWZ4wyRPciEqEz5npGNOvMSYSYDsHUXlZuGxvI6oRto1eTvKYuHzdC/R6kmaji9KIGgQuN1J4QReFwxYWS5Y7LSxpRC1CY6z8gtdNUQjy8RK4QzPBRiREMghNXutCvyNaVSLxMMJcoiu7s0bUIWYSEcH9Pv+LxW3k895GlCPeLiyO/7KDzhKvZ/JaaaIR5YitklKuiTAOv8gy/o5nQ8zMGvE1xOBzOamXK5LrEXZRNO5HGlGKoDNbMCjK56Y0KCpSsyR1I6oRHFZjYBG9lei4D/pCPp37lq414s+If0Cv2X4xaNnKAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDIxLTA4LTA0VDIwOjM4OjM5KzAwOjAwtmjzWAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyMS0wOC0wNFQyMDozODozOSswMDowMMc1S+QAAAAASUVORK5CYII="

    var matches = base64Qr.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),
        response = {};

    if (matches.length !== 3) {
        return new Error('Invalid input string');
    }
    response.type = matches[1];
    response.data = new Buffer.from(matches[2], 'base64');

    var imageBuffer = response;
    require('fs').writeFile(
        'qr-codes/' + sessionName + '.png',
        imageBuffer['data'],
        'binary',
        function (err) {
            if (err != null) {
                console.log(err);
            }
        }
    );
}

app.post('/send/text', (req, res) => {

    if (clientsArray[req.body.apiId] != null) {
        console.log("\n\n");
        console.log("Enviando mensagem para " + req.body.number);

        start(clientsArray[req.body.apiId], req.body.number, req.body.text);
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);

    }

    async function start(client, number, text) {

        let response = {
            "status": "OK"
        }

        console.log("Enviando agora");

        await client
            .sendText(number, text)
            .then((result) => {

                console.log(result);
                console.log("\n\n");

                let phone;

                if (result.chatId) {
                    phone = result.chatId.split("@")[0]
                }

                let success = {
                    message: "sucess",
                    result: result,
                    phone: phone
                }

                response = {
                    "status": "OK",
                    "success": success
                }

                return res.json(response);
            })
            .catch((erro) => {
                console.error('Error when sending: ', erro);

                let error = {
                    error: erro
                }

                return res.json(error);
            });

    }
})

app.get('/disconnect/:sessionName', (req, res) => {
    if (clientsArray[req.params.sessionName] != null) {
        deleteToken(req.params.sessionName);

        let response = {
            "status": "OK",
            "message": "Sessão deletada"
        }

        return res.json(response);
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);

    }
})

async function deleteToken(sessionName) {

    console.log("Deletando token da sessao " + sessionName);

    try {
        fs.rmSync('tokens/' + sessionName, { recursive: true, force: true });
        fs.unlinkSync('tokens/' + sessionName + '.data.json')

        clientsArray[sessionName] = [];
    } catch (e) {
        return true;
    }

    return true;
}

var clients = {};

function makeid(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }
    return result;
}

io.on("connection", function (client) {

    console.log("Connected");

    /*
    //MENSAGEM DE TESTE
    client.emit('message', 'Teste!');

    
    //QR INICIAL
    let qr = "1@0PoVgbB6ui2a6Ev7VwjbcJHGrjLjrnLuwAo8UlQr/Q6anr2be+2mJdGh+y/zDcLiQ1bdVRLPOfB8hg==,kSCYiO9uJDZj27DKAiZOVmZZfqOTAM96Nbr/nkTfsRA=,QlAFBRTVd/FwLvnfKznCsA==";

    qrcode.toDataURL(qr, (err, url) => {
        client.emit('qr', url);
        client.emit('message', 'QR Code received, scan please!');
    });
    */

    //client.emit('ready', "");

    client.on("join", function (name) {
        console.log("Joined: " + name);
        clients[client.id] = name;
        client.emit("update", "You have connected to the server.");
        client.broadcast.emit("update", name + " has joined the server.")
    });

    client.on("send", function (msg) {
        console.log("Message: " + msg);
        client.broadcast.emit("chat", clients[client.id], msg);
    });

    client.on("disconnect", function () {
        console.log("Disconnect");
        io.emit("update", clients[client.id] + " has left the server.");
        delete clients[client.id];
    });
});


http.listen(3333, function () {
    console.log('listening on port 3000');
});