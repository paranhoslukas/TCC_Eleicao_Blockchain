// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

contract Votacao {

    enum Estado { Aberta, EmVotacao, Encerrada }

    struct Candidato {
        uint256 id;
        string  nome;
        uint256 votos;
    }

    struct RegistroVoto {
        bytes32 eleitorHash;
        uint256 candidatoId;
        uint256 timestamp;
    }

    address public admin;
    string  public nomeEleicao;
    Estado  public estado;
    bool    public modoAberto;

    uint256 private _proximoCandidatoId;
    mapping(uint256 => Candidato) public candidatos;
    uint256[] public candidatoIds;

    mapping(bytes32 => bool) public eleitorAutorizado;
    mapping(bytes32 => bool) public eleitorVotou;

    RegistroVoto[] public registrosVoto;

    event EleicaoAberta(string nome, bool modoAberto, uint256 timestamp);
    event VotacaoIniciada(uint256 timestamp);
    event EleitorAutorizado(bytes32 indexed eleitorHash);
    event VotoRegistrado(bytes32 indexed eleitorHash, uint256 indexed candidatoId, uint256 timestamp);
    event EleicaoEncerrada(uint256 timestamp);

    modifier apenasAdmin() {
        require(msg.sender == admin, "Apenas o admin pode executar esta acao");
        _;
    }

    modifier noEstado(Estado _estado) {
        require(estado == _estado, "Operacao invalida para o estado atual da eleicao");
        _;
    }

    constructor(string memory _nomeEleicao, bool _modoAberto) {
        admin       = msg.sender;
        nomeEleicao = _nomeEleicao;
        modoAberto  = _modoAberto;
        estado      = Estado.Aberta;
        emit EleicaoAberta(_nomeEleicao, _modoAberto, block.timestamp);
    }

    function adicionarCandidato(string calldata _nome)
        external apenasAdmin noEstado(Estado.Aberta)
    {
        require(bytes(_nome).length > 0, "Nome do candidato nao pode ser vazio");
        uint256 id = _proximoCandidatoId++;
        candidatos[id] = Candidato({ id: id, nome: _nome, votos: 0 });
        candidatoIds.push(id);
    }

    function autorizarEleitor(bytes32 _eleitorHash)
        external apenasAdmin noEstado(Estado.Aberta)
    {
        require(!eleitorAutorizado[_eleitorHash], "Eleitor ja autorizado");
        eleitorAutorizado[_eleitorHash] = true;
        emit EleitorAutorizado(_eleitorHash);
    }

    function iniciarVotacao()
        external apenasAdmin noEstado(Estado.Aberta)
    {
        require(candidatoIds.length >= 2, "Sao necessarios ao menos 2 candidatos");
        estado = Estado.EmVotacao;
        emit VotacaoIniciada(block.timestamp);
    }

    function encerrarVotacao()
        external apenasAdmin noEstado(Estado.EmVotacao)
    {
        estado = Estado.Encerrada;
        emit EleicaoEncerrada(block.timestamp);
    }

    function votar(bytes32 _eleitorHash, uint256 _candidatoId)
        external noEstado(Estado.EmVotacao)
    {
        if (!modoAberto) {
            require(eleitorAutorizado[_eleitorHash], "Eleitor nao autorizado");
        }
        require(!eleitorVotou[_eleitorHash],        "Eleitor ja votou");
        require(_candidatoId < _proximoCandidatoId, "Candidato invalido");

        eleitorVotou[_eleitorHash] = true;
        candidatos[_candidatoId].votos++;

        registrosVoto.push(RegistroVoto({
            eleitorHash: _eleitorHash,
            candidatoId: _candidatoId,
            timestamp:   block.timestamp
        }));

        emit VotoRegistrado(_eleitorHash, _candidatoId, block.timestamp);
    }

    function apurar() external view returns (Candidato[] memory) {
        Candidato[] memory resultado = new Candidato[](candidatoIds.length);
        for (uint256 i = 0; i < candidatoIds.length; i++) {
            resultado[i] = candidatos[candidatoIds[i]];
        }
        return resultado;
    }

    function totalVotos() external view returns (uint256) { return registrosVoto.length; }
    function totalCandidatos() external view returns (uint256) { return candidatoIds.length; }
    function jaVotou(bytes32 _eleitorHash) external view returns (bool) { return eleitorVotou[_eleitorHash]; }

    function getRegistroVoto(uint256 _indice)
        external view returns (bytes32 eleitorHash, uint256 candidatoId, uint256 timestamp)
    {
        require(_indice < registrosVoto.length, "Indice invalido");
        RegistroVoto storage r = registrosVoto[_indice];
        return (r.eleitorHash, r.candidatoId, r.timestamp);
    }
}
