# 🎯 Stop/Adedonha Online

Uma recriação digital completa do clássico jogo de palavras Stop/Adedonha, desenvolvida com funcionalidades modernas, sistema de validação inteligente e interatividade em tempo real.

## 🌐 Acesse o Jogo

👉 **[JOGAR AGORA - Link será fornecido após deploy]()**

## 🎮 Sobre o Jogo

O Stop Online é uma versão digital fiel ao jogo tradicional de palavras, onde jogadores devem encontrar palavras para diferentes categorias, todas começando com uma letra sorteada aleatoriamente. O diferencial está no sistema de validação por juiz e pontuação inteligente que replica a experiência autêntica do jogo original.

## ✨ Principais Funcionalidades

### 🏠 **Sistema de Salas**
- **Criação de salas** com códigos personalizados
- **Entrada em salas existentes** via código
- **Sistema de administração** (primeiro jogador vira admin)
- **Reconexão automática** após desconexões
- **Transferência de admin** quando o atual sai

### ⚙️ **Configuração Flexível**
- **Temas personalizáveis**: Admin pode adicionar/remover categorias
- **Duração ajustável**: Tempo da rodada configurável (30s a 5min)
- **Temas padrão**: Nome, Cidade, País, Marca, Cor, Animal, CEP, Objeto, Fruta, Filmes/Séries, Dor

### 🎲 **Sistema de Sorteio Inteligente**
- **Letras sem repetição**: Cada letra só é sorteada uma vez por partida
- **Alfabeto completo**: Todas as 26 letras têm chances iguais
- **Ciclo automático**: Quando todas as letras são usadas, o ciclo reinicia
- **Distribuição uniforme**: Evita letras favoritas do sistema anterior

### 🛑 **Mecânica do "STOP!"**
- **Qualquer jogador** pode parar a rodada a qualquer momento
- **Interrupção imediata** para todos os jogadores da sala
- **Submissão automática** das respostas preenchidas até o momento
- **Tempo limite** com parada automática quando esgota

### 🏆 **Sistema de Validação e Pontuação**
- **Validação por juiz**: Admin ou jogador designado valida as respostas
- **Processo tema por tema**: Validação organizada por categoria
- **Pontuação inteligente**:
  - **100 pontos**: Resposta única e válida
  - **50 pontos**: Resposta repetida mas válida
  - **0 pontos**: Resposta inválida ou vazia
- **Tratamento especial para respostas de 1 letra**:
  - Se única e validada pelo juiz: 100 pontos
  - Se repetida e validada pelo juiz: 50 pontos
  - Se invalidada pelo juiz: 0 pontos

### 📊 **Sistema de Pontuação e Rankings**
- **Pontuação por tema**: Visualização individual de cada categoria
- **Total da rodada**: Soma destacada dos pontos conquistados
- **Ranking acumulativo**: Pontuação total ao longo de várias rodadas
- **Cores intuitivas**:
  - 🟢 **Verde**: 100 pontos (resposta única)
  - 🟠 **Laranja**: 50 pontos (resposta repetida)
  - 🔴 **Vermelho**: 0 pontos (resposta inválida)

### 🔄 **Gestão de Partidas**
- **Nova rodada**: Admin pode iniciar rodadas subsequentes
- **Encerrar partida**: Finalização com ranking geral
- **Limpeza automática**: Estados resetados entre rodadas
- **Continuidade**: Pontuação acumulada entre rodadas

## 🚀 Tecnologias Utilizadas

### 🖥️ **Frontend**
- **React.js 18**: Interface reativa e componetizada
- **Vite**: Build tool moderna e rápida
- **Tailwind CSS**: Estilização utilitária responsiva
- **Socket.IO Client**: Comunicação em tempo real
- **React Router DOM**: Navegação entre páginas
- **UUID**: Geração de IDs únicos para usuários
- **Heroicons**: Ícones SVG elegantes

### 🔧 **Backend**
- **Node.js**: Ambiente de execução JavaScript
- **Express.js**: Framework web minimalista
- **Socket.IO Server**: Comunicação bidirecional em tempo real
- **Firebase Admin SDK**: Banco de dados e persistência
- **Firestore**: Armazenamento de configurações de sala
- **CORS**: Configuração de segurança para requisições

### ☁️ **Infraestrutura**
- **Frontend**: Hospedagem em plataforma de deploy
- **Backend**: Hospedagem em serviço de cloud
- **Banco de Dados**: **Google Firestore** para persistência

## 🎯 Como Jogar

### 1️⃣ **Entrada na Sala**
- Acesse o link do jogo
- Digite seu **apelido** e o **código da sala**
- Clique em "Entrar na Sala" ou "Criar Sala"

### 2️⃣ **Configuração (Admin)**
- Configure os **temas** da partida
- Defina a **duração** das rodadas
- Clique em **"Iniciar Rodada"**

### 3️⃣ **Durante a Rodada**
- Uma **letra** será sorteada
- Preencha as **respostas** para cada tema
- Clique em **"STOP!"** quando terminar ou aguarde o tempo esgotar

### 4️⃣ **Validação**
- O **juiz** validará as respostas uma por uma
- Acompanhe sua **pontuação** por tema
- Veja o **total da rodada** ao final

### 5️⃣ **Continuação**
- O admin pode iniciar uma **nova rodada**
- Ou **encerrar a partida** para ver o ranking final

## 🏗️ Estrutura do Projeto

```
stop-game-online/
├── frontend/                    # Aplicação React
│   ├── src/
│   │   ├── components/          # Componentes React
│   │   │   ├── Home.jsx         # Tela inicial
│   │   │   ├── Room.jsx         # Interface da sala
│   │   │   ├── GameBoard.jsx    # Tabuleiro do jogo
│   │   │   ├── Timer.jsx        # Cronômetro
│   │   │   ├── Modal.jsx        # Modais do sistema
│   │   │   └── Alert.jsx        # Alertas e notificações
│   │   ├── App.jsx              # Componente principal
│   │   ├── socket.js            # Configuração Socket.IO
│   │   └── main.jsx             # Entrada da aplicação
│   └── package.json             # Dependências do frontend
│
├── backend/                     # Servidor Node.js
│   ├── index.js                 # Servidor principal
│   ├── package.json             # Dependências do backend
│   └── .env                     # Variáveis de ambiente
│
└── README.md                    # Documentação do projeto
```

## 🛠️ Executar Localmente

### **Pré-requisitos**
- Node.js 16+ instalado
- NPM ou Yarn
- Conta no Firebase (para Firestore)

### **1. Clone o Repositório**
```bash
git clone https://github.com/seu-usuario/stop-game-online.git
cd stop-game-online
```

### **2. Configure o Backend**
```bash
cd backend
npm install

# Configure as variáveis de ambiente (.env)
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_PRIVATE_KEY=your_firebase_private_key
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
PORT=3001

# Inicie o servidor
npm start
```

### **3. Configure o Frontend**
```bash
cd ../frontend
npm install

# Configure a URL do backend (src/socket.js)
# Altere para apontar para seu servidor backend

# Inicie a aplicação
npm run dev
```

### **4. Acesse o Jogo**
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## 🌟 Funcionalidades Avançadas

### **Sistema de Reconexão**
- **Reconexão automática** após quedas de internet
- **Preservação do estado** do jogador na sala
- **Sincronização** com o estado atual da partida

### **Validação Inteligente**
- **Normalização de respostas**: Remove acentos e espaços extras
- **Comparação case-insensitive**: "BRASIL" = "brasil" = "Brasil"
- **Detecção de respostas similares**: Agrupa automaticamente
- **Validação por juiz**: Controle humano final

### **Interface Responsiva**
- **Design adaptativo** para desktop, tablet e mobile
- **Tema escuro/claro** automático baseado no sistema
- **Animações suaves** para feedback visual
- **Acessibilidade** com navegação por teclado

### **Persistência de Dados**
- **Configurações de sala** salvas no Firestore
- **Recuperação** de salas após reinicializações do servidor
- **Histórico de partidas** mantido durante a sessão

## 🤝 Contribuição

Contribuições são bem-vindas! Para contribuir:

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🎯 Roadmap

- [ ] Sistema de chat durante as partidas
- [ ] Histórico de partidas por usuário
- [ ] Ranking global de jogadores
- [ ] Temas personalizados por sala
- [ ] Modo torneio com eliminatórias
- [ ] Estatísticas detalhadas de performance
- [ ] Sistema de conquistas/badges

---

**Desenvolvido com ❤️ para recriar a magia do Stop/Adedonha tradicional no mundo digital.**

**🎮 [Jogue agora - Link disponível após deploy]()**