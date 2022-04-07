const mysql = require("mysql2");
const axios = require('axios').default;
const dateFormat = require('dateformat');

//PRODUCTION
//let host = "localhost";

//LOCAL
let host = "161.97.66.117";

const api_endpoint = "http://localhost:3333";

var connection = mysql.createConnection({
    host: host,
    user: "adminbd",
    password: "OceancWgKm8HE",
    database: "agendamentos",
    charset: 'utf8mb4',
    port: 3306
});

exports.receiveMessage = function (message, session) {

    let client = session;

    let phone = message.from.split("@");

    if (message.body == "#") {

        let numero = phone[0];
        let id_funil = 1;

        //ENCERRANDO FUNIS ANTERIORES NA MESMA SESSÃO
        let query = "UPDATE cliente_funil SET concluido = 1 WHERE id_sessao = " + session + " AND numero = '" + numero + "'";

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
                query = "INSERT INTO cliente_funil(numero, tag, id_funil, id_sessao) VALUES ('" + numero + "', '" + primeira_mensagem.tag + "', " + id_funil + ", " + session + ")";

                console.log(query);

                connection.query(query, function (error, results, fields) {

                    enviarMensagemFunil(client, numero, results.insertId, primeira_mensagem.tag);

                });
            } else {
                console.log("Funil sem mensagens");
            }

        });

    } else {
        analisarClienteFunil(client, phone[0], session, message.body);
    }

};

async function analisarClienteFunil(wpp_client, numero, id_sessao, mensagem_recebida) {

    console.log("Analisando cliente no funil");

    //BUSCANDO O STATUS DO CLIENTE NO FUNIL
    var query = "SELECT * FROM cliente_funil WHERE numero = '" + numero + "' AND id_sessao =  " + id_sessao + " AND concluido = 0 ;";

    console.log(query);

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

                    if (mensagem_atual.tag == "agendamento-consulta-#mg1" || mensagem_atual.tag == "agendamento-consulta-#mg2" || mensagem_atual.tag == "agendamento-consulta-#mg3" || mensagem_atual.tag == "agendamento-consulta-#mg4") {
                        validateWithFullfilment(wpp_client, cliente_funil, mensagem_atual, mensagem_recebida);
                    } else {
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
                                        passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, array_respostas[i], array_respostas[i].resposta, true, array_respostas[i].encerrar_funil, proxima_tag, mensagem_recebida);
                                    } else {
                                        passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, array_respostas[i], null, true, array_respostas[i].encerrar_funil, proxima_tag, mensagem_recebida);
                                    }

                                }

                            }

                            //CASO NÃO TENHA ENCONTRADO UM MATCH PERFEITO
                            if (!corresponde) {

                                //CASO EXISTA UMA RESPOSTA ESPERADA DEFAULT (*)
                                if (respostaDefault != null) {

                                    //ENVIAR RESPOSTA ESPERADA DEFAULT E PASSAR USUARIO PARA PROXIMA ETAPA
                                    if (respostaDefault.resposta != "-") {
                                        passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, null, respostaDefault.resposta, true, respostaDefault.encerrar_funil, respostaDefault.proxima_tag, mensagem_recebida);
                                    } else {
                                        //CASO O VALOR DA RESPOSTA SEJA (-) APENAS PASSAR O USUÁRIO PARA PROXIMA ETAPA
                                        passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, null, null, true, respostaDefault.encerrar_funil, respostaDefault.proxima_tag, mensagem_recebida);
                                    }
                                } else {

                                    if (cliente_funil.num_tentativas < cliente_funil.max_tentativas) {
                                        //ATUALIZANDO CONTAGEM DE TENTATIVAS PARA A REPETIR A MENSAGEM PADRÃO
                                        atualizarTotalTentativas(cliente_funil);

                                        //CASO NÃO EXISTA RESPOSTADEFAULT, ENVIAR A RESPOSTA PADRÃO
                                        //E NÃO PASSAR USUÁRIO PARA PROXIMA ETAPA
                                        passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, null, mensagem_atual.resposta_padrao, false, false, null, mensagem_recebida);

                                    }
                                }
                            }
                        } else {
                            passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, null, mensagem_atual.resposta_padrao, false, false, null, mensagem_recebida);
                        }
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

async function passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, json_resposta, resposta_para_enviar, passar_para_proxima_etapa, encerrar_funil, proxima_tag, mensagem_recebida) {

    //VERIFICANDO SE PRECISA SALVAR ALGUM DADO ANTES DE PASSAR O CLIENTE PARA PROXIMA ETAPA
    if (passar_para_proxima_etapa) {
        if (mensagem_atual.save_data && mensagem_atual.save_data != "") {

            let meta_dados = JSON.parse(cliente_funil.meta_dados);

            if (!meta_dados) {
                meta_dados = {}
            }

            meta_dados[mensagem_atual.save_data] = mensagem_recebida;

            //ENCERRANDO FUNIL
            let query = "UPDATE cliente_funil SET meta_dados = '" + JSON.stringify(meta_dados) + "' WHERE id = " + cliente_funil.id + " ;";

            console.log(query);

            connection.query(query, function (error, results, fields) {

                if (error) {
                    console.log("Erro ao atualizar dados!");
                    console.log(error);
                } else {
                    console.log("Dados atualizados!");
                }

            });

        }
    }

    console.log("Enviar??? " + resposta_para_enviar);

    //ENVIANDO RESPOSTA PARA O CLIENTE
    if (resposta_para_enviar != null) {
        sendText(wpp_client, cliente_funil.numero + "@c.us", resposta_para_enviar);
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
                enviarMensagemFunil(wpp_client, cliente_funil.numero, cliente_funil.id, proxima_tag, cliente_funil);
            }
        }
    }
}

async function enviarMensagemFunil(wpp_client, numero_cliente_funil, id_cliente_funil, proxima_tag, cliente_funil) {

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

                getMessageFullfilment(results[0], cliente_funil, (mensagem, encerrar_funil) => {

                    //ENVIANDO MENSAGEM DA PROXIMA ETAPA
                    if (results[0].tipo_media == 'imagem') {
                        sendImage(wpp_client, numero_cliente_funil + "@c.us", mensagem, results[0].url_media);
                    } else if (results[0].tipo_media == 'video') {
                        sendVideo(wpp_client, numero_cliente_funil + "@c.us", mensagem, results[0].url_media);
                    } else if (results[0].tipo_media == 'voz') {
                        sendVoice(wpp_client, numero_cliente_funil + "@c.us", mensagem, results[0].url_media);
                    } else {
                        sendText(wpp_client, numero_cliente_funil + "@c.us", mensagem);
                    }

                    //VERIFICANDO SE É A ÚLTIMA MENSAGEM DO FUNIL
                    if (results[0].fim_funil == 1 || encerrar_funil) {

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
                                enviarMensagemFunil(wpp_client, numero_cliente_funil, id_cliente_funil, results[0].proxima_tag, cliente_funil);
                            }, tempo_de_espera * 1000)
                        }
                    }
                });
            }
        });
    });
}

function atualizarTotalTentativas(cliente_funil) {
    let query = "UPDATE cliente_funil SET num_tentativas = num_tentativas + 1 WHERE id = " + cliente_funil.id;

    connection.query(query, function (error, results, fields) {

    });
}

async function getMessageFullfilment(mensagem_funil, cliente_funil, callback) {

    if (cliente_funil) {
        console.log("CLIENTE NÃO NULO!");
        console.log(cliente_funil);
    } else {
        console.log("CLIENTE NULO!");
    }

    if (mensagem_funil.tag == "agendamento-consulta-#mg1") {
        getMedicos((response) => {

            salvarRespostasEsperadas(cliente_funil, response.respostas_esperadas)

            //SALVAR RESPOSTAS ESPERADAS NO CLIENTE_FUNIL
            callback(response.mensagem, response.encerrar_funil);
        });
    } else if (mensagem_funil.tag == "agendamento-consulta-#mg2") {
        getCidades((response) => {
            salvarRespostasEsperadas(cliente_funil, response.respostas_esperadas)

            //SALVAR RESPOSTAS ESPERADAS NO CLIENTE_FUNIL
            callback(response.mensagem, response.encerrar_funil);
        });


    } else if (mensagem_funil.tag == "agendamento-consulta-#mg3") {
        getClinicas(cliente_funil, (response) => {
            salvarRespostasEsperadas(cliente_funil, response.respostas_esperadas)

            //SALVAR RESPOSTAS ESPERADAS NO CLIENTE_FUNIL
            callback(response.mensagem, response.encerrar_funil);
        });

    } else if (mensagem_funil.tag == "agendamento-consulta-#mg4") {
        confirmAgendamento(cliente_funil, (response) => {
            salvarRespostasEsperadas(cliente_funil, response.respostas_esperadas)

            //SALVAR RESPOSTAS ESPERADAS NO CLIENTE_FUNIL
            callback(response.mensagem, response.encerrar_funil);
        });

    } else if (mensagem_funil.tag == "confirmar-consulta-#mg1") {
        storeAgendamento(cliente_funil, (response) => {
            salvarRespostasEsperadas(cliente_funil, response.respostas_esperadas)

            //SALVAR RESPOSTAS ESPERADAS NO CLIENTE_FUNIL
            callback(response.mensagem, response.encerrar_funil);
        });

    } else {
        if (cliente_funil) {
            formatMessage(mensagem_funil.texto, cliente_funil, (mensagem) => {
                callback(mensagem);
            });
        } else {
            callback(mensagem_funil.texto);
        }
    }
}

function getUpdatedClient(cliente_funil, callback) {
    var query = "SELECT * FROM cliente_funil WHERE id = " + cliente_funil.id;

    console.log(query);

    connection.query(query, function (error, results, fields) {
        if (error) {
            callback(null);
        } else {
            callback(results[0]);
        }
    });
}

function salvarRespostasEsperadas(cliente_funil, respostas) {

    let query = "UPDATE cliente_funil SET fullfilment_responses = '" + JSON.stringify(respostas) + "' WHERE id = " + cliente_funil.id + " ;";

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            console.log("Erro ao atualizar fullfilment_responses!");
            console.log(error);
        } else {
            console.log("Fullfilment_responses atualizados!");
        }

    });
}

async function getClienteFunil(id, callback) {

    //ENCERRANDO FUNIL
    let query = "SELECT * FROM cliente_funil WHERE id = " + id;

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            console.log(error);
        } else {
            callback(results[0]);
        }

    });
}

async function getMedicos(callback) {

    let mensagem = "*Qual médico você precisa?*\n\n";

    //ENCERRANDO FUNIL
    let query = "SELECT * FROM especialidades;";

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            console.log(error);
        } else {

            let options = []

            for (let i = 0; i < results.length; i++) {

                let option = {
                    resposta_esperada: i + 1,
                    valor: results[i].id,
                    proxima_tag: "agendamento-consulta-#mg2"
                }

                console.log("Opt");
                console.log(option);

                options.push(option);

                mensagem = mensagem + "*" + (i + 1) + "* - " + results[i].nome + "\n"
            }

            let response = {
                mensagem: mensagem,
                respostas_esperadas: options
            }

            console.log("Response get medicos");
            console.log(response);

            callback(response);

        }

    });
}

async function getClinicas(cliente_funil, callback) {

    getUpdatedClient(cliente_funil, (cliente) => {

        cliente_funil = cliente;

        let mensagem = "*Escolha a clínica:*\n\n";

        let dados = JSON.parse(cliente_funil.meta_dados);

        console.log("DADOS DO CLIENTE");
        console.log(dados);

        //ENCERRANDO FUNIL
        let query = "SELECT a.id AS id_agenda, a.data, a.tipo_atendimento, m.nome AS nome_medico, m.valor_consulta, m.valor_com_desconto, c.nome AS nome_clinica FROM agendas a " +
            "INNER JOIN medicos m ON m.id = a.medico_id " +
            "INNER JOIN clinicas c ON a.clinica_id = c.id " +
            "WHERE m.especialidade_id = " + dados.tipo_consulta +
            " AND a.data >= DATE_ADD(NOW(), INTERVAL 2 HOUR)" +
            " AND a.vagas > 0" +
            " AND c.cidade = '" + dados.cidade + "'" +
            " ORDER BY a.data LIMIT 5;"

        console.log(query);

        connection.query(query, function (error, results, fields) {

            if (error) {
                console.log(error);
            } else {

                let options = []

                for (let i = 0; i < results.length; i++) {

                    let option = {
                        resposta_esperada: i + 1,
                        valor: results[i].id_agenda,
                        proxima_tag: "agendamento-consulta-#mg4"
                    }

                    console.log("Opt");
                    console.log(option);

                    options.push(option);

                    let data = dateFormat(results[i].data, "dd/mm");
                    let hora = dateFormat(results[i].data, "HH:MM");

                    mensagem = mensagem + "*" + (i + 1) + "- " + results[i].nome_clinica + "*" +
                        "\nData: " + data +
                        "\nHorário: " + hora +
                        "\nMédico: " + results[i].nome_medico +
                        "\nAtendimento: " + results[i].tipo_atendimento +
                        "\nValor da consulta: ~R$" + results[i].valor_consulta + "~  R$" + results[i].valor_com_desconto

                    if (i + 1 < results.length) {
                        mensagem = mensagem + "\n---------------\n\n"
                    }

                    console.log(mensagem);
                }

                let encerrar_funil = false;

                if (results.length == 0) {
                    mensagem = "Não temos nenhum médico *na sua cidade*\npara *essa especialidade* ainda."
                    encerrar_funil = true;
                }

                let response = {
                    mensagem: mensagem,
                    respostas_esperadas: options,
                    encerrar_funil: encerrar_funil
                }

                console.log("Response get medicos");
                console.log(response);

                callback(response);

            }

        });
    });

}

async function confirmAgendamento(cliente_funil, callback) {

    getUpdatedClient(cliente_funil, (cliente) => {

        cliente_funil = cliente;

        let mensagem = "*Dados da sua consulta:*\n\n";

        let dados = JSON.parse(cliente_funil.meta_dados);

        console.log("DADOS DO CLIENTE");
        console.log(dados);

        //ENCERRANDO FUNIL
        let query = "SELECT a.id, a.data, a.tipo_atendimento, m.nome AS nome_medico, m.id AS medico_id, m.valor_consulta, m.valor_com_desconto, c.nome AS nome_clinica, e.nome AS especialidade FROM agendas a " +
            "INNER JOIN medicos m ON m.id = a.medico_id " +
            "INNER JOIN clinicas c ON a.clinica_id = c.id " +
            "INNER JOIN especialidades e ON e.id = m.especialidade_id " +
            "WHERE a.id =" + dados.agenda;

        console.log(query);

        connection.query(query, function (error, results, fields) {

            if (error) {
                console.log(error);
            } else {

                let options = []

                let option1 = {
                    resposta_esperada: "1",
                    valor: "1",
                    proxima_tag: "confirmar-consulta-#mg1",
                    encerrar_funil: false
                }

                let option2 = {
                    resposta_esperada: "2",
                    valor: "2",
                    proxima_tag: "atendimento-#mg1",
                    encerrar_funil: true
                }

                options.push(option1);
                options.push(option2);

                for (let i = 0; i < results.length; i++) {

                    let data = dateFormat(results[i].data, "dd/mm");
                    let hora = dateFormat(results[i].data, "HH:MM");

                    mensagem = mensagem + "*Clinica:* " + results[i].nome_clinica +
                        "\n*Data:* " + data +
                        "\n*Horário:* " + hora +
                        "\n*Médico:* " + results[i].nome_medico +
                        "\n*Especialidade:* " + results[i].especialidade +
                        "\n*Atendimento:* " + results[i].tipo_atendimento +
                        "\n*Valor da consulta:* ~R$" + results[i].valor_consulta + "~  R$" + results[i].valor_com_desconto +
                        "\n\n*1-* Confirmar\n*2-* Cancelar";

                }

                let response = {
                    mensagem: mensagem,
                    respostas_esperadas: options
                }

                console.log("Response get medicos");
                console.log(response);

                callback(response);

            }

        });
    });

}

async function storeAgendamento(cliente_funil, callback) {

    getUpdatedClient(cliente_funil, (cliente) => {

        cliente_funil = cliente;

        let mensagem = "Consulta agendada! ✅\n\nSua consulta será confirmada assim que o pagamento for efetuado pelo link: https://linkdepagamento.com.br/";

        let dados = JSON.parse(cliente_funil.meta_dados);

        console.log("DADOS DO CLIENTE");
        console.log(dados);

        //ENCERRANDO FUNIL
        let query = "SELECT a.id, a.data, a.tipo_atendimento, m.nome AS nome_medico, m.id AS medico_id, m.valor_consulta, m.valor_com_desconto, c.nome AS nome_clinica, e.nome AS especialidade FROM agendas a " +
            "INNER JOIN medicos m ON m.id = a.medico_id " +
            "INNER JOIN clinicas c ON a.clinica_id = c.id " +
            "INNER JOIN especialidades e ON e.id = m.especialidade_id " +
            "WHERE a.id =" + dados.agenda;

        console.log(query);

        connection.query(query, function (error, results, fields) {

            if (error) {
                console.log(error);
            } else {

                let options = []

                let option1 = {
                    resposta_esperada: "1",
                    valor: "1",
                    proxima_tag: "confirmar-consulta-#mg1",
                    encerrar_funil: true
                }

                options.push(option1);

                //GRAVANDO CONSULTA NO BANCO
                store(dados.nome_paciente, dados.agenda, results[0].valor_com_desconto);

                let response = {
                    mensagem: mensagem,
                    respostas_esperadas: options
                }

                console.log("Response get medicos");
                console.log(response);

                callback(response);

            }

        });
    });

}

function store(nome, agenda, valor) {

    let data = new Date();

    data = dateFormat(data, "yyyy/mm/dd HH:MM:ss");

    //ENCERRANDO FUNIL
    let query = "INSERT INTO agendamentos (nome_paciente, valor, agenda_id, created_at)" +
        "VALUES ('" + nome + "', '" + valor + "', '" + agenda + "', '" + data + "')";

    console.log(query);

    connection.query(query, function (error, results, fields) {
        if (error) {
            console.log("\n\n\nERRO AO SALVAR AGENDAMENTO");
            console.log(error);
        } else {

            query = "UPDATE agendas SET vagas = (vagas - 1) WHERE id = " + agenda;
            connection.query(query, function (error, results, fields) {
                if (error) {
                    console.log("\n\n\nERRO AO ATUALIZAR VAGAS");
                    console.log(error);
                }
            });
        }
    });
}

async function getCidades(callback) {

    let mensagem = "*Qual a sua cidade?*\n\n";

    //CRIAR ARRAY DE OPTIONSSSSS

    //ENCERRANDO FUNIL
    let query = "SELECT DISTINCT(cidade) FROM clinicas;";

    console.log(query);

    connection.query(query, function (error, results, fields) {

        if (error) {
            console.log(error);
        } else {

            let options = []

            for (let i = 0; i < results.length; i++) {

                let option = {
                    resposta_esperada: i + 1,
                    valor: results[i].cidade,
                    proxima_tag: "agendamento-consulta-#mg3"
                }

                console.log("Opt");
                console.log(option);

                options.push(option);

                mensagem = mensagem + "*" + (i + 1) + "* - " + results[i].cidade + "\n"
            }

            let response = {
                mensagem: mensagem,
                respostas_esperadas: options
            }

            console.log("Response get medicos");
            console.log(response);

            callback(response);

        }

    });
}

async function sendText(client, number, text) {

    let data = {
        apiId: client,
        number: number,
        text: text
    }

    console.log("Enviando texto");
    console.log(text);

    //SEND TEXT
    axios.post(api_endpoint + `/send/text`, data)
        .then((response) => {
            console.log("Resposta enviada!");
            return true;
        }).catch((erro) => {
            console.log(erro);
            return false;
        });
}

function formatMessage(text, cliente_funil, callback) {

    getClienteFunil(cliente_funil.id, (cliente) => {

        cliente_funil = cliente;

        let arrayTags = localizar_tags(text);

        console.log("TAGS ENCONTRADAS");
        console.log(arrayTags);

        //VERIFICANDO SE O TEXTO POSSUI ALGUMA TAG
        if (arrayTags && arrayTags.length > 0) {

            console.log("Metadados");
            console.log(cliente_funil.meta_dados);
            console.log("\n\n");

            //BUSCANDO OS DADOS A PARTIR DO NUMERO NO JSON META_DADOS DO ENVIO
            let json = JSON.parse(cliente_funil.meta_dados);

            //CASO ENCONTRE OS DADOS NO JSON
            if (json) {
                let mensagemFinal = text;

                for (var prop in json) {
                    //VERIFICANDO SE O TEXTO CONTEM UMA TAG COM A CHAVE DO JSON
                    if (text.includes("<" + prop + ">")) {
                        mensagemFinal = replaceAll(
                            mensagemFinal,
                            "<" + prop + ">",
                            json[prop]
                        );
                    }
                }

                console.log(mensagemFinal);

                callback(mensagemFinal);
            }
        } else {
            callback(text);
        }
    });
}

function localizar_tags(texto) {
    var emails = new Array();
    let i = 0;

    while (texto.search("<") != -1) {
        let pos_inicio = texto.search("<");
        let pos_fim = texto.search(">");

        let email = texto.substring(pos_inicio + 1, pos_fim);
        emails[i] = email;

        texto = texto.substring(pos_fim + 1, texto.length);
        i++;
    }

    return emails;
}

function normalizeString(string) {
    return string.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function validateWithFullfilment(wpp_client, cliente_funil, mensagem_atual, mensagem_recebida) {

    console.log("Validando com fullfilment!");

    if (mensagem_atual.tag == "agendamento-consulta-#mg1" || mensagem_atual.tag == "agendamento-consulta-#mg2" || mensagem_atual.tag == "agendamento-consulta-#mg3" || mensagem_atual.tag == "agendamento-consulta-#mg4") {

        let array_respostas = JSON.parse(cliente_funil.fullfilment_responses);

        let resposta_match = {}

        let accepted = false;

        for (let i = 0; i < array_respostas.length; i++) {
            console.log("Comparando " + array_respostas[i].resposta_esperada + "    -    " + mensagem_recebida);

            if (mensagem_recebida == array_respostas[i].resposta_esperada) {
                accepted = true;
                resposta_match = array_respostas[i];
                break;
            }
        }

        if (accepted) {
            passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, resposta_match, null, true, resposta_match.encerrar_funil, resposta_match.proxima_tag, resposta_match.valor);
        } else {
            passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, null, mensagem_atual.resposta_padrao, false, false, null, mensagem_recebida);
        }
    }
    /*
    validateEspecialidade(mensagem_recebida, (accepted, value) => {
        if (accepted) {
 
            let i = 0;
 
            mensagem_recebida = value;
 
            let array_respostas = JSON.parse(mensagem_atual.resposta_esperada);
 
            passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, array_respostas[i], null, true, array_respostas[i].encerrar_funil, array_respostas[i].proxima_tag, mensagem_recebida);
 
        } else {
            passarClienteProximaEtapa(wpp_client, cliente_funil, mensagem_atual, null, mensagem_atual.resposta_padrao, false, false, null, mensagem_recebida);
        }
    });
    */

}

function replaceAll(string, search, replace) {
    return string.split(search).join(replace);
}

/*
async function sendVideo(client, number, text, url) {

    client
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

async function enviarContatoNoGrupo(client, telefone, grupo) {
    client.sendContactVcard(grupo, telefone + "@c.us")
        .then((result) => {
            console.log("VCard enviado");
            console.log(result);
        }).catch((erro) => {
            console.error('Error when sending: ', erro);
        });
}
*/