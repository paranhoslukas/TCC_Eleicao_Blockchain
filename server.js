const express = require('express');
const path = require('node:path');
const { RedePermissivaVotacao } = require('./blockchain');

const aplicacao = express();
const porta = process.env.PORT || 3000;
const redePermissiva = new RedePermissivaVotacao();

aplicacao.use(express.json());
aplicacao.use(express.static(path.join(__dirname)));

aplicacao.get('/api/resultados', (_requisicao, resposta) => {
    resposta.json(redePermissiva.obterResultados());
});

aplicacao.get('/api/rede', (_requisicao, resposta) => {
    resposta.json(redePermissiva.obterRede());
});

aplicacao.get('/api/blocos', (_requisicao, resposta) => {
    resposta.json({ blocos: redePermissiva.obterBlocosAuditaveis() });
});

aplicacao.post('/api/credenciais', (_requisicao, resposta) => {
    const credencial = redePermissiva.emitirCredencial();
    resposta.status(201).json({ credencial });
});

aplicacao.post('/api/votar', (requisicao, resposta) => {
    try {
        const bloco = redePermissiva.registrarVoto(requisicao.body);

        resposta.status(201).json({
            mensagem: 'Voto registrado com sucesso.',
            blocoIndice: bloco.indice,
            hashBlocoCurto: bloco.hash.slice(0, 16),
        });
    } catch (erro) {
        resposta.status(400).json({ erro: erro.message });
    }
});

aplicacao.use((_requisicao, resposta) => {
    resposta.sendFile(path.join(__dirname, 'index.html'));
});

aplicacao.listen(porta, () => {
    console.log(`Servidor de votacao disponivel em http://localhost:${porta}`);
});