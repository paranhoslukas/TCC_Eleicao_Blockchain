// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title Votacao
 * @notice Contrato de votacao eletronica auditavel com blockchain permissiva (GoQuorum IBFT)
 * @dev Identificacao do eleitor via hash(CPF + salt) gerado off-chain pelo server.js
 *      O CPF nunca e armazenado on-chain — apenas seu hash anonimizado.
 *      Um contrato por eleicao. Historico consultado via enderecos de contratos anteriores.
 */
contract Votacao {

    // ─── Enums ────────────────────────────────────────────────────────────────

    enum Estado { Aberta, EmVotacao, Encerrada }

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Candidato {
        uint256 id;
        string nome;
        uint256 votos;
    }

    struct RegistroVoto {
        bytes32 eleitorHash;   // hash(CPF + salt) — nunca o CPF real
        uint256 candidatoId;
        uint256 timestamp;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    address public admin;
    string  public nomeEleicao;
    Estado  public estado;

    // Candidatos registrados
    uint256 private _proximoCandidatoId;
    mapping(uint256 => Candidato) public candidatos;
    uint256[] public candidatoIds;

    // Controle de eleitores autorizados e votacao
    mapping(bytes32 => bool) public eleitorAutorizado;  // hash → autorizado
    mapping(bytes32 => bool) public eleitorVotou;       // hash → ja votou

    // Log publico de votos (auditabilidade)
    RegistroVoto[] public registrosVoto;

    // ─── Eventos ──────────────────────────────────────────────────────────────

    event EleicaoAberta(string nome, uint256 timestamp);
    event VotacaoIniciada(uint256 timestamp);
    event EleitorAutorizado(bytes32 indexed eleitorHash);
    event VotoRegistrado(bytes32 indexed eleitorHash, uint256 indexed candidatoId, uint256 timestamp);
    event EleicaoEncerrada(uint256 timestamp);

    // ─── Modificadores ────────────────────────────────────────────────────────

    modifier apenasAdmin() {
        require(msg.sender == admin, "Apenas o admin pode executar esta acao");
        _;
    }

    modifier noEstado(Estado _estado) {
        require(estado == _estado, "Operacao invalida para o estado atual da eleicao");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _nomeEleicao Nome descritivo da eleicao (ex: "Eleicao Diretoria 2025")
     */
    constructor(string memory _nomeEleicao) {
        admin       = msg.sender;
        nomeEleicao = _nomeEleicao;
        estado      = Estado.Aberta;
        emit EleicaoAberta(_nomeEleicao, block.timestamp);
    }

    // ─── Funcoes do Admin ─────────────────────────────────────────────────────

    /**
     * @notice Registra um candidato. So pode ser feito enquanto a eleicao esta Aberta.
     * @param _nome Nome do candidato
     */
    function adicionarCandidato(string calldata _nome)
        external
        apenasAdmin
        noEstado(Estado.Aberta)
    {
        require(bytes(_nome).length > 0, "Nome do candidato nao pode ser vazio");

        uint256 id = _proximoCandidatoId++;
        candidatos[id] = Candidato({ id: id, nome: _nome, votos: 0 });
        candidatoIds.push(id);
    }

    /**
     * @notice Autoriza um eleitor via hash anonimizado do CPF.
     *         O hash deve ser gerado off-chain: keccak256(abi.encodePacked(cpf, salt))
     * @param _eleitorHash Hash do eleitor gerado pelo server.js
     */
    function autorizarEleitor(bytes32 _eleitorHash)
        external
        apenasAdmin
        noEstado(Estado.Aberta)
    {
        require(!eleitorAutorizado[_eleitorHash], "Eleitor ja autorizado");
        eleitorAutorizado[_eleitorHash] = true;
        emit EleitorAutorizado(_eleitorHash);
    }

    /**
     * @notice Inicia a fase de votacao. Apos isso nao e possivel adicionar candidatos ou eleitores.
     * @dev Requer ao menos 2 candidatos para iniciar.
     */
    function iniciarVotacao()
        external
        apenasAdmin
        noEstado(Estado.Aberta)
    {
        require(candidatoIds.length >= 2, "Sao necessarios ao menos 2 candidatos");
        estado = Estado.EmVotacao;
        emit VotacaoIniciada(block.timestamp);
    }

    /**
     * @notice Encerra a votacao. Apos isso nenhum voto e aceito.
     */
    function encerrarVotacao()
        external
        apenasAdmin
        noEstado(Estado.EmVotacao)
    {
        estado = Estado.Encerrada;
        emit EleicaoEncerrada(block.timestamp);
    }

    // ─── Funcoes do Eleitor ───────────────────────────────────────────────────

    /**
     * @notice Registra o voto de um eleitor.
     * @param _eleitorHash Hash anonimizado do eleitor (gerado pelo server.js)
     * @param _candidatoId ID do candidato escolhido
     */
    function votar(bytes32 _eleitorHash, uint256 _candidatoId)
        external
        noEstado(Estado.EmVotacao)
    {
        require(eleitorAutorizado[_eleitorHash],  "Eleitor nao autorizado");
        require(!eleitorVotou[_eleitorHash],       "Eleitor ja votou");
        require(_candidatoId < _proximoCandidatoId, "Candidato invalido");

        eleitorVotou[_eleitorHash] = true;
        candidatos[_candidatoId].votos++;

        registrosVoto.push(RegistroVoto({
            eleitorHash:  _eleitorHash,
            candidatoId:  _candidatoId,
            timestamp:    block.timestamp
        }));

        emit VotoRegistrado(_eleitorHash, _candidatoId, block.timestamp);
    }

    // ─── Funcoes de Consulta (publicas) ──────────────────────────────────────

    /**
     * @notice Retorna todos os candidatos com suas contagens de votos.
     * @dev Disponivel em qualquer estado — permite auditoria em tempo real durante EmVotacao.
     */
    function apurar() external view returns (Candidato[] memory) {
        Candidato[] memory resultado = new Candidato[](candidatoIds.length);
        for (uint256 i = 0; i < candidatoIds.length; i++) {
            resultado[i] = candidatos[candidatoIds[i]];
        }
        return resultado;
    }

    /**
     * @notice Retorna o total de votos registrados.
     */
    function totalVotos() external view returns (uint256) {
        return registrosVoto.length;
    }

    /**
     * @notice Retorna um registro de voto especifico pelo indice.
     * @param _indice Posicao no array de registros
     */
    function getRegistroVoto(uint256 _indice)
        external
        view
        returns (bytes32 eleitorHash, uint256 candidatoId, uint256 timestamp)
    {
        require(_indice < registrosVoto.length, "Indice invalido");
        RegistroVoto storage r = registrosVoto[_indice];
        return (r.eleitorHash, r.candidatoId, r.timestamp);
    }

    /**
     * @notice Retorna o total de candidatos registrados.
     */
    function totalCandidatos() external view returns (uint256) {
        return candidatoIds.length;
    }

    /**
     * @notice Verifica se um eleitor ja votou.
     * @param _eleitorHash Hash anonimizado do eleitor
     */
    function jaVotou(bytes32 _eleitorHash) external view returns (bool) {
        return eleitorVotou[_eleitorHash];
    }
}
