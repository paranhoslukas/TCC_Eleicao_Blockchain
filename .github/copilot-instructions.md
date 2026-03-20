# Project Guidelines

## Contexto do Projeto

- Este workspace suporta um TCC sobre votacao eletronica auditavel com blockchain permissiva, contratos inteligentes e infraestrutura conteinerizada.
- Use portugues do Brasil em textos, explicacoes, documentacao e elementos visiveis da interface, mantendo tom tecnico e academico.
- Use portugues do Brasil tambem para nomes de variaveis, funcoes, arquivos novos e identificadores de dominio, salvo quando uma API externa exigir outro formato.
- A stack principal deste projeto e JavaScript no frontend e no backend com Node.js, alem de Docker para ambiente e experimentos. Nao introduza outra stack principal sem pedido explicito.

## Arquitetura

- Priorize uma separacao clara entre interface web, servicos Node.js, integracao com a rede blockchain e componentes de infraestrutura executados em containers.
- Trate GoQuorum como a referencia principal de blockchain privada ou de consorcio neste projeto. Ao propor arquitetura, favoreca consensos para nos conhecidos, como RAFT ou IBFT, em vez de Proof-of-Work.
- Preserve os objetivos centrais do trabalho: imutabilidade, auditabilidade, anonimato criptografico e ausencia de ponto unico de falha.
- Ao modelar o fluxo de votacao, mantenha separadas as etapas de autenticacao do eleitor, autorizacao para votar, registro do voto, apuracao e auditoria.

## Convencoes

- Prefira arquivos externos de JavaScript e CSS em vez de codigo inline, mantendo frontend e backend desacoplados.
- Ao sugerir mecanismos de privacidade, priorize referencias a blind signatures, zero-knowledge proofs, hashes e criptografia assimetrica conforme o objetivo do trabalho.
- Ao propor comparacoes tecnologicas, diferencie blockchains publicas e permissivas com foco em contexto institucional e requisitos de governanca.
- Ao descrever ou implementar avaliacoes, inclua latencia, throughput, uso de recursos e propriedades de seguranca como criterios minimos.

## Build e Execucao

- Quando adicionar infraestrutura local, use Docker como padrao de execucao e empacotamento. Nao trate Kubernetes como parte obrigatoria do fluxo atual sem pedido explicito.
- Quando adicionar backend Node.js, use npm para dependencias e scripts padronizados em package.json.
- Documente rapidamente qualquer comando novo necessario para subir, testar ou medir o sistema.