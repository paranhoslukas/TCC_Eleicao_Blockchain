const crypto = require('node:crypto');

class RedePermissivaVotacao {
    constructor() {
        this.blocos = [this.criarBlocoGenesis()];
        this.contagemVotos = {
            Candidato_A: 0,
            Candidato_B: 0,
        };
        this.credenciaisAtivas = new Map();
        this.nosConhecidos = ['validador-1', 'validador-2', 'validador-3', 'observador-1'];
        this.consenso = 'IBFT';
    }

    criarHash(conteudo) {
        return crypto.createHash('sha256').update(conteudo).digest('hex');
    }

    criarBlocoGenesis() {
        const timestamp = new Date().toISOString();
        const hashAnterior = '0'.repeat(64);
        const dados = 'bloco-genesis';
        const hash = this.criarHash(`0|${timestamp}|${dados}|${hashAnterior}`);

        return {
            indice: 0,
            timestamp,
            candidato: 'Genesis',
            hashAnterior,
            hash,
            hashCredencial: 'nao-aplicavel',
        };
    }

    emitirCredencial() {
        const credencial = crypto.randomUUID();
        const hashCredencial = this.criarHash(credencial);

        this.credenciaisAtivas.set(hashCredencial, {
            utilizada: false,
            emitidaEm: new Date().toISOString(),
        });

        return credencial;
    }

    validarCandidato(candidato) {
        return ['Candidato_A', 'Candidato_B'].includes(candidato);
    }

    registrarVoto({ candidato, credencial }) {
        if (!this.validarCandidato(candidato)) {
            throw new Error('Candidato invalido para esta eleicao.');
        }

        if (!credencial) {
            throw new Error('Credencial obrigatoria para votar.');
        }

        const hashCredencial = this.criarHash(credencial);
        const registroCredencial = this.credenciaisAtivas.get(hashCredencial);

        if (!registroCredencial) {
            throw new Error('Credencial desconhecida ou expirada.');
        }

        if (registroCredencial.utilizada) {
            throw new Error('Esta credencial ja foi utilizada.');
        }

        const ultimoBloco = this.blocos[this.blocos.length - 1];
        const indice = this.blocos.length;
        const timestamp = new Date().toISOString();
        const hashAnterior = ultimoBloco.hash;
        const hash = this.criarHash(`${indice}|${timestamp}|${candidato}|${hashCredencial}|${hashAnterior}`);

        const bloco = {
            indice,
            timestamp,
            candidato,
            hashAnterior,
            hash,
            hashCredencial,
        };

        registroCredencial.utilizada = true;
        registroCredencial.utilizadaEm = timestamp;
        this.blocos.push(bloco);
        this.contagemVotos[candidato] += 1;

        return bloco;
    }

    obterResultados() {
        const totalVotos = this.contagemVotos.Candidato_A + this.contagemVotos.Candidato_B;

        return {
            votos: this.contagemVotos,
            totalVotos,
        };
    }

    obterRede() {
        return {
            nosConhecidos: this.nosConhecidos.length,
            consenso: this.consenso,
            alturaBlockchain: this.blocos.length - 1,
            transacoesConfirmadas: this.blocos.length - 1,
        };
    }

    obterBlocosAuditaveis() {
        return this.blocos.map((bloco) => ({
            indice: bloco.indice,
            timestamp: bloco.timestamp,
            candidato: bloco.candidato,
            hashAnterior: bloco.hashAnterior.slice(0, 16),
            hash: bloco.hash.slice(0, 16),
        }));
    }
}

module.exports = {
    RedePermissivaVotacao,
};