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

const http = require('http').Server(app);
const io = require('socket.io')(http);
const qrcode = require('qrcode');

const wppconnect = require('@wppconnect-team/wppconnect');

const mysql = require("mysql2");

//PRODUCTION
//let host = "localhost";

//LOCAL
let host = "161.97.66.117";

var connection = mysql.createConnection({
    host: host,
    user: "adminbd",
    password: "OceancWgKm8HE",
    database: "envios",
    charset: 'utf8mb4',
    port: 3306
});

var cloudinary = require('cloudinary');
const { start } = require('repl');

var wppClient = null
var statusSessionGlobal = null


let clientsArray = [];

var chromiumArgs = ['--disable-web-security', '--no-sandbox', '--disable-web-security', '--aggressive-cache-discard', '--disable-cache', '--disable-application-cache', '--disable-offline-load-stale-cache', '--disk-cache-size=0', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--disable-translate', '--hide-scrollbars', '--metrics-recording-only', '--mute-audio', '--no-first-run', '--safebrowsing-disable-auto-update', '--ignore-certificate-errors', '--ignore-ssl-errors', '--ignore-certificate-errors-spki-list'];

app.get('/', (req, res) => {

    let response = {
        "status": "OK"
    }

    return res.json(response);
})

app.get('/getQrCode/:sessionName/:attempt', (req, res) => {

    //RETORNA O QR CODE REFERENTE À SESSÃO
    res.sendFile('qr-codes/' + req.params.sessionName + '.png', { root: __dirname }, function (err) {
        if (err) {
            //CASO NÃO ENCONTRE, RETORNA A LOGO
            res.sendFile('qr-codes/logo.png', { root: __dirname });
        }
    });

})

app.get('/old_sessionStatus/:sessionName', (req, res) => {
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

//TESTE
//TESTE
//TESTE
app.get('/test/getChatMessages/:apiId', (req, res) => {
    start();

    async function start() {

        let client = clientsArray[req.params.apiId];

        if (client) {

            await client.getAllChatsWithMessages(true)
                .then((result) => {

                    console.log(result);

                    response = {
                        "status": "OK",
                        "chats": result
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
        } else {

            let response = {
                "status": "Fail"
            }

            return res.json(response);
        }

    }
})



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

        loadTokenFromDB(req.params.sessionName, (myToken) => {

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

                        if (clientsArray[session]) {
                            clientsArray[session].status = statusSession;
                        }

                        if (statusSession == "browserClose" && clientsArray[session]) {
                            clientsArray[session].browserAberto = false;
                        }

                        if (statusSession == "qrReadError") {
                            io.emit('qr', "");
                        }

                        if (statusSession == "qrReadSuccess" || statusSession == "inChat") {
                            io.emit('ready', "");
                        }

                    },
                    deviceName: 'WhatsNews',
                    puppeteerOptions: {
                        userDataDir: './tokens/' + req.params.sessionName,
                    },
                    headless: true,
                    devtools: false,
                    useChrome: true,
                    debug: false,
                    logQR: true,
                    browserArgs: chromiumArgs,
                    whatsappVersion: "2.2204.13",
                    refreshQR: 15000,
                    disableSpins: true,
                    autoClose: 100000,
                })
                .then((client) => start(client, req.params.sessionName))
                .catch((error) => {

                    console.log(error);

                    //resetQrCode(req.params.sessionName);

                    //clientsArray[req.params.sessionName] = { status: "ERROR" };

                });

            /*      
            let response = {
                "status": clientsArray[req.params.sessionName].status
            }

            return res.json(response);
            */

        })

    }

    async function start(client, apiId) {

        //wppClient = client;

        client.status = "CONNECTED";

        clientsArray[req.params.sessionName] = client;

        getInfo(clientsArray[req.params.sessionName], apiId);

        console.log("QR Code Escaneado");

        receiveMessage(client)
    }

    async function receiveMessage(client) {

        /*
        await client.onMessage(async status => {
            console.log("\n\n********* STATUS ALTERADO************");
            console.log(status);
            console.log("\n\n");
        })
        */

        await client.onMessage(async message => {
            //console.log(message);
            //console.log(`Mensagem Recebida: \nTelefone: '${message.from}\nMensagem: ${message.body}`)
            //console.log("\nSessão - " + client.session + "\n\n\n");

            let phone = message.from.split("@");

            passMessageToDB(message.body, phone[0], client.session, (hasMessage) => {
                console.log("Enviada para o banco");
            });

            //Mensagem automática para belém
            if (client.session == 99 && message.body == "#") {

                let numero = phone[0];
                let id_funil = 1;

                //ENCERRANDO FUNIS ANTERIORES NA MESMA SESSÃO
                let query = "UPDATE cliente_funil SET concluido = 1 WHERE id_sessao = " + client.session + " AND numero = '" + numero + "'";

                connection.query(query, function (error, results, fields) {
                })

                //CADASTRANDO CLIENTE NO FUNIL
                query = "SELECT * FROM mensagens_funil WHERE id_funil = " + id_funil;

                connection.query(query, function (error, results, fields) {
                    console.log("\n\n\n");
                    console.log("Cadastrando " + numero + " no funil " + id_funil);

                    if (error) {
                        console.log(error);
                    }

                    if (results.length > 0) {

                        let primeira_mensagem = results[0];

                        //CADASTRANDO CLIENTE NO FUNIL
                        query = "INSERT INTO cliente_funil(numero, tag, id_funil, id_sessao) VALUES ('" + numero + "', '" + primeira_mensagem.tag + "', " + id_funil + ", " + client.session + ")";

                        console.log(query);

                        connection.query(query, function (error, results, fields) {

                            enviarMensagemFunil(client, numero, results.insertId, primeira_mensagem.tag);

                        });
                    } else {
                        console.log("Funil sem mensagens");
                    }

                });

            } else {
                await analisarClienteFunil(client, phone[0], client.session, message.body);
            }
        });
    }

})

app.get('/loadToken/:sessionName', (req, res) => {
    start();

    async function start() {
        loadTokenFromDB(req.params.sessionName, (result) => {
            if (result) {
                let response = {
                    "status": "OK",
                    "token": result
                }

                return res.json(response);
            } else {
                let response = {
                    "status": "Fail",
                    "token": null
                }

                return res.json(response);
            }
        });
    }
})


function loadTokenFromDB(apiId, callback) {

    checkDbConnection();

    var query = "SELECT * FROM containers WHERE chave_api = " + apiId;

    connection.query(query, function (error, results, fields) {

        if (error) {
            console.log("ERRO");
            callback(false);
        }

        if (results[0]) {
            let token = {
                WABrowserId: results[0].wabrowserid,
                WASecretBundle: results[0].wasecretbundle,
                WAToken1: results[0].watoken1,
                WAToken2: results[0].watoken2
            };

            callback(token);
        } else {
            callback(false);
        }
    })
}

app.post('/database/register_session', (req, res) => {

    let url = req.body.url;

    console.log("Url - " + url);

    if (url) {
        checkDbConnection();

        var query = "SELECT * FROM containers WHERE url = '" + url + "' ;";

        connection.query(query, function (error, results, fields) {
            if (error) {
                let response = {
                    "status": "Error",
                    "error": error,
                    "message": "Erro ao inserir no banco"
                }
                return res.json(response);
            } else {
                if (results.length <= 0) {
                    query = "SELECT MAX(chave_api) AS chave_api FROM containers;";

                    connection.query(query, function (error, results, fields) {

                        let chave_api = results[0].chave_api;

                        chave_api = chave_api + 1;

                        query = "INSERT INTO containers (url, chave_api) VALUES ('" + url + "', " + chave_api + ")";

                        connection.query(query, function (error, results, fields) {

                            let response = {
                                "status": "OK"
                            }
                            return res.json(response);
                        })

                    })

                } else {
                    let response = {
                        "status": "Error",
                        "message": "Url já cadastrada!"
                    }
                    return res.json(response);
                }
            }
        })
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

app.post('/update/container', (req, res) => {

    let query = "UPDATE containers SET nome = '" + req.body.nome + "' , url = '" + req.body.url + "' WHERE id = " + req.body.id;

    if (req.body.mensagem_izap) {
        query = "UPDATE containers SET mensagem_izap = '" + req.body.mensagem_izap + "' WHERE id = " + req.body.id;
    }

    console.log(query);

    connection.query(query, function (error, results, fields) {

        let response = {
            "status": "OK"
        }
        return res.json(response);
    })

})

app.post('/database/update/send', (req, res) => {

    let query = "UPDATE envios SET mensagem = '" + req.body.message + "' WHERE id = " + req.body.id;

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {

            let response = {
                "status": "ERRO",
                "message": error
            }
            return res.json(response);
        } else {

            let response = {
                "status": "OK",
                "message": "Mensagem atualizada!"
            }
            return res.json(response);
        }

    })

})

app.post('/create/funil', (req, res) => {

    let query = "INSERT INTO funil (nome, id_container, qtd_passos)"
        + "VALUES ('" + req.body.nome + "', " + req.body.id_container + ",1 );";

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (!error) {
            let response = {
                "status": "OK",
                "id_funil": results.insertId
            }
            return res.json(response);
        } else {
            let response = {
                "status": "ERROR",
                "id_funil": error
            }
            return res.json(response);
        }
    })

})

app.post('/create/message_funil', (req, res) => {

    let query = "INSERT INTO mensagens_funil (id_funil, tipo_media, resposta_esperada, resposta_padrao, tag)"
        + "VALUES ('" + req.body.id_funil + "',"
        + "'texto',"
        + "'" + req.body.resposta_esperada + "' ,"
        + "'" + req.body.resposta_padrao + "' ,"
        + "'" + req.body.tag + "' );"

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (!error) {
            let response = {
                "status": "OK",
                "id_funil": results.insertId
            }
            return res.json(response);
        } else {
            let response = {
                "status": "ERROR",
                "id_funil": error
            }
            return res.json(response);
        }
    })

})

app.post('/update/funil', (req, res) => {

    let query = "UPDATE funil SET nome = '" + req.body.nome + "' WHERE id = " + req.body.id;

    connection.query(query, function (error, results, fields) {

        let response = {
            "status": "OK"
        }
        return res.json(response);
    })

})

app.post('/update/mensagens_funil', (req, res) => {

    let query = "UPDATE mensagens_funil SET resposta_padrao = '" + req.body.resposta_padrao + "', resposta_esperada = '" + req.body.respostas + "' WHERE id = " + req.body.id;

    console.log(query);

    connection.query(query, function (error, results, fields) {

        let response = {
            "status": "OK"
        }
        return res.json(response);
    })

})

app.post('/reset-qr-code/:sessionName', (req, res) => {

    var matches = req.body.base64Qr.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),
        response = {};

    if (matches.length !== 3) {
        return new Error('Invalid input string');
    }
    response.type = matches[1];
    response.data = new Buffer.from(matches[2], 'base64');

    var imageBuffer = response;
    require('fs').writeFile(
        'qr-codes/' + req.params.sessionName + '.png',
        imageBuffer['data'],
        'binary',
        function (err) {
            if (err != null) {
                console.log(err);
            }
        }
    );

    response = {
        "status": "OK"
    }

    return res.json(response);

})

app.get('/force/:sessionName', (req, res) => {

    console.log("Forçando carregamento do qr Code na Sessão - " + req.params.sessionName);

    clientsArray[req.params.sessionName] = null;

    start();

    async function start() {

        let response = "";

        if (await deleteToken(req.params.sessionName)) {
            response = {
                "status": "OK"
            }
        } else {
            response = {
                "status": "Error",
                "message": "Session name not found"
            }
        }

        return res.json(response);
    }

})

async function deleteToken(sessionName) {

    console.log("Deletando token da sessao " + sessionName);

    try {
        fs.rmSync('tokens/' + sessionName, { recursive: true, force: true });
        fs.unlinkSync('tokens/' + sessionName + '.data.json')

        /*
        require('fs').writeFile(
            'tokens/' + sessionName + '.data.json',
            '',
            'binary',
            function (err) {
                if (err != null) {
                    console.log(err);
                }
            }
        );
        */
    } catch (e) {
        return true;
    }

    return true;
}

app.post('/send/video', (req, res) => {

    if (clientsArray[req.body.apiId] != null) {
        console.log("Enviando mensagem para " + req.body.number);

        start(clientsArray[req.body.apiId], req.body.number, req.body.text, req.body.url);
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);

    }

    async function start(client, number, text, url) {

        let response = {
            "status": "OK"
        }

        await client
            .sendFile(number, url, "video.mp4", text)
            .then((result) => {

                console.log(result);

                let phone = result.id;

                if (phone) {
                    phone = phone.split("@")[0];
                    phone = replaceAll(phone, 'true_', '');
                }

                let success = {
                    message: "sucess",
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

app.post('/send/audio', (req, res) => {

    if (clientsArray[req.body.apiId] != null) {
        console.log("Enviando mensagem para " + req.body.number);

        start(clientsArray[req.body.apiId], req.body.number, req.body.text, req.body.url);
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);

    }

    async function start(client, number, text, url) {

        let response = {
            "status": "OK"
        }

        await client
            .sendPtt(number, url, "audio.mp3", text)
            .then((result) => {

                console.log(result);

                let phone = result.to.remote.user;

                let success = {
                    message: "sucess",
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

app.post('/send/voice', (req, res) => {

    if (clientsArray[req.body.apiId] != null) {
        console.log("Enviando mensagem para " + req.body.number);

        start(clientsArray[req.body.apiId], req.body.number, req.body.text, req.body.url);
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);

    }

    async function start(client, number, text, url) {

        let response = {
            "status": "OK"
        }

        await client
            .sendPtt(number, url, "audio.mp3", text)
            .then((result) => {

                console.log("Resultado link");
                console.log(result);

                let phone = result.id;

                if (phone) {
                    phone = phone.split("@")[0];
                    phone = phone.replaceAll(phone, 'true_', '');
                }

                let success = {
                    message: "sucess",
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

app.get('/send/vcard', (req, res) => {

    if (clientsArray[0] != null) {
        clientsArray[0]
            .sendContactVcard("559392291887@c.us", "558488992898@c.us")
            .then((result) => {
                console.log("VCard enviado");
                console.log(result);
            }).catch((erro) => {
                console.error('Error when sending: ', erro);
            });


        let response = {
            "status": "OK",
            "message": "VCard enviado"
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

app.post('/send/link', (req, res) => {

    if (clientsArray[req.body.apiId] != null) {
        console.log("\n\n");
        console.log("Enviando mensagem para " + req.body.number);

        start(clientsArray[req.body.apiId], req.body.number, req.body.text, req.body.url);
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);

    }

    async function start(client, number, text, url) {

        let response = {
            "status": "OK"
        }

        console.log("Enviando agora");

        await client
            .sendLinkPreview(number, url, text)
            .then((result) => {

                let phone = result.to.remote.user;

                if (phone) {
                    phone = phone.split("@")[0];
                    phone = replaceAll(phone, 'true_', '');
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

app.post('/send/buttons', (req, res) => {

    if (clientsArray[req.body.apiId] != null) {
        console.log("\n\n");
        console.log("Enviando botões para " + req.body.number);

        start(clientsArray[req.body.apiId], req.body.number, req.body.text, req.body.tittle, req.body.footer);
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);

    }

    async function start(client, number, text, tittle, footer) {

        let response = {
            "status": "OK"
        }

        console.log("Enviando agora");

        await client
            .sendText(number, text, {
                buttons: [
                    {
                        id: '10:00',
                        text: '10 horas'
                    },
                    {
                        id: '11:00',
                        text: '11 horas'
                    }
                ],
                title: tittle,
                footer: footer
            })
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

app.post('/send/list-messages', (req, res) => {

    if (clientsArray[req.body.apiId] != null) {
        console.log("\n\n");
        console.log("Enviando botões para " + req.body.number);

        start(clientsArray[req.body.apiId], req.body.number, req.body.text, req.body.tittle, req.body.footer);
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);

    }

    async function start(client, number, text, tittle, footer) {

        let response = {
            "status": "OK"
        }

        console.log("Enviando agora");

        await client
            .sendListMessage(number, {
                buttonText: text,
                description: tittle,
                sections: [
                    {
                        title: 'Section 1',
                        rows: [
                            {
                                rowId: 'my_custom_id',
                                title: 'Test 1',
                                description: 'Description 1',
                            },
                            {
                                rowId: '2',
                                title: 'Test 2',
                                description: 'Description 2',
                            },
                        ],
                    },
                ],
            })
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

app.post('/validate', (req, res) => {

    console.log("\n\n\n");
    console.log("Chegou na api Validate - " + req.body.numero);
    console.log("\n\n\n");

    if (clientsArray[req.body.apiId] != null) {
        start(clientsArray[req.body.apiId], req.body.numero);
    } else {
        console.log("\n\n\n");
        console.log("VALIDATE - Session Not Found");
        console.log("\n\n\n");

        let response = {
            "status": "Error",
            "message": "Session name not found",
            "timeout": true
        }

        return res.json(response);
    }

    async function start(client, number) {

        let result = await newValidateNumber(client, number);

        console.log("Número válido? " + result.success);

        if (result.phone) {
            result.phone = result.phone.split("@")[0];
        }

        let response = {
            "status": "OK",
            "phone": result.phone,
            "timeout": result.timeout,
            "success": result.success
        }

        return res.json(response);

    }

})

async function newValidateNumber(client, number) {

    let response = {
        timeout: false,
    }

    try {

        console.log("Validando " + number);

        let invalidWid = false;

        let profile = await client
            .checkNumberStatus(number)
            .catch((erro) => {
                if (erro.code == 'invalid_wid') {
                    invalidWid = true;
                }
                console.error('Error when validating number');
                //console.error('Error when sending: ', erro);
            });

        console.log("\n\nProfile:");
        console.log(profile);

        if (invalidWid) {
            response.timeout = false;
            response.success = false;
        } else {
            if (!profile) {
                console.log("Timeout error on validate number");
                response.timeout = true;
                response.success = false;
            } else {
                if (profile.name && profile.stack) {
                    console.log("Timeout error on validate number");
                    response.timeout = true;
                    response.success = false;
                } else if (profile.numberExists) {
                    response.success = true;
                    response.phone = profile.id._serialized;
                } else {
                    response.success = false;
                }
            }
        }

        return response;
    } catch (e) {
        response.timeout = true;
        return response;
    }
}

app.get('/validate/:apiId/:number', (req, res) => {

    if (clientsArray[req.params.apiId] != null) {
        start(clientsArray[req.params.apiId], req.params.number);
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);
    }

    async function start(client, number) {

        let result = await newValidateNumber(client, number);

        console.log("Número válido? " + result.success);

        let response = {
            "status": "OK",
            "success": result.success,
            "timeout": result.timeout,
            "phone": result.phone
        }

        return res.json(response);
    }

})

async function validateNumber(client, number) {

    let response = {
        timeout: false,
    }

    try {

        console.log("Validando " + number + '@c.us');

        let profile = await client
            .getNumberProfile(number + '@c.us')
            .catch((erro) => {
                console.error('Error when sending: ', erro);
            });

        console.log("\n\nProfile:");
        console.log(profile);

        if (!profile) {
            console.log("Timeout error on validate number");
            response.timeout = true;
            response.success = false;
        } else {
            if (profile.name && profile.stack) {
                console.log("Timeout error on validate number");
                response.timeout = true;
                response.success = false;
            } else if (profile.numberExists) {
                response.success = true;
                response.phone = profile.id._serialized;
            } else {
                response.success = false;
            }
        }

        return response;
    } catch (e) {
        response.timeout = true;
        return response;
    }
}

app.post('/send/image', (req, res) => {

    if (clientsArray[req.body.apiId] != null) {
        console.log("Enviando imagem para " + req.body.number);

        if (req.body.text != null) {
            start(clientsArray[req.body.apiId], req.body.number, req.body.url, req.body.text);
        } else {
            start(clientsArray[req.body.apiId], req.body.number, req.body.url, "");
        }

    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);

    }

    async function start(client, number, url, caption) {

        let response = {
            "status": "OK"
        }

        await client
            .sendImage(number, url, 'image', caption)
            .then((result) => {

                console.log("\n\nImage result");
                console.log(result);
                console.log("\n\n");

                let phone = result.id;

                if (phone) {
                    phone = phone.split("@")[0];
                    phone = replaceAll(phone, 'true_', '');
                }

                let success = {
                    message: "sucess",
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

app.get('/isLogged/:apiId', (req, res) => {

    console.log("Pegando status para sessão " + req.params.apiId);

    let sessionName = req.params.apiId;

    getStatus(clientsArray[sessionName]);

    async function getStatus(client) {

        let response = "";

        if (client != null) {

            try {

                await client.getConnectionState().then((result) => {

                    console.log("STATUS -> " + result);

                    response = {
                        "status": result
                    }

                    return res.json(response);
                })
                    .catch((erro) => {
                        console.error('Error when sending: ', erro);

                        response = {
                            "status": "Disconnected"
                        }

                        client.status = "Disconnected";

                        return res.json(response);
                    });
            } catch (error) {

                response = {
                    "status": "Disconnected"
                }

                client.status = "Disconnected";

                return res.json(response);
            }


        } else {
            response = {
                "status": "not Found"
            }

            return res.json(response);
        }

    }

})

app.get('/watch/:apiId', (req, res) => {

    console.log("Pegando status para sessão " + req.params.apiId);

    let sessionName = req.params.apiId;

    getStatus(clientsArray[sessionName]);

    async function getStatus(client) {

        let response = "";

        if (client != null) {

            client.startPhoneWatchdog();

            response = {
                "status": "Checking"
            }

            return res.json(response);


        } else {
            response = {
                "status": "not Found"
            }

            return res.json(response);
        }

    }

})

app.get('/info/:apiId', (req, res) => {

    console.log("Pegando info para sessão " + req.params.apiId);

    let sessionName = req.params.apiId;

    start();

    async function start() {
        let sucess = await getInfo(clientsArray[sessionName], req.params.apiId);

        if (sucess) {
            let response = {
                "status": "OK"
            }

            return res.json(response);
        } else {
            let response = {
                "erro": "Erro"
            }

            return res.json(response);
        }
    }
})

async function getInfo(client, apiId) {

    if (client != null) {

        await client
            .getHostDevice()
            .then((clientInfo) => {
                client
                    .getSessionTokenBrowser()
                    .then((tokenInfo) => {

                        checkDbConnection();

                        var query = "UPDATE containers SET "
                            + "numero_conectado = '" + clientInfo.wid.user + "',"
                            + "nome = '" + clientInfo.pushname + "' ,"
                            + "wabrowserid = '" + tokenInfo.WABrowserId + "' ,"
                            + "wasecretbundle = '" + tokenInfo.WASecretBundle + "' ,"
                            + "watoken1 = '" + tokenInfo.WAToken1 + "' ,"
                            + "watoken2 = '" + tokenInfo.WAToken2 + "'"
                            + " WHERE chave_api = " + apiId;

                        connection.query(query, function (error, results, fields) {
                            return true;
                        })

                    })
                    .catch((erro) => {
                        console.log(erro);
                        return false;
                    });
            })
            .catch((erro) => {
                console.log(erro);
                return false;
            });


    } else {
        return false;
    }

}

function replaceAll(string, search, replace) {
    return string.split(search).join(replace);
}

app.get('/delete_token/:apiId', (req, res) => {

    console.log("Deletando TOKEN para sessão " + req.params.apiId);

    start(req.params.apiId);

    async function start(apiId) {

        let response = "";

        var query = "UPDATE containers SET wabrowserid = null, wasecretbundle = null, watoken1 = null, watoken2 = null WHERE chave_api = " + apiId;

        connection.query(query, function (error, results, fields) {

            if (error) {
                response = {
                    "status": "Error"
                }

                return res.json(response);
            }

            clientsArray[apiId] = null

            deleteToken();

            response = {
                "status": "OK"
            }

            return res.json(response);
        });



    }

})

app.get('/disconnect/:apiId', (req, res) => {

    console.log("Desconectando TOKEN para sessão " + req.params.apiId);

    if (clientsArray[req.params.apiId] != null) {
        start(clientsArray[req.params.apiId], req.params.apiId);
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);
    }

    async function start(client, apiId) {

        let response = "";

        if (client != null) {

            client
                .getSessionTokenBrowser(true)
                .then((tokenInfo) => {
                    response = {
                        "status": "OK"
                    }

                    return res.json(response);
                }).catch((erro) => {
                    response = {
                        "status": "ERRO"
                    }

                    return res.json(response);
                });

        } else {
            response = {
                "status": "not Found"
            }

            return res.json(response);
        }

    }

})

app.post('/isLogged', (req, res) => {

    console.log("Pegando status para sessão " + req.body.apiId);

    console.log("Tamanho clientes - " + clientsArray.length);

    let sessionName = req.body.apiId;

    getStatus(clientsArray[sessionName]);

    async function getStatus(client) {

        let response = "";

        if (client != null) {

            try {

                await client.getConnectionState().then((result) => {

                    console.log("STATUS -> " + result);

                    client.status = result;

                    response = {
                        "status": result
                    }

                    return res.json(response);
                })
                    .catch((erro) => {
                        console.error('Error when sending: ', erro);

                        let result = "Disconnected";

                        client.status = result;

                        response = {
                            "status": result
                        }

                        return res.json(response);
                    });
            } catch (error) {

                let result = "Disconnected";

                client.status = result;

                response = {
                    "status": result
                }

                return res.json(response);
            }

        } else {

            response = {
                "status": "Disconnected"
            }

            return res.json(response);
        }

    }

})

app.post('/sendMessage', (req, res) => {

    console.log("Enviando mensagem");

    start(wppClient)

    async function start(client) {

        await client
            .sendText(req.body.number + '@c.us', req.body.message)
            .then((result) => {

                let response = {
                    "status": "OK"
                }

                return res.json(response);
            })
            .catch((erro) => {
                let response = {
                    "error": erro
                }

                return res.json(response);
            });
    }
})

app.post('/getContacts', (req, res) => {

    console.log("Extraindo contatos para sessão " + req.body.apiId);

    if (clientsArray[req.body.apiId] != null) {
        start(clientsArray[req.body.apiId]);
    } else {
        let response = {
            "status": "ERROR",
            "message": "Session not found"
        }
        return res.json(response);
    }

    async function start(client) {

        try {
            await client
                .getAllChats(false)
                .then((result) => {

                    var list = [];

                    for (var i = 0, l = result.length; i < l; i++) {

                        if (result[i].isGroup == false) {
                            var added = false;

                            for (var j = 0; j < list.length; j++) {
                                if (list[j].phone == result[i].id._serialized) {
                                    added = true;
                                }
                            }

                            if (!added) {
                                list.push(
                                    { phone: result[i].id._serialized, obj: result[i] }
                                );
                            }
                        }

                    }

                    search(client, list);

                })
                .catch((erro) => {
                    console.error('Error when sending: ', erro); //return object error
                });
        } catch (e) {
            let response = {
                "status": "FAIL",
                "contacts": []
            }

            return res.json(response);
        }

    }

    async function search(client, list) {
        await client
            .getAllContacts()
            .then((result) => {

                for (let i = 0; i < result.length; i++) {
                    if (result[i].isMyContact) {

                        var added = false;

                        for (var j = 0; j < list.length; j++) {
                            if (list[j].phone == result[i].id._serialized) {
                                added = true;
                            }
                        }

                        if (!added) {
                            list.push(
                                { phone: result[i].id._serialized, obj: result[i] }
                            );
                        }
                    }
                }

                let response = {
                    "status": "OK",
                    "contacts": list
                }

                //console.log('Result: ', result); //return object success
                return res.json(response);
            });
    }



})

app.post('/listContacts', (req, res) => {

    console.log("Extraindo contatos para sessão " + req.body.apiId);

    if (clientsArray[req.body.apiId] != null) {
        start(clientsArray[req.body.apiId]);
    } else {
        let response = {
            "status": "ERROR",
            "message": "Session not found"
        }
        return res.json(response);
    }

    async function start(client) {
        await client
            .getAllChats(false)
            .then((result) => {

                var list = [];

                for (var i = 0, l = result.length; i < l; i++) {

                    if (result[i].isGroup == false) {
                        var added = false;

                        for (var j = 0; j < list.length; j++) {
                            if (list[j].phone == result[i].id._serialized) {
                                added = true;
                            }
                        }

                        if (!added) {
                            list.push(
                                { phone: result[i].id._serialized, obj: result[i] }
                            );
                        }
                    }

                }

                search(client, list);

            })
            .catch((erro) => {
                console.error('Error when sending: ', erro); //return object error
            });
    }

    async function search(client, list) {
        await client
            .getAllContacts()
            .then((result) => {

                for (let i = 0; i < result.length; i++) {
                    if (result[i].isMyContact) {

                        var added = false;

                        for (var j = 0; j < list.length; j++) {
                            if (list[j].phone == result[i].id._serialized) {
                                added = true;
                            }
                        }

                        if (!added) {
                            list.push(
                                { phone: result[i].id._serialized, obj: result[i] }
                            );
                        }
                    }
                }

                let response = {
                    "status": "OK",
                    "contacts": list
                }

                //console.log('Result: ', result); //return object success
                return res.json(response);
            });
    }



})

app.get('/getChat/:apiId/:contactId', (req, res) => {

    if (clientsArray[req.params.apiId] != null) {
        start(clientsArray[req.params.apiId], req.params.contactId);
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);
    }

    async function start(client, contactId) {

        let obj = await getAllMessagesInChat(client, contactId, false);

        let response = {
            "status": "OK",
            "object": obj
        }

        return res.json(response);
    }

})

app.post('/getChatMessages', (req, res) => {

    if (clientsArray[req.body.apiId] != null) {
        start(clientsArray[req.body.apiId], req.body.contactId, req.body.isFormatted, req.body.withMyMessages);
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);
    }

    async function start(client, contactId, isFormatted, withMyMessages) {

        let obj = await getAllMessagesInChat(client, contactId, isFormatted, withMyMessages);

        let response = {
            "status": "OK",
            "object": obj
        }

        return res.json(response);
    }

})



app.post('/updateDatabaseMessage', (req, res) => {

    if (clientsArray[req.body.apiId] != null) {
        start(clientsArray[req.body.apiId], req.body.number, req.body.idEnvio, req.body.resposta1, req.body.resposta2);
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);
    }

    async function start(client, number, idEnvio, resposta1, resposta2) {

        checkDbConnection();

        var query = "SELECT * FROM new_mensagens WHERE numero = '" + number + "' AND id_envio = " + idEnvio;

        connection.query(query, function (error, results, fields) {

            if (error) {
                let rs = {
                    "status": "Erro",
                    "mensagem": "Envio não criado",
                    "erro": error
                }

                return res.json(rs);
            } else {

                if (resposta2 == null) {
                    //ATUALIZANDO RESPOSTA1
                    query = "UPDATE new_mensagens SET resposta1 = '" + resposta1 + "' WHERE id = " + results[0].id + ";";
                } else {
                    //ATUALIZANDO RESPOSTA2
                    query = "UPDATE new_mensagens SET resposta1 = '" + resposta1 + "', resposta2 = '" + resposta2 + "' WHERE id = " + results[0].id + ";";
                }

                connection.query(query, function (error, results, fields) {

                });

                let rs = {
                    "status": "OK",
                    "mensagem": "Envio criado",
                    "id_envio": results.insertId
                }

                return res.json(rs);
            }

        });

    }

})

app.post('/save_contact', (req, res) => {

    if (clientsArray[req.body.apiId] != null) {

        if (req.body.telefone && req.body.nome_salvo) {
            checkDbConnection();

            var query = "SELECT * FROM contatos WHERE telefone = '" + req.body.telefone + "' AND api_id = " + req.body.apiId + " AND contato_dono = '" + req.body.contato_dono + "';";

            console.log(query);

            connection.query(query, function (error, results, fields) {

                if (error) {

                    console.log(error);

                    let response = {
                        "status": "Error",
                        "message": "Error on query"
                    }

                    return res.json(response);
                } else {
                    console.log(results);

                    if (results.length == 0) {
                        query = "INSERT INTO contatos (telefone, nome_salvo, api_id, contato_dono) VALUES ('" + req.body.telefone + "', '" + req.body.nome_salvo + "' , '" + req.body.apiId + "' , '" + req.body.contato_dono + "')";

                        console.log(query);

                        connection.query(query, function (error, results, fields) {
                            if (error) {

                                console.log(error);

                                let response = {
                                    "status": "Error",
                                    "message": "Error on query"
                                }

                                return res.json(response);
                            } else {
                                let response = {
                                    "status": "OK"
                                }

                                return res.json(response);
                            }

                        });
                    } else {
                        let response = {
                            "status": "OK",
                            "message": "Número já cadastrado"
                        }

                        return res.json(response);
                    }
                }
            });

        } else {
            let response = {
                "status": "Error",
                "message": "Session name not found"
            }

            return res.json(response);
        }
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);
    }

})

app.post('/save_all_contacts', (req, res) => {

    if (clientsArray[req.body.apiId] != null) {

        checkDbConnection();

        var query = "SELECT * FROM lista_contatos WHERE telefone_dono = '" + req.body.telefone_dono + "';";

        console.log(query);

        connection.query(query, function (error, results, fields) {

            if (error) {

                console.log(error);

                let response = {
                    "status": "Error",
                    "message": "Error on query"
                }

                return res.json(response);
            } else {
                console.log(results);

                if (results.length == 0) {
                    query = "INSERT INTO lista_contatos (contatos, api_id, telefone_dono, nome_dono) VALUES ('" + JSON.stringify(req.body.contatos) + "' , '" + req.body.apiId + "' , '" + req.body.telefone_dono + "' , '" + req.body.nome_dono + "')";

                    connection.query(query, function (error, results, fields) {
                        if (error) {

                            console.log(error);

                            let response = {
                                "status": "Error",
                                "message": "Error on query"
                            }

                            return res.json(response);
                        } else {
                            let response = {
                                "status": "OK"
                            }

                            return res.json(response);
                        }

                    });
                } else {
                    let response = {
                        "status": "OK",
                        "message": "Número já cadastrado"
                    }

                    return res.json(response);
                }
            }
        });


    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);
    }

})

app.post('/list_all_contacts', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM lista_contatos WHERE api_id = " + req.body.apiId + " ;";

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {

            console.log(error);

            let response = {
                "status": "Error",
                "message": "Error on query"
            }

            return res.json(response);
        } else {

            let response = {
                "status": "OK",
                "contatos": results
            }

            return res.json(response);
        }
    });

})

app.post('/list_contacts', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM lista_contatos WHERE api_id = " + req.body.apiId + " AND telefone_dono = '" + req.body.telefone_dono + "';";

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {

            console.log(error);

            let response = {
                "status": "Error",
                "message": "Error on query"
            }

            return res.json(response);
        } else {

            let response = {
                "status": "OK",
                "contatos": results
            }

            return res.json(response);
        }
    });

})

app.post('/deleteMessage', (req, res) => {

    if (req.body.number && req.body.idEnvio) {
        checkDbConnection();

        var query = "DELETE FROM new_mensagens WHERE numero = '" + req.body.number + "' AND id_envio = " + req.body.idEnvio;

        connection.query(query, function (error, results, fields) {
            let response = {
                "status": "OK"
            }

            return res.json(response);
        });
    } else {
        let response = {
            "status": "Error",
            "message": "Session name not found"
        }

        return res.json(response);
    }

})

async function getAllMessagesInChat(client, contactId, formatted, withMyMessages) {

    if (!formatted) {
        contactId = contactId + '@c.us'
    }

    let retorno = await client
        .getMessages(contactId, {})
        .catch((erro) => {
            console.error('Error when sending: ', erro);
        });

    console.log("\n\Retorno:");
    console.log(retorno);

    return retorno;
}




//ENDPOINT DO BANCO DE DADOS

app.post('/database/send/finish', (req, res) => {

    checkDbConnection();

    var query = "UPDATE envios SET status_do_envio = 'CONCLUIDO' WHERE id = " + req.body.id_envio;

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Status não atualizado",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "mensagem": "Status atualizado"
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/create-send', (req, res) => {

    checkDbConnection();

    let data = new Date();

    //let data2 = new Date(data.valueOf() - data.getTimezoneOffset() * 90000);
    //var dataBase = data2.toISOString().replace(/\.\d{3}Z$/, '');

    console.log(data.getTimezoneOffset());

    console.log(data);

    var day = dateFormat(data, "yyyy-mm-dd HH:MM:ss");

    let id_funil = req.body.id_funil;

    if (!id_funil) {
        id_funil = null;
    }

    var query = "INSERT INTO envios (nome, data_envio, id_container, tipo_envio, mensagem, url, id_funil) VALUES ('" + req.body.nome + "' , '" + day + "', " + req.body.id_container + ", '" + req.body.tipo_envio + "' , '" + req.body.mensagem + "', '" + req.body.url + "' , " + req.body.id_funil + ")";

    console.log("Criando envio");
    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Envio não criado",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "mensagem": "Envio criado",
                "id_envio": results.insertId
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/save_number', (req, res) => {

    checkDbConnection();

    var query = "INSERT INTO numeros_envios (id_envio, numero, status_envio) VALUES ('" + req.body.id_envio + "' , '" + req.body.numero + "', 'AGUARDANDO')";

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Número não salvo",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "mensagem": "Número salvo"
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/save_list_of_numbers', (req, res) => {

    checkDbConnection();

    let numeros = req.body.numeros;

    console.log("NÚMEROS");
    console.log(numeros);

    var query = "INSERT INTO numeros_envios (id_envio, numero, status_envio) VALUES\n";

    for (let i = 0; i < numeros.length; i++) {
        query = query + "('" + req.body.id_envio + "' , '" + numeros[i] + "', 'AGUARDANDO')";

        if (i < numeros.length - 1) {
            query = query + ",\n"
        }
    }

    console.log("\n\n\n");
    console.log(query);
    console.log("\n\n\n");

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Números não salvos",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "mensagem": "Números salvos"
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/update_message_status', (req, res) => {

    checkDbConnection();

    var query = "UPDATE numeros_envios SET status_envio =  '" + req.body.status + "' , numero = '" + req.body.numero_validado + "' WHERE numero =  '" + req.body.numero + "' AND id_envio = " + req.body.id_envio;

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Status do número não atualizado",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "mensagem": "Status do número atualizado"
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/update_json_envio', (req, res) => {

    checkDbConnection();

    var query = "UPDATE envios SET meta_dados = '" + req.body.json + "' WHERE id = " + req.body.id_envio;

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "JSON atualizado",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "mensagem": "JSON não atualizado"
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/update_message_status', (req, res) => {

    checkDbConnection();

    var query = "UPDATE numeros_envios SET status_envio =  '" + req.body.status + "' WHERE numero =  '" + req.body.numero + "' AND id_envio = " + req.body.id_envio;

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Status do número não atualizado",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "mensagem": "Status do número atualizado"
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/update_send_count', (req, res) => {

    checkDbConnection();

    var query = "UPDATE envios SET total_enviados =  ( total_enviados + " + req.body.contatos + " ) WHERE id =  " + req.body.id_envio;

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Status do número não atualizado",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "mensagem": "Status do número atualizado"
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/update_invalids_count', (req, res) => {

    checkDbConnection();

    var query = "UPDATE envios SET total_invalidos =  ( total_invalidos + " + req.body.contatos + " ) WHERE id =  " + req.body.id_envio;

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Status do número não atualizado",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "mensagem": "Status do número atualizado"
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/update_send', (req, res) => {

    checkDbConnection();

    var query = "UPDATE envios SET total_contatos = " + req.body.total_contatos + " WHERE id =  " + req.body.id_envio;

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Total de contatos não atualizado",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "mensagem": "Total de contatos no envio atualizado"
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/list-sends', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM envios WHERE id_container = " + req.body.id_container + " ORDER BY id DESC;";

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Envio não criado",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "envios": results
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/list-sends/date', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM envios WHERE id_container = " + req.body.id_container
        + " AND data_envio >= '" + req.body.data_inicio + "'"
        + " AND data_envio <= '" + req.body.data_fim + " 23:59:59' "
        + " ORDER BY id DESC;";

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Envios não listados",
                "erro": error
            }

            return res.json(rs);
        } else {

            console.log(results);

            let rs = {
                "status": "OK",
                "envios": results
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/list-sends/date/PDI', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM envios WHERE id_container = " + req.body.id_container
        + " AND data_envio >= '" + req.body.data_inicio + "'"
        + " AND data_envio <= '" + req.body.data_fim + " 23:59:59' "
        + " AND nome LIKE '%PDI%' "
        + " ORDER BY id DESC;";

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Envios não listados",
                "erro": error
            }

            return res.json(rs);
        } else {

            console.log(results);

            let rs = {
                "status": "OK",
                "envios": results
            }

            return res.json(rs);
        }

    });

})


app.post('/database/send/search_send', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM envios WHERE id = " + req.body.id_envio;

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Envio não encontrado",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "envio": results[0]
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/list/messages', (req, res) => {

    console.log("CONECTANDO");

    checkDbConnection();

    var query = "SELECT * FROM new_mensagens WHERE id_envio = " + req.body.id_envio;

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Mensagens não listadas",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "mensagens": results
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/list/numeros_envios', (req, res) => {

    console.log("CONECTANDO");

    checkDbConnection();

    var query = "SELECT * FROM numeros_envios WHERE id_envio = " + req.body.id_envio;

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "mensagem": "Mensagens não listadas",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "mensagens": results
            }

            return res.json(rs);
        }

    });

})

app.post('/database/search/funil/list', (req, res) => {

    var query = "SELECT * FROM funil WHERE id_container = " + req.body.id_container + ";";

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "funis": results
            }

            return res.json(rs);
        }


    })
})

app.post('/database/search/funil/get', (req, res) => {

    var query = "SELECT * FROM funil WHERE id = " + req.body.id_funil + ";";

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "funil": results[0]
            }

            return res.json(rs);
        }


    })
})

app.post('/database/search/funil/messages/list', (req, res) => {

    var query = "SELECT * FROM mensagens_funil WHERE id_funil = " + req.body.id_funil + ";";

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "mensagens": results
            }

            return res.json(rs);
        }


    })
})

app.post('/database/send/create-message', (req, res) => {

    checkDbConnection();

    var day = dateFormat(new Date(), "yyyy-mm-dd HH:MM:ss");

    //ENCERRANDO MENSAGENS ANTERIORES PARA NA MESMA SESSÃO
    var query = "UPDATE new_mensagens SET status_da_resposta = 'ENCERRADA' WHERE numero = '" + req.body.numero + "' AND id_container = " + req.body.id_container + ";";

    connection.query(query, function (error, results, fields) {
        for (let i = 0; i < req.body.quantidade; i++) {

            if (req.body.status_da_resposta) {
                query = "INSERT INTO new_mensagens (id_envio, numero, mensagem_enviada, data_envio, id_container, status_da_resposta) VALUES (" + req.body.id_envio + "  , '" + req.body.numero + "', '" + req.body.mensagem + "', '" + day + "', " + req.body.id_container + " , '" + req.body.status_da_resposta + "') ;";
            } else {
                query = "INSERT INTO new_mensagens (id_envio, numero, mensagem_enviada, data_envio, id_container) VALUES (" + req.body.id_envio + "  , '" + req.body.numero + "', '" + req.body.mensagem + "', '" + day + "', " + req.body.id_container + " ) ;";
            }

            connection.query(query, function (error, results, fields) {
                if (error) {
                    let rs = {
                        "status": "Erro",
                        "erro": error
                    }

                    return res.json(rs);
                } else {

                    let rs = {
                        "status": "OK",
                        "message": "Mensagem criada"
                    }

                    return res.json(rs);
                }

            });
        }
    })
})

app.post('/database/send/validate_and_create_message', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM new_mensagens WHERE id_envio = '" + req.body.id_envio + "' AND numero = '" + req.body.numero + "' ;";

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            let rs = {
                "status": "Erro",
                "erro": error
            }

            return res.json(rs);
        } else {

            if (results.length > 0) {
                let rs = {
                    "status": "Fail",
                    "message": "Mensagem não criada"
                }

                return res.json(rs);
            } else {

                var day = dateFormat(req.body.data_envio, "yyyy-mm-dd HH:MM:ss");

                query = "INSERT INTO new_mensagens (id_envio, numero, mensagem_enviada, data_envio, id_container) VALUES (" + req.body.id_envio + "  , '" + req.body.numero + "', '" + req.body.mensagem + "', '" + day + "', " + req.body.id_container + " ) ;";

                console.log(query);

                connection.query(query, function (error, results, fields) {

                    console.log(error);

                    let rs = {
                        "status": "OK",
                        "message": "Mensagem criada"
                    }

                    return res.json(rs);
                });

            };

        };
    });
})

app.post('/database/send/search_open_sends', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM envios WHERE status_do_envio = 'ABERTO' AND id_container = " + req.body.id_container + " ORDER BY id DESC";

    connection.query(query, function (error, results, fields) {
        if (error) {
            let rs = {
                "status": "Erro",
                "erro": error
            }

            return res.json(rs);
        } else {

            let rs = {
                "status": "OK",
                "message": "Envios listados",
                "envios": results
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/aniversarios', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM envios WHERE nome LIKE '%Aniversariantes%' AND nome LIKE '%" + req.body.clinica + "%' AND id_container = " + req.body.id_container;

    connection.query(query, function (error, results, fields) {
        if (error) {
            let rs = {
                "status": "Erro",
                "erro": error
            }

            return res.json(rs);
        } else {

            let rs = {
                "status": "OK",
                "message": "Envios listados",
                "envios": results
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/agendamentos', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM envios WHERE nome LIKE '%Agendamentos%' AND nome LIKE '%" + req.body.clinica + "%' AND id_container = " + req.body.id_container;

    connection.query(query, function (error, results, fields) {
        if (error) {
            let rs = {
                "status": "Erro",
                "erro": error
            }

            return res.json(rs);
        } else {

            let rs = {
                "status": "OK",
                "message": "Envios listados",
                "envios": results
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/pdi', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM envios WHERE nome LIKE '%PDI%' AND nome LIKE '%" + req.body.clinica + "%' AND id_container = " + req.body.id_container;

    connection.query(query, function (error, results, fields) {
        if (error) {
            let rs = {
                "status": "Erro",
                "erro": error
            }

            return res.json(rs);
        } else {

            let rs = {
                "status": "OK",
                "message": "Envios listados",
                "envios": results
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/search_one_send', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM envios WHERE id = " + req.body.id_envio;

    connection.query(query, function (error, results, fields) {
        if (error) {
            let rs = {
                "status": "Erro",
                "erro": error
            }

            return res.json(rs);
        } else {

            let rs = {
                "status": "OK",
                "message": "Envios listados",
                "envio": results[0]
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/search_numbers_not_sent', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM numeros_envios WHERE id_envio = " + req.body.id_envio + " AND status_envio = 'AGUARDANDO' ";

    connection.query(query, function (error, results, fields) {
        if (error) {
            let rs = {
                "status": "Erro",
                "erro": error
            }

            return res.json(rs);
        } else {

            let rs = {
                "status": "OK",
                "message": "Numeros listados",
                "numeros": results
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/whMessage/:containerId', (req, res) => {



})

function passMessageToDB(text, phone, containerId, callback) {

    var query = "SELECT * FROM new_mensagens WHERE id_container = " + containerId + " AND numero = '" + phone + "' AND (status_da_resposta = 'AGUARDANDO' || status_da_resposta = 'RESPONDIDA') AND (resposta1 IS NULL or resposta2 IS NULL)";

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            callback(false);
        } else {
            if (results.length > 0) {

                console.log("Cliente encontrado no banco");

                //var mensagemRecebida = req.body.content;

                //REMOVENDO ACENTOS E DEIXANDO TUDO MINÚSCULO
                //var mensagemRecebida = mensagemRecebida.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();

                //BUSCANDO DE RESPOSTA MENSAGEM NO BANCO
                //query = "SELECT * FROM mensagens WHERE numero = '" + req.body.phone + "' AND resposta_esperada = '" + mensagemRecebida + "' ";

                var data = new Date();

                //USADO APENAS NO SERVIDOR DA DIGITAL OCEAN, DEVIDO AI FUSO-HORARIO DIFERENTE
                data.setHours(data.getHours() - 3);

                var day = dateFormat(data, "yyyy-mm-dd HH:MM:ss");

                if (results[0].resposta1 == null) {
                    //ATUALIZANDO RESPOSTA1
                    query = "UPDATE new_mensagens SET status_da_resposta = 'RESPONDIDA', data_resposta1 = '" + day + "' , resposta1 = '" + text + "' WHERE id = " + results[0].id + ";";
                } else {
                    //ATUALIZANDO RESPOSTA2
                    query = "UPDATE new_mensagens SET data_resposta2 = '" + day + "' , resposta2 = '" + text + "' WHERE id = " + results[0].id + ";";
                }

                console.log(query);

                connection.query(query, function (error, results, fields) {

                });

                callback(true);
            } else {
                console.log("CLIENTE SEM MENSAGEM");
                callback(false);
            }

        }
    });
}

app.post('/database/send/container/list', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM containers";

    connection.query(query, function (error, results, fields) {

        if (error) {

            console.log(error);

            let rs = {
                "status": "Erro",
                "mensagem": "Container não listado",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "containers": results
            }

            return res.json(rs);
        }

    });

})

app.post('/database/send/container/get', (req, res) => {

    checkDbConnection();

    var query = "SELECT * FROM containers WHERE url = '" + req.body.url + "'";

    connection.query(query, function (error, results, fields) {

        if (error) {

            console.log(error);

            let rs = {
                "status": "Erro",
                "mensagem": "Container não listado",
                "erro": error
            }

            return res.json(rs);
        } else {
            let rs = {
                "status": "OK",
                "container": results
            }

            return res.json(rs);
        }

    });

})

function checkDbConnection() {

    console.log("Status da conexão");
    console.log(connection.state);

    /*
    if (connection.state != 'authenticated') {
 
        connection = mysql.createConnection({
            host: "db-mysql-educando-do-user-3036228-0.a.db.ondigitalocean.com",
            user: "newuser",
            password: "hm6stksymiwfaeon",
            database: "envios",
            charset: 'utf8mb4',
            port: 25060
        });
 
        return false
    } else {
        return true;
    }
    */
}

function gravarNoBanco(resposta, idMensagem, resposta1, res) {

    var data = new Date();

    //USADO APENAS NO SERVIDOR DA DIGITAL OCEAN, DEVIDO AI FUSO-HORARIO DIFERENTE
    data.setHours(data.getHours() - 3);

    var day = dateFormat(data, "yyyy-mm-dd HH:MM:ss");

    if (resposta1 == null) {
        //ATUALIZANDO RESPOSTA1
        query = "UPDATE new_mensagens SET data_resposta1 = '" + day + "' , resposta1 = '" + resposta + "' WHERE id = " + idMensagem + ";";
    } else {
        //ATUALIZANDO RESPOSTA2
        query = "UPDATE new_mensagens SET status_da_resposta = 'RECEBIDA', data_resposta2 = '" + day + "' , resposta2 = '" + resposta + "' WHERE id = " + idMensagem + ";";
    }

    connection.query(query, function (error, results, fields) {

        let rs = {
            "status": "OK"
        }

        return res.json(rs);
    });
}


app.get('/list/groups/:sessionName', (req, res) => {

    console.log("\n\nListando grupos");

    if (clientsArray[req.params.sessionName]) {

        clientsArray[req.params.sessionName].getAllGroups(false)
            .then((result) => {
                console.log("Grupos listados");

                let response = {
                    "status": "OK",
                    "grupos": result
                }

                return res.json(response);

            }).catch((erro) => {

                let response = {
                    "status": "Error",
                    "message": erro
                }

                return res.json(response);
            });


    } else {
        let response = {
            "status": "Error",
            "message": "Not found"
        }

        return res.json(response);
    }

})

app.get('/list/group-members/:sessionName/:idGrupo', (req, res) => {

    console.log("\n\nListando Membros do grupo");

    if (clientsArray[req.params.sessionName]) {

        clientsArray[req.params.sessionName].getGroupMembers(req.params.idGrupo)
            .then((result) => {
                console.log("Membros listados");

                let response = {
                    "status": "OK",
                    "membros": result
                }

                return res.json(response);

            }).catch((erro) => {

                let response = {
                    "status": "Error",
                    "message": erro
                }

                return res.json(response);
            });


    } else {
        let response = {
            "status": "Error",
            "message": "Not found"
        }

        return res.json(response);
    }

})


app.get('/cloud/resources/get/:sessionName', (req, res) => {

    cloudinary.config({
        cloud_name: "gerardoneto",
        api_key: "997166293489434",
        api_secret: "iH6gkuuUOTFFKEj_2JHXdUEGM20",
        secure: true
    });

    cloudinary.v2.search.expression('session-' + req.params.sessionName).execute().then((result) => {
        let response = {
            result
        };

        res.json(response);
    });
})



//MÉTODOS DO FUNIL
//ID DA SESSÃO, TELEFONE, ID DO FUNIL
app.get('/funil/cadastrar/:apiId/:number/:idFunil', (req, res) => {

    let numero = req.params.number;

    //ENCERRANDO FUNIS ANTERIORES NA MESMA SESSÃO
    let query = "UPDATE cliente_funil SET concluido = 1 WHERE id_sessao = " + req.params.apiId + " AND numero = '" + req.params.number + "'";

    connection.query(query, function (error, results, fields) {
    })

    //CADASTRANDO CLIENTE NO FUNIL
    query = "SELECT * FROM mensagens_funil WHERE id_funil = " + req.params.idFunil;

    connection.query(query, function (error, results, fields) {

        console.log("Cadastrando " + numero + " no funil " + req.params.idFunil);

        if (error) {
            console.log(error);

            let response = {
                "status": "Error",
                "message": "Session name not found"
            }

            return res.json(response);
        }

        if (results.length > 0) {

            let primeira_mensagem = results[0];

            //CADASTRANDO CLIENTE NO FUNIL
            query = "INSERT INTO cliente_funil(numero, tag, id_funil, id_sessao) VALUES ('" + numero + "', '" + primeira_mensagem.tag + "', " + req.params.idFunil + ", " + req.params.apiId + ")";

            connection.query(query, function (error, results, fields) {

                enviarMensagemFunil(clientsArray[req.params.apiId], numero, results.insertId, primeira_mensagem.tag);

                //sendText(clientsArray[req.params.apiId], req.params.number + "@c.us", primeira_mensagem.texto);

                let response = {
                    "status": "OK",
                    "message": "Número cadastrado"
                }

                return res.json(response);


            });
        } else {
            let response = {
                "status": "ERRO",
                "message": "Funil sem mensagens"
            }

            return res.json(response);
        }

    });
})

async function analisarClienteFunil(wpp_client, numero, id_sessao, mensagem_recebida) {

    console.log("Analisando cliente no funil");

    //BUSCANDO O STATUS DO CLIENTE NO FUNIL
    var query = "SELECT * FROM cliente_funil WHERE numero = '" + numero + "' AND id_sessao =  " + id_sessao + " AND concluido = 0 ;";

    connection.query(query, function (error, results, fields) {

        if (error) {
            console.log(error);
        }

        if (results.length > 0) {

            let cliente_funil = results[0];

            console.log("cliente_funil encontrado Tag - " + cliente_funil.tag);

            //BUSCANDO A MENSAGEM DO PASSO ATUAL
            query = "SELECT * FROM mensagens_funil WHERE tag = '" + cliente_funil.tag + "' ;";

            connection.query(query, function (error, results, fields) {
                if (error) {
                    console.log(error);
                }

                if (results.length > 0) {

                    console.log("mensagens_funil encontrada");

                    let mensagem_atual = results[0];

                    //ANALISANDO RESPOSTA DO USUÁRIO
                    let array_respostas = JSON.parse(mensagem_atual.resposta_esperada);

                    let corresponde = false;

                    let respostaDefault = null;

                    if (mensagem_recebida) {
                        //PERCORRENDO TODAS AS RESPOSTAS POSSÍVEIS AGUARDADAS
                        //BUSCANDO UM MATCH PERFEITO
                        for (let i = 0; i < array_respostas.length; i++) {

                            //REMOVENDO ACENTOS E DEIXANDO MINÚSCULO
                            mensagem_recebida = normalizeString(mensagem_recebida);

                            //VERIFICANDO SE EXISTE UMA RESPOSTA ESPERADA DEFAULT (*)
                            if (array_respostas[i].resposta_esperada == "*") {
                                respostaDefault = array_respostas[i];
                            }

                            //VERIFICANDO SE A RESPOSTA DO USUÁRIO CORRESPONDE À RESPOSTA ESPERADA
                            if (mensagem_recebida == normalizeString(array_respostas[i].resposta_esperada)) {

                                //NESSE MOMENTO: ARMAZENAR RESPOSTA DO USUÁRIO E PASSAR PARA O PROXIMO PASSO DO FUNIL
                                corresponde = true;

                                let proxima_tag = mensagem_atual.proxima_tag;

                                if (array_respostas[i].proxima_tag) {
                                    proxima_tag = array_respostas[i].proxima_tag;
                                }

                                //VERIFICANDO SE É PRECISO ENVIAR UMA RESPOSTA ANTES DE PASSAR PARA PROXIMA ETAPA
                                if (array_respostas[i].resposta != "-") {
                                    passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, array_respostas[i], array_respostas[i].resposta, true, array_respostas[i].encerrar_funil, proxima_tag);
                                } else {
                                    passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, array_respostas[i], null, true, array_respostas[i].encerrar_funil, proxima_tag);
                                }

                            }

                        }

                        //CASO NÃO TENHA ENCONTRADO UM MATCH PERFEITO
                        if (!corresponde) {

                            //CASO EXISTA UMA RESPOSTA ESPERADA DEFAULT (*)
                            if (respostaDefault != null) {

                                //ENVIAR RESPOSTA ESPERADA DEFAULT E PASSAR USUARIO PARA PROXIMA ETAPA
                                if (respostaDefault.resposta != "-") {
                                    passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, mensagem_recebida, respostaDefault.resposta, true, respostaDefault.encerrar_funil, respostaDefault.proxima_tag);
                                } else {
                                    //CASO O VALOR DA RESPOSTA SEJA (-) APENAS PASSAR O USUÁRIO PARA PROXIMA ETAPA
                                    passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, mensagem_recebida, null, true, respostaDefault.encerrar_funil, respostaDefault.proxima_tag);
                                }
                            } else {

                                if (cliente_funil.num_tentativas < cliente_funil.max_tentativas) {
                                    //ATUALIZANDO CONTAGEM DE TENTATIVAS PARA A REPETIR A MENSAGEM PADRÃO
                                    atualizarTotalTentativas(cliente_funil);

                                    //CASO NÃO EXISTA RESPOSTADEFAULT, ENVIAR A RESPOSTA PADRÃO
                                    //E NÃO PASSAR USUÁRIO PARA PROXIMA ETAPA
                                    passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, mensagem_recebida, mensagem_atual.resposta_padrao, false, false, null);

                                }
                            }
                        }
                    } else {
                        passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, mensagem_recebida, mensagem_atual.resposta_padrao, false, false, null);
                    }

                } else {
                    console.log("Mensagem não encontrada");
                }
            });

            //INFORMANDO QUE O CLIENTE ESTÁ EM UM FUNIL
            return true;
        } else {

            console.log("Cliente não está em nenhum funil");

            //CASO O CLIENTE NÃO ESTEJA EM NENHUM FUNIL
            return false
        }
    });
}

function atualizarTotalTentativas(cliente_funil) {
    let query = "UPDATE cliente_funil SET num_tentativas = num_tentativas + 1 WHERE id = " + cliente_funil.id;

    connection.query(query, function (error, results, fields) {

    });
}

async function enviarContatoNoGrupo(client, telefone, grupo) {

    console.log("Enviando v-card NO GRUPO");

    client.sendContactVcard(grupo, telefone + "@c.us")
        .then((result) => {
            console.log("VCard enviado");
            console.log(result);
        }).catch((erro) => {
            console.error('Error when sending: ', erro);
        });

    let url = "https://wa.me/" + telefone;

    //SOMENTE SANTAREM
    if (grupo == "558499506625-1630700319@g.us") {

        //Numero da UNIDADE SANTAREM que vai receber as msg's
        let contatoSantarem = "559391052269";

        client.sendLinkPreview(contatoSantarem + "@c.us", url, "Está interessado 👆")
            .then((result) => {
                console.log("VCard enviado");
                console.log(result);
            }).catch((erro) => {
                console.error('Error when sending: ', erro);
            });
    } else if (grupo == "558499506625-1630699383@g.us") {

        //Numero da UNIDADE BELEM que vai receber as msg's
        let contatoBelem = "559196021111";

        client.sendLinkPreview(contatoBelem + "@c.us", url, "Está interessado 👆")
            .then((result) => {
                console.log("VCard enviado");
                console.log(result);
            }).catch((erro) => {
                console.error('Error when sending: ', erro);
            });
    }

}

async function bloquearContato(client, telefone) {

    console.log("BLOQUEANDO CONTATO");

    client.blockContact(telefone + "@c.us")
        .then((result) => {
            console.log("Contato bloqueado");
            console.log(result);
        }).catch((erro) => {
            console.error('Error when sending: ', erro);
        });
}

async function passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, json_resposta, resposta_para_enviar, passar_para_proxima_etapa, encerrar_funil, proxima_tag) {

    //ENVIANDO RESPOSTA PARA O CLIENTE
    if (resposta_para_enviar != null) {
        await sendText(wpp_client, cliente_funil.numero + "@c.us", resposta_para_enviar);
    }

    //VERIFICANDO SE ALGUMA AÇÃO DEVE SER EXECUTADA
    if (passar_para_proxima_etapa && json_resposta) {

        //VERIFICANDO SE A AÇÃO É ADICIONAR A UM GRUPO
        if (json_resposta.add_grupo && json_resposta.add_grupo != "") {
            enviarContatoNoGrupo(wpp_client, cliente_funil.numero, json_resposta.add_grupo);
        }

        //VERIFICANDO SE A AÇÃO É BLOQUEAR
        if (json_resposta.bloquear && json_resposta.bloquear == true) {
            bloquearContato(wpp_client, cliente_funil.numero);
        }

    }

    console.log("Encerrar?");
    console.log(encerrar_funil);
    console.log(json_resposta);

    if (encerrar_funil) {

        //VERIFICANDO PROXIMA TAG PARA BLOQUEAR O CONTATO
        if (proxima_tag == "t&t-#msg1" || proxima_tag == "t&t-belem-#msg1") {
            bloquearContato(wpp_client, cliente_funil.numero);
        }

        //VERIFICANDO PROXIMA TAG PARA ADICIONAR NO GRUPO BELEM
        if (proxima_tag == "t&t-belem-#msg2") {
            enviarContatoNoGrupo(wpp_client, cliente_funil.numero, "558499506625-1631536359@g.us");
        }

        //VERIFICANDO PROXIMA TAG PARA ADICIONAR NO GRUPO CPotiguar
        if (proxima_tag == "pesquisa-cpotiguar-#msg2") {
            enviarContatoNoGrupo(wpp_client, cliente_funil.numero, "558499506625-1633123730@g.us");
        }

        //VERIFICANDO PROXIMA TAG PARA ADICIONAR NO GRUPO O Doutor
        if (proxima_tag == "pesquisa-odoutor-#msg2") {
            enviarContatoNoGrupo(wpp_client, cliente_funil.numero, "558499506625-1633123606@g.us");
        }

        //ENCERRANDO FUNIL
        let query = "UPDATE cliente_funil SET tag = '" + proxima_tag + "', concluido = 1 WHERE id = " + cliente_funil.id + " ;";

        console.log(query);

        connection.query(query, function (error, results, fields) {

            if (error) {
                console.log(error);
            } else {
                console.log("Funil encerrado");
            }

        });
    } else {
        //PASSANDO USUÁRIO PARA PROXIMA ETAPA
        if (passar_para_proxima_etapa) {

            //VERIFICANDO SE A MENSAGEM ATUAL É A ÚLTIMA DO FUNIL
            if (mensagem_atual.fim_funil == 1) {

                let query = "UPDATE cliente_funil SET concluido = 1 ;";

                connection.query(query, function (error, results, fields) {

                });
            } else {
                enviarMensagemFunil(wpp_client, cliente_funil.numero, cliente_funil.id, proxima_tag);
            }
        }
    }
}

async function enviarMensagemFunil(wpp_client, numero_cliente_funil, id_cliente_funil, proxima_tag) {

    let query = "UPDATE cliente_funil SET tag = '" + proxima_tag + "' WHERE id = " + id_cliente_funil + " ;";

    connection.query(query, function (error, results, fields) {

        //BUSCANDO MENSAGEM DA PROXIMA ETAPA
        query = "SELECT * FROM mensagens_funil WHERE tag = '" + proxima_tag + "' ;";

        connection.query(query, function (error, results, fields) {
            if (error) {
                console.log(error);
            }

            console.log("\n\nVerificando tag");
            console.log("tag: " + proxima_tag);

            if (results.length > 0) {

                //ENVIANDO MENSAGEM DA PROXIMA ETAPA
                if (results[0].tipo_media == 'imagem') {
                    sendImage(wpp_client, numero_cliente_funil + "@c.us", results[0].texto, results[0].url_media);
                } else if (results[0].tipo_media == 'video') {
                    sendVideo(wpp_client, numero_cliente_funil + "@c.us", results[0].texto, results[0].url_media);
                } else if (results[0].tipo_media == 'voz') {
                    sendVoice(wpp_client, numero_cliente_funil + "@c.us", results[0].texto, results[0].url_media);
                } else {
                    sendText(wpp_client, numero_cliente_funil + "@c.us", results[0].texto);
                }

                //VERIFICANDO SE É A ÚLTIMA MENSAGEM DO FUNIL
                if (results[0].fim_funil == 1) {

                    //ENCERRANDO FUNIL
                    let query = "UPDATE cliente_funil SET concluido = 1 WHERE id = " + id_cliente_funil + " ;";

                    connection.query(query, function (error, results, fields) {

                    });
                } else {
                    //VERIFICANDO SE A MENSAGEM AGUARDA UMA RESPOSTA
                    //CASO NÃO AGUARDE, ENVIA A PRÓXIMA MENSAGEM EM SEGUIDA
                    if (results[0].aguardar_resposta == 0) {

                        //TEMPO ANTES DE ENVIAR A PROXIMA MENSAGEM (EM SEGUNDOS)
                        let tempo_de_espera = 10;

                        if (results[0].dif_minutos) {
                            tempo_de_espera = results[0].diff_minutos;
                        }

                        console.log("\n\n\nAGUARDANDO " + tempo_de_espera);

                        setTimeout(function () {
                            enviarMensagemFunil(wpp_client, numero_cliente_funil, id_cliente_funil, results[0].proxima_tag);
                        }, tempo_de_espera * 1000)
                    }
                }

            }

        });
    });
}

async function sendText(client, number, text) {

    await client
        .sendText(number, text)
        .then((result) => {
            console.log(result);
            return true;
        })
        .catch((erro) => {
            console.log(erro);
            return false;
        });
}

async function sendVideo(client, number, text, url) {

    await client
        .sendFile(number, url, "video.mp4", text)
        .then((result) => {
            return true;
        })
        .catch((erro) => {
            return false;
        });
}

async function sendImage(client, number, text, url) {

    await client
        .sendImage(number, url, "image", text)
        .then((result) => {
            return true;
        })
        .catch((erro) => {
            return false;
        });
}

async function sendVoice(client, number, text, url) {

    await client
        .sendPtt(number, url, "audio.mp3", text)
        .then((result) => {
            return true;
        })
        .catch((erro) => {
            return false;
        });
}

function normalizeString(string) {
    return string.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase()
}



app.get('/enviar_no_grupo', (req, res) => {

    let query = "SELECT * FROM cliente_funil WHERE tag = 't&t-#msg7' OR tag = 't&t-#msg8';";

    connection.query(query, function (error, results, fields) {

        for (let i = 0; i < results.length; i++) {

            enviarContatoNoGrupo(clientsArray[26], results[i].numero, "558499506625-1630700319@g.us");

        }

        let rs = {
            "status": "OK"
        }

        return res.json(rs);
    });

})



var clients = {};

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
    console.log('listening on port 3333');
});