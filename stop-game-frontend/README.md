# 📝 Stop/Adedonha Online

Bem-vindo ao repositório do jogo Stop/Adedonha Online, uma recriação digital do clássico jogo de palavras, desenvolvida para ser o mais fiel possível à experiência original, com funcionalidades modernas e interatividade em tempo real.

## 🎮 Visão Geral do Sistema e Jogabilidade

Este projeto é uma aplicação web interativa que permite que múltiplos jogadores participem de partidas de Stop/Adedonha em tempo real. O jogo simula a dinâmica tradicional, onde os participantes devem encontrar palavras para diversas categorias, todas começando com uma letra sorteada.

**O objetivo principal foi desenvolver um sistema que replicasse a jogabilidade original de Stop/Adedonha de forma precisa e envolvente.**

### Como Funciona a Jogabilidade:

1. **Criação/Entrada na Sala:** Os jogadores podem criar novas salas ou entrar em salas existentes usando um apelido e o nome da sala. O primeiro a entrar na sala se torna o administrador.

2. **Configuração da Rodada (Admin):** Antes do início de cada rodada, o administrador da sala pode:

   * **Gerenciar Temas:** Adicionar ou remover categorias de palavras (ex: País, Cidade, Nome, Marca, Cor, Animal).

   * **Definir Duração:** Ajustar o tempo limite para cada rodada.

3. **Início da Rodada:** O administrador inicia a rodada, que começa com uma contagem regressiva.

4. **Rodada Ativa:**

   * Uma letra aleatória é sorteada e exibida para todos os jogadores.

   * Os jogadores devem preencher as respostas para cada tema com palavras que comecem com a letra sorteada.

   * **Mecanismo "STOP!":** Qualquer jogador pode clicar no botão "STOP!" a qualquer momento. **Ao ser acionado, a rodada é imediatamente interrompida para *todos* os jogadores, e o sistema avança para a fase de validação/invalidação das respostas pelo juiz.**

5. **Fase de Validação:**

   * Após o término da rodada, as respostas são apresentadas uma a uma para validação.

   * Um "juiz" (geralmente o administrador, ou um jogador designado pelo sistema) é responsável por validar as respostas dos demais jogadores.

   * As respostas podem ser validadas (100 pontos) ou anuladas (0 pontos).

6. **Ranking:**

   * **Ranking da Rodada:** Após a validação de todas as respostas de uma rodada, um ranking é exibido, mostrando a pontuação de cada jogador naquela rodada.

   * **Ranking Geral da Partida:** Um ranking acumulativo é mantido ao longo de várias rodadas, exibindo a pontuação total de cada jogador na partida.

7. **Reinício/Fim da Partida:**

   * **Nova Rodada:** O administrador pode iniciar uma nova rodada, resetando os campos de resposta e sorteando uma nova letra.

   * **Encerrar Partida:** O administrador pode finalizar a partida, exibindo o ranking geral final.

## 🚀 Tecnologias Empregadas

Este sistema é construído com uma arquitetura cliente-servidor, utilizando as seguintes tecnologias:

### Frontend (Aplicação Cliente)

* **React.js** ⚛️: Biblioteca JavaScript para construção da interface do usuário, garantindo uma experiência dinâmica e reativa.

* **Tailwind CSS** 💨: Framework CSS utilitário para estilização rápida e responsiva, permitindo um design moderno e adaptável a diferentes tamanhos de tela.

* **React Router DOM** 🛣️: Para gerenciamento de rotas e navegação entre a tela inicial e as salas de jogo.

* **React Modal** 🖼️: Componente para exibição de modais (como a tela de validação e o ranking final), garantindo acessibilidade e boa experiência do usuário.

* **Socket.IO Client** 🌐: Biblioteca JavaScript para comunicação em tempo real com o servidor, essencial para a sincronização das ações dos jogadores e do estado do jogo.

* **Heroicons** ✨: Ícones SVG para elementos da interface, como o botão de alternar tema.

* **UUID** 🆔: Para geração de IDs únicos para os usuários, facilitando a identificação e persistência de dados no `localStorage`.

### Backend (Servidor)

* **Node.js** 🟢: Ambiente de execução JavaScript no servidor.

* **Express.js** ⚡: Framework web para Node.js, utilizado para configurar o servidor HTTP.

* **Socket.IO Server** 📡: Biblioteca para permitir comunicação bidirecional em tempo real entre o servidor e os clientes, sendo o coração da interatividade do jogo. Gerencia salas, jogadores, estado do jogo, sorteio de letras, validação e pontuação.

## 🏗️ Estrutura do Código

O projeto é organizado para promover a modularidade e a clareza, separando as responsabilidades entre os componentes e o servidor.

### Estrutura do Frontend

* **`src/App.jsx`**:

    * É o componente raiz da aplicação React.

    * Gerencia o estado global do jogo (ex: `gameState`, `roomThemes`, `playersInRoom`, `currentValidationState`, `overallRanking`).

    * Configura as rotas principais (`/` para a tela inicial e `/room/:roomId` para as salas de jogo).

    * Centraliza os listeners e emissores de eventos do Socket.IO que afetam o estado global da aplicação.

    * Passa as props necessárias e os handlers de eventos para os componentes filhos (`Home` e `Room`).

* **`src/main.jsx`**:

    * O ponto de entrada da aplicação React.

    * Responsável por renderizar o componente `<App />` no DOM.

    * **Crucial:** Envolve o `<App />` com o `<BrowserRouter>` do `react-router-dom`, fornecendo o contexto de roteamento necessário para `useNavigate` e `Routes`.

* **`src/components/Home.jsx`**:

    * Componente da tela inicial.

    * Permite que os usuários insiram seu apelido e o nome da sala para criar ou entrar em um jogo.

    * Interage com o `App.jsx` através de props para iniciar a conexão com a sala.

* **`src/components/Room.jsx`**:

    * Componente que representa a interface da sala de jogo.

    * Recebe a maioria dos estados e handlers do `App.jsx` via props.

    * Renderiza o `GameBoard` e outros elementos específicos da sala (informações de jogadores, botão de compartilhar link, toggle de tema).

    * Exibe o contador regressivo para o início da rodada e a letra sorteada.

* **`src/components/GameBoard.jsx`**:

    * Componente central da interface do jogo em si.

    * Recebe todas as informações e funções de ação necessárias do `Room.jsx` (que vêm do `App.jsx`).

    * Renderiza os campos de input para as respostas dos temas.

    * Exibe o botão "STOP!" e a mensagem de aguardo.

    * Inclui a `ValidationModal` para a fase de correção e o `Modal` para o ranking final.

    * Gerencia estados locais como as respostas do jogador atual (`answers`) e o tempo restante da rodada (`localRoundTimeRemaining`).

* **`src/components/Timer.jsx`**:

    * Um componente simples para exibir um contador regressivo durante a rodada ativa.

* **`src/socket.js`**:

    * Configura e exporta a instância do cliente Socket.IO, facilitando a importação e uso em outros componentes.

* **`src/index.css`**:

    * Contém as diretivas `@tailwind` para importar os estilos base, componentes e utilitários do Tailwind CSS.

* **`src/app.css`**:

    * Contém estilos CSS personalizados e globais para a aplicação.

### Estrutura do Backend

* **`index.js` (ou `server.js`)**:

    * Configura o servidor Node.js com Express.

    * Inicializa o servidor Socket.IO.

    * Contém toda a lógica do jogo:

        * Gerenciamento de salas (criação, entrada, saída).

        * Controle de jogadores (conexão, desconexão, apelidos, IDs).

        * Sorteio de letras aleatórias.

        * Gerenciamento de temas e duração da rodada.

        * Lógica do "STOP!" e período de graça.

        * Processo de validação de respostas (designação de juiz, recebimento de respostas, pontuação).

        * Cálculo e atualização de rankings de rodada e gerais.

        * Emissão de eventos Socket.IO para sincronizar o estado do jogo com todos os clientes conectados na sala.

## 🌐 Disponibilidade Online

O jogo Stop/Adedonha Online está disponível para jogar em:

👉 [**https://stop-paper.netlify.app/**](https://stop-paper.netlify.app/)

* **Frontend (Aplicação Cliente):** Hospedado na **Netlify**.

* **Backend (Servidor):** Hospedado na **Render.com**.

## 🛠️ Como Executar o Projeto (Assumindo Ambiente Node.js/npm)

1.  **Clone o repositório:**

    ```bash
    git clone <URL_DO_SEU_REPOSITORIO>
    cd <nome_do_seu_repositorio>
    ```

2.  **Instale as dependências do Backend:**

    ```bash
    cd server # Ou o diretório do seu backend
    npm install
    ```

3.  **Inicie o servidor Backend:**

    ```bash
    npm start # Ou node index.js
    ```

4.  **Instale as dependências do Frontend:**

    ```bash
    cd ../client # Ou o diretório do seu frontend
    npm install
    ```

5.  **Inicie a aplicação Frontend:**

    ```bash
    npm run dev
    ```

    (Isso geralmente abrirá o navegador em `http://localhost:5173` ou uma porta similar).

Agora você pode acessar o jogo no seu navegador e começar a jogar Stop/Adedonha!