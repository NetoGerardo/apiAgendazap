const axios = require('axios').default;

let url_base = "http://138.118.141.151/clinicapotiguar/services"

const dateFormat = require('dateformat');

exports.registrarConsulta = function (meta_dados) {

    return new Promise(function (res, rej) {

        let dadosGMED = extrairDadosGMED(meta_dados.medico_data);

        let nome_paciente = encodeURI(meta_dados.nome_paciente);

        let url = url_base + "/gmService.asmx/salvarAgendaWebClin?idMedico=" + dadosGMED.id_medico + "&idUnidade=33588&idProcedimento=" + dadosGMED.id_procedimento + "&dataAgenda=" + dadosGMED.data + "&horaAgenda=00:00&codPaciente=0&nomePaciente=" + nome_paciente + "&telefone=" + meta_dados.whatsapp;

        console.log("AQUI ESTÁ A URL");
        console.log(url);

        var config = {
            method: "get",
            url: url,
            headers: {
                "authentication-token": "a28bb73c7133fecbd971733d6b7228a4",
            },
        };

        res("OK");

        axios(config)
            .then((response) => {

                console.log("RESPOSTA DO GESTOR");
                console.log(response.data);

                res(response.data);

            }).catch(function (error) {

                console.log(error);

                res(undefined);
            });

    });
};

function extrairDadosGMED(meta_dados) {

    let dados = meta_dados.split("_");

    let response = {
        valor_consulta: dados[0],
        medico: dados[1],
        id_medico: dados[2],
        data: dados[3],
        id_procedimento: dados[4],
    }

    return response;
}

exports.listarEspecialidades = function (clinica) {

    return new Promise(function (res, rej) {

        let url = "";

        //Clinica ECON
        if (clinica == 'econ') {
            url = url_base + `/gmService.asmx/especialidades?idUnidade=1`;
        }

        var config = {
            method: "get",
            url: url,
            headers: {
                "authentication-token": "a28bb73c7133fecbd971733d6b7228a4",
            },
        };

        axios(config)
            .then((response) => {

                console.log(response.data);

                res(response.data);

            }).catch(function (error) {

                console.log(error);

                res(undefined);
            });
    });
};

exports.listarMedicos = function (clinica, id_especialidade) {

    return new Promise(function (res, rej) {

        let url = "";

        //Clinica ECON
        if (clinica == 'econ') {
            url = url_base + '/gmService.asmx/medicos?idEspecialidade=' + id_especialidade;
        }

        console.log("BUSCANDO MEDICOSSS");
        console.log(url);

        var config = {
            method: "get",
            url: url,
            headers: {
                "authentication-token": "a28bb73c7133fecbd971733d6b7228a4",
            },
        };

        axios(config)
            .then((response) => {

                let medicos = response.data;

                buscarMedicosComAgenda(medicos).then(resultado => {
                    res(resultado);
                });


            }).catch(function (error) {

                console.log("ERRO AO LISTAR MÉDICOS");
                console.log(error);

                res(undefined);
            });
    });
}

function buscarMedicosComAgenda(medicos) {
    return new Promise(function (res, rej) {

        let mensagem = "*Escolha uma das opções:*\n\n";

        let options = []

        let i = 0;

        iniciarBuscar(0, medicos, options, mensagem, (resposta) => {
            console.log("Resposta");
            console.log(resposta);

            res(resposta);
        });

    });


}

function iniciarBuscar(indice, medicos, options, mensagem, callback) {

    buscarAgendaMedico(medicos[indice].id).then(agenda => {

        if (agenda) {
            console.log("BUSCANDO DIA DO MEDICO");
            console.log(agenda.DataGeral);

            let option = {
                resposta_esperada: indice + 1,
                valor: medicos[indice].Valor + "_" + medicos[indice].nome + "_" + medicos[indice].id + "_" + agenda.DataGeral + "_" + medicos[indice].IdProcedimentoPadrao,
                proxima_tag: "agendamento-consulta-#mg3"
            }

            console.log("Opt");
            console.log(option);

            options.push(option);

            mensagem = mensagem + "*" + (indice + 1) + "* - " + medicos[indice].nome + "\nData: " + agenda.DataGeral + "\nValor: R$" + medicos[indice].Valor + ",00"

            if (indice + 1 < medicos.length) {
                mensagem = mensagem + "\n---------------\n\n"
                iniciarBuscar(indice + 1, medicos, options, mensagem, callback)
            } else if (indice + 1 >= medicos.length) {

                let response = {
                    mensagem: mensagem,
                    options: options
                }

                callback(response);
            } else {

                //IMPLEMENTAR BUSCA DO PRÓXIMO MÊS

                let response = {
                    mensagem: "Desculpe, esse médico não possui horário disponíevl esse mês...",
                    options: options
                }

                callback(response);
            }
        }

    })
}

function buscarAgendaMedico(id_medico) {

    return new Promise(function (res, rej) {

        console.log("BUSCANDO AGENDA DO MÉDIDO " + id_medico);

        var config = {
            method: "get",
            url: url_base + '/gmService.asmx/listarAgendaDiasDisponiveisMes?idMedico=' + id_medico + '&dataAgendaInicial=01/07/2022&idUnidade=33588',
            headers: {
                "authentication-token": "a28bb73c7133fecbd971733d6b7228a4",
            },
        };

        axios(config)
            .then((response) => {

                let data_retorno = undefined;

                for (let i = 0; i < response.data.length; i++) {

                    if (response.data[i].Disponivel > 0) {

                        let data = response.data[i].DataGeral.split("/");

                        let dataAgenda = new Date(data[2] + "/" + data[1] + "/" + data[0]);

                        let hoje = new Date();

                        if (dataAgenda >= hoje) {
                            data_retorno = response.data[i];
                            break;
                        }
                    }
                }

                res(data_retorno);

            }).catch(function (error) {

                console.log(error);

                res(undefined);
            });
    });
}

exports.buscarHorario = function (dataGeral, nomeMedico) {

    return new Promise(function (res, rej) {

        let data = dataGeral.split("/");

        let myDate = new Date(data[2] + "/" + data[1] + "/" + data[0]);

        let dataFormatada = dateFormat(myDate, "yyyymmdd");

        console.log(dataFormatada);

        let url = `http://138.118.141.151/clinicapotiguar/services/WSJson.asmx/listarAgendadosDia?dataInicio=` + dataFormatada;

        var config = {
            method: "get",
            url: url,
            headers: {
                "authentication-token": "a28bb73c7133fecbd971733d6b7228a4",
            },
        };

        axios(config)
            .then((response) => {
                console.log("Retorno da api HORARIO");
                if (response.data.length) {
                    console.log("SUCESSO");
                    filtrarMedico(response.data, nomeMedico, (found, horario) => {

                        let response = {
                            found: found,
                            horario: horario
                        }

                        res(response);
                    });
                } else {
                    console.log("Sem agenda");

                    let response = {
                        found: false,
                        horario: ""
                    }

                    res(response);
                }
            })
            .catch(function (error) {
                console.log("ERRO!");
                console.log(error);
            });

    });
};

function filtrarMedico(agendamentos, nomeMedico, callback) {

    console.log("Filtrando médico");
    console.log(nomeMedico);

    let result;
    let found = false;

    for (let i = 0; i < agendamentos.length; i++) {
        if (!found && agendamentos[i].NomeMedico == nomeMedico) {
            result = agendamentos[i];
            found = true;
        }
    }

    console.log(result);

    callback(found, result.Horario);


}