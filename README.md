# 🎯 Stop/Adedonha Online

Uma recriação digital completa do clássico jogo de palavras Stop/Adedonha, desenvolvida com funcionalidades modernas, sistema de validação inteligente e interatividade em tempo real.

## 🌐 Acesse o Jogo

👉 **[JOGAR AGORA - Link será fornecido após deploy]()**

## 🎮 Sobre o Jogo

O Stop Online é uma versão digital fiel ao jogo tradicional de palavras, onde jogadores devem encontrar palavras para diferentes categorias, todas começando com uma letra sorteada aleatoriamente. O diferencial está no sistema de validação por juiz e pontuação inteligente que replica a experiência autêntica do jogo original.

## 🔒 Segurança e Privacidade

### 🛡️ **Proteção de Dados**
- **Dados mínimos**: Coleta apenas apelidos temporários para identificação nas salas
- **Sem armazenamento pessoal**: Nenhum dado pessoal é persistido após o fim das sessões
- **Criptografia em trânsito**: Todas as comunicações utilizam HTTPS/WSS
- **Sessões temporárias**: Dados de jogadores são limpos automaticamente após desconexão

### 🔐 **Configuração Segura**
- **Variáveis de ambiente**: Credenciais sensíveis mantidas em `.env` (não versionado)
- **Firebase Security Rules**: Acesso restrito apenas a dados necessários da aplicação
- **CORS configurado**: Whitelist de domínios autorizados para requisições
- **Rate limiting**: Proteção contra abuse e spam (implementação recomendada)

### 📋 **Compliance e Boas Práticas**
- **LGPD Ready**: Estrutura preparada para conformidade com proteção de dados
- **Logs auditáveis**: Sistema de logging para monitoramento e debugging
- **Cleanup automático**: Limpeza de dados órfãos e sessões expiradas
- **Input validation**: Sanitização e validação de todas as entradas do usuário

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
- **Modo automático**: O administrador pode escolher correção manual ou automática antes de iniciar a rodada
- **Regra de acentos**: O administrador pode aceitar respostas com ou sem acento ou exigir a grafia acentuada
- **API gratuita**: O modo automático consulta o Datamuse no backend, sem expor credenciais no navegador
- **Falhas controladas**: Timeout ou indisponibilidade da API marca a resposta como falha e não interrompe a rodada
- **Processo tema por tema**: Validação organizada por categoria
- **Pontuação inteligente**:
  - **100 pontos**: Resposta única e válida
  - **50 pontos**: Resposta repetida mas válida
  - **0 pontos**: Resposta inválida ou vazia
- **Respostas com uma única letra**: são inválidas automaticamente e recebem 0 pontos

#### Configuração da validação automática

O modo automático usa uma estratégia híbrida e gratuita, sem chave:

- `IBGE Localidades` para municípios brasileiros;
- `i18n-iso-countries` para países e traduções em português;
- `OpenStreetMap Nominatim` para cidades internacionais;
- catálogo local para animais comuns, incluindo `rinoceronte` e `hipopótamo`;
- `Datamuse` como fallback para categorias gerais.

O backend valida localmente a letra inicial e exige pelo menos duas letras. Para categorias gerais, o endpoint do Datamuse pode ser substituído por outro compatível através de `VALIDATION_API_URL`.

Por padrão, acentos são opcionais: `Hipopótamo` e `Hipopotamo` podem ser aceitos como a mesma resposta. Quando `Acento obrigatório` estiver selecionado, a forma sem acento será considerada inválida.

A capitalização não interfere na validação: `rinoceronte`, `Rinoceronte` e `RINOCERONTE` são tratados igualmente. O catálogo local de animais evita que o Datamuse retorne uma tradução em inglês ou uma sugestão aproximada em vez da palavra portuguesa exata.

As fontes geográficas têm cobertura muito melhor para cidades e países, mas o Datamuse ainda não classifica semanticamente marcas, filmes ou categorias específicas. O modo manual continua disponível e é o padrão para salas antigas e novas.

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

## 🚀 Stack Tecnológico

### 🖥️ **Frontend**
```javascript
{
  "framework": "React.js 18.2+",
  "bundler": "Vite 4.0+", 
  "styling": "Tailwind CSS 3.0+",
  "realtime": "Socket.IO Client 4.0+",
  "routing": "React Router DOM 6.0+",
  "icons": "@heroicons/react",
  "utils": ["uuid", "date-fns"]
}
```

### 🔧 **Backend**
```javascript
{
  "runtime": "Node.js 18+",
  "framework": "Express.js 4.18+",
  "websockets": "Socket.IO 4.0+",
  "database": "Firebase Firestore",
  "auth": "Firebase Admin SDK",
  "security": ["cors", "helmet", "express-rate-limit"],
  "logging": "winston",
  "validation": "joi"
}
```

### ☁️ **Infraestrutura e DevOps**
```yaml
Production:
  Frontend: Netlify/Vercel
  Backend: Render/Railway
  Database: Google Firestore
  CDN: Cloudflare (opcional)
  Monitoring: Firebase Analytics
  
Security:
  HTTPS: SSL/TLS Certificate
  WSS: WebSocket Secure
  Firewall: Application-level protection
  Backup: Automated Firestore backups
```

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

## 🏗️ Arquitetura do Projeto

```
stop-game-online/
├── 📁 stop-game-frontend/           # React Application
│   ├── 📁 public/                   # Static assets
│   ├── 📁 src/
│   │   ├── 📁 components/           # React Components
│   │   │   ├── 🏠 Home.jsx          # Landing page & room join
│   │   │   ├── 🎯 Room.jsx          # Game room interface
│   │   │   ├── 📋 GameBoard.jsx     # Main game board
│   │   │   ├── ⏰ Timer.jsx         # Round countdown timer
│   │   │   ├── 🖼️ Modal.jsx         # Modal dialogs
│   │   │   └── 🔔 Alert.jsx         # Toast notifications
│   │   ├── 📁 hooks/                # Custom React hooks
│   │   │   └── 💾 useSessionPersistence.js
│   │   ├── 📁 assets/               # Images, icons, fonts
│   │   ├── 🔌 socket.js             # Socket.IO configuration
│   │   ├── ⚛️ App.jsx               # Main application component
│   │   └── 🎯 main.jsx              # Application entry point
│   ├── 📄 package.json              # Dependencies & scripts
│   ├── ⚙️ vite.config.js            # Vite build configuration
│   ├── 🎨 tailwind.config.js        # Tailwind CSS config
│   └── 🔒 .env.local                # Environment variables (local)
│
├── 📁 stop-game-backend/            # Node.js Server
│   ├── 🖥️ index.js                  # Main server file
│   ├── 📄 package.json              # Dependencies & scripts  
│   ├── 🔐 .env                      # Environment secrets (NEVER COMMIT)
│   ├── 🔑 .env.example              # Environment template
│   └── 🔥 stopgame_firebase.json    # Firebase service account key
│
├── 📁 cypress/                      # E2E Testing (Cypress)
│   ├── 📁 e2e/                      # Test scenarios
│   ├── 📁 fixtures/                 # Test data
│   └── ⚙️ cypress.config.js         # Test configuration
│
├── 📋 README.md                     # Project documentation
├── 📄 package.json                  # Root workspace config
├── 🔒 .gitignore                    # Git ignore rules
└── 📜 LICENSE                       # MIT License

🔐 Security Notes:
├── .env files are gitignored
├── Firebase keys stored securely
├── No hardcoded credentials in code
└── Sensitive data isolated in environment variables
```

## 🛠️ Instalação e Configuração

### 📋 **Pré-requisitos**
- Node.js 18+ (LTS recomendado)
- npm 9+ ou yarn 3+
- Firebase Project com Firestore habilitado
- Git 2.30+

### **1. Configuração do Ambiente**
```bash
# Clone o repositório
git clone https://github.com/Raffadom/stop-game-online.git
cd stop-game-online

# Instale dependências globais (opcional)
npm install -g firebase-tools
```

### **2. Setup do Backend** 🔧
```bash
cd stop-game-backend
npm install

# Crie o arquivo de ambiente (CRÍTICO)
cp .env.example .env
```

**Configure o `.env` (NUNCA COMMITTAR)**:
```env
# Firebase Configuration (SENSÍVEL)
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}
FIREBASE_PROJECT_ID=your_project_id

# Server Configuration  
PORT=3001
NODE_ENV=production

# Security Keys (GERAR NOVOS)
JWT_SECRET=sua_chave_secreta_forte_aqui
SESSION_SECRET=outra_chave_muito_forte

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### **3. Setup do Frontend** 🖥️
```bash
cd ../stop-game-frontend
npm install

# Configure variáveis de ambiente
cp .env.example .env.local
```

**Configure o `.env.local`**:
```env
# Backend URL (ajustar para produção)
VITE_BACKEND_URL=http://localhost:3001
VITE_SOCKET_URL=ws://localhost:3001

# Feature Flags
VITE_ENABLE_ANALYTICS=false
VITE_DEBUG_MODE=true
```

### **4. Inicialização** 🚀
```bash
# Terminal 1 - Backend
cd stop-game-backend
npm run dev

# Terminal 2 - Frontend  
cd stop-game-frontend
npm run dev
```

### **5. Acesso Local**
- 🖥️ **Frontend**: http://localhost:5173
- 🔧 **Backend**: http://localhost:3001
- 📊 **Health Check**: http://localhost:3001/health

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

## 🔧 Scripts e Comandos

### **Backend Commands**
```bash
# Desenvolvimento
npm run dev          # Servidor com hot-reload
npm run start        # Servidor de produção
npm run test         # Executar testes unitários
npm run lint         # Verificar code style
npm run security     # Audit de dependências

# Deploy e Manutenção
npm run build        # Build de produção (se houver)
npm run logs         # Ver logs de produção
npm run backup       # Backup do Firestore
```

### **Frontend Commands**  
```bash
# Desenvolvimento
npm run dev          # Servidor de desenvolvimento
npm run build        # Build para produção
npm run preview      # Preview da build
npm run test         # Testes unitários (Jest/Vitest)
npm run e2e          # Testes end-to-end (Cypress)

# Qualidade de Código
npm run lint         # ESLint + Prettier
npm run type-check   # Verificação TypeScript
npm run analyze      # Análise do bundle
```

## 🧪 Testes e Qualidade

### **Testes Automatizados**
```bash
# Executar todos os testes
npm run test:all

# Testes específicos
npm run test:unit        # Testes unitários
npm run test:integration # Testes de integração
npm run test:e2e         # Testes end-to-end

# Coverage e relatórios
npm run test:coverage    # Cobertura de testes
npm run test:report      # Relatório detalhado
```

### **Ferramentas de Qualidade**
- **ESLint**: Análise estática de código
- **Prettier**: Formatação automática
- **Husky**: Git hooks para qualidade
- **Jest/Vitest**: Testes unitários
- **Cypress**: Testes E2E
- **Lighthouse**: Auditoria de performance

## 🚀 Deploy e Produção

### **Variáveis de Ambiente - Produção**
```env
# 🔐 CRÍTICO: Configure antes do deploy
NODE_ENV=production
FIREBASE_PROJECT_ID=stop-game-prod
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account"...}

# Performance e Segurança
RATE_LIMIT_MAX_REQUESTS=50
CORS_ORIGIN=https://seu-dominio.com
SSL_REDIRECT=true

# Monitoramento
LOG_LEVEL=info
SENTRY_DSN=sua_sentry_dsn_aqui
```

### **Checklist de Deploy**
- [ ] ✅ Todas as variáveis de ambiente configuradas
- [ ] ✅ Build de produção executado com sucesso
- [ ] ✅ Testes E2E passando
- [ ] ✅ Security audit sem vulnerabilidades críticas
- [ ] ✅ Firebase Security Rules configuradas
- [ ] ✅ CORS configurado para domínio de produção
- [ ] ✅ Rate limiting ativo
- [ ] ✅ Logs de monitoramento funcionando

## 🛡️ Segurança em Produção

### **Checklist de Segurança**
- [ ] 🔐 HTTPS obrigatório (SSL/TLS)
- [ ] 🔒 Headers de segurança (Helmet.js)
- [ ] 🚫 Rate limiting configurado
- [ ] 🔍 Input validation em todas as rotas
- [ ] 📋 Logs de auditoria ativos
- [ ] 🔄 Backup automático do Firestore
- [ ] 🔑 Rotação de chaves de API
- [ ] 📊 Monitoramento de performance

### **Incident Response**
```bash
# Monitoramento em tempo real
npm run logs:live         # Logs ao vivo
npm run health:check      # Status dos serviços
npm run security:scan     # Varredura de segurança

# Recuperação de desastres
npm run backup:create     # Backup manual
npm run backup:restore    # Restaurar backup
npm run rollback:deploy   # Rollback para versão anterior
```

## 🤝 Contribuição

### **Como Contribuir**
1. 🍴 **Fork** do repositório
2. 🌿 **Branch** para sua feature: `git checkout -b feature/nova-funcionalidade`
3. ✨ **Commits** seguindo [Conventional Commits](https://www.conventionalcommits.org/)
4. 🧪 **Testes** para sua feature
5. 📖 **Documentação** atualizada
6. 🚀 **Pull Request** com descrição detalhada

### **Padrões de Commit**
```bash
feat: adiciona sistema de chat nas salas
fix: corrige perda de pontuação em reconexões  
docs: atualiza README com seção de segurança
style: aplica formatação com prettier
refactor: reestrutura handlers do socket.io
test: adiciona testes para validação de respostas
chore: atualiza dependências do projeto
```

### **Code Review Guidelines**
- 📋 Seguir padrões estabelecidos (ESLint/Prettier)
- 🧪 Cobertura de testes mantida acima de 80%
- 📚 Documentação clara e atualizada
- 🔒 Revisão de segurança para mudanças sensíveis
- ⚡ Performance não degradada

## 📱 Publicação nas App Stores

### **🎯 Estratégia Mobile**

O **Stop Game Online** está sendo preparado para distribuição nas principais lojas de aplicativos, oferecendo a experiência completa do jogo em dispositivos móveis através de tecnologias modernas.

#### **📋 Roadmap Mobile**
- [ ] 🔄 **Conversão para PWA** (Progressive Web App)
- [ ] 📱 **Wrapper nativo** com Capacitor/Cordova  
- [ ] 🍎 **Publicação na App Store** (iOS)
- [ ] 🤖 **Publicação no Google Play** (Android)
- [ ] 🔔 **Push notifications nativas**
- [ ] 📳 **Integração com recursos do device**

#### **💰 Custos Estimados de Publicação**

| Plataforma | Taxa de Desenvolvedor | Taxa por App | Renovação Anual |
|------------|----------------------|--------------|-----------------|
| 🍎 **Apple App Store** | $99 USD | Incluído | $99 USD |
| 🤖 **Google Play Store** | $25 USD | Incluído | - (única vez) |
| **TOTAL PRIMEIRO ANO** | **$124 USD** | **~R$ 700** | **$99 USD/ano** |

#### **📱 Tecnologias para Mobile**

```javascript
// Stack Tecnológico Mobile
{
  "pwa": {
    "service_worker": "Workbox",
    "manifest": "Web App Manifest",
    "offline_support": "Cache API + IndexedDB"
  },
  "native_wrapper": {
    "framework": "Capacitor 5.0+", 
    "alternative": "Cordova/PhoneGap",
    "build_tool": "Capacitor CLI"
  },
  "features": {
    "push_notifications": "@capacitor/push-notifications",
    "local_storage": "@capacitor/storage", 
    "splash_screen": "@capacitor/splash-screen",
    "status_bar": "@capacitor/status-bar"
  }
}
```

#### **🔧 Preparação Técnica Necessária**

##### **1. PWA (Progressive Web App)**
- ✅ Service Worker para cache offline
- ✅ Web App Manifest configurado
- ✅ HTTPS obrigatório (já implementado)
- ✅ Design responsivo (Tailwind CSS)
- 🔄 Otimização para touch/gestos
- 🔄 Splash screen personalizada

##### **2. Capacitor Integration**
```bash
# Instalação e setup
npm install @capacitor/core @capacitor/cli
npx cap init "Stop Game" "com.rafaeldomingos.stopgame"
npm install @capacitor/android @capacitor/ios

# Build e sincronização
npm run build
npx cap add android
npx cap add ios
npx cap sync
```

##### **3. Assets e Recursos**
- 📱 **Ícones**: 1024x1024px (iOS), múltiplas resoluções (Android)  
- 🖼️ **Splash Screens**: Diversas resoluções para cada plataforma
- 📄 **Metadados**: Descrições, screenshots, palavras-chave
- 🔒 **Certificados**: Assinatura digital para distribuição

### **🎯 Roadmap e Evolução**

### **📋 Próximas Features**
- [ ] 💬 Sistema de chat em tempo real
- [ ] 👤 Perfis de usuário persistentes
- [ ] 🏆 Ranking global e estatísticas
- [ ] 🎨 Temas customizáveis por sala
- [ ] 🏁 Modo torneio com eliminatórias
- [ ] 📊 Dashboard analytics para admins
- [ ] � Sistema de notificações push nativas
- [ ] 🌍 Internacionalização (i18n)
- [ ] 📱 **Features mobile exclusivas**

### **🔧 Melhorias Técnicas**
- [ ] ⚡ Migration para TypeScript
- [ ] 🏗️ Arquitetura de microservices
- [ ] 📱 **PWA completa com offline mode**
- [ ] 🧪 Testes de carga automatizados
- [ ] 🔄 CI/CD pipeline completo
- [ ] 📈 Métricas avançadas de performance
- [ ] 🔍 Logging estruturado (ELK Stack)
- [ ] 📱 **Native mobile builds**

## 📝 Licença e Créditos

### **📄 MIT License**
Este projeto é distribuído sob a licença MIT. Consulte [LICENSE](LICENSE) para detalhes completos.

### **🙏 Agradecimentos**
- **Socket.IO Team** - Tecnologia de tempo real
- **Firebase Team** - Infraestrutura de backend  
- **React Team** - Framework de interface
- **Comunidade Open Source** - Inspiração e bibliotecas

### **🎮 Sobre o Projeto**
Desenvolvido com ❤️ para recriar a magia nostálgica do **Stop/Adedonha** tradicional, agora no mundo digital com toda a interatividade e conveniência da web moderna.

---

**🔗 Links Importantes**
- 🎯 **[Jogar Online](https://seu-dominio.com)** 
- 📚 **[Documentação API](https://docs.seu-dominio.com)**
- 🐛 **[Reportar Bug](https://github.com/Raffadom/stop-game-online/issues)**
- 💡 **[Sugerir Feature](https://github.com/Raffadom/stop-game-online/discussions)**
- 📧 **[Contato](mailto:contato@seu-dominio.com)**

---

## 👨‍💻 Desenvolvedor

### **Rafael Domingos**
*Quality Assurance Analyst & Full Stack Developer*

Sou **Analista de Quality Assurance** com experiência sólida em testes manuais e automatizados para aplicações web e mobile. Atuo de forma proativa e colaborativa, integrando perfeitamente com times de desenvolvimento para garantir **qualidade, estabilidade e excelente experiência dos usuários**.

Este projeto **Stop/Adedonha Online** nasceu da paixão por criar experiências digitais que conectam pessoas e recriam memórias nostálgicas através da tecnologia, aplicando todos os **princípios de qualidade e testing** que utilizo profissionalmente.

### **🔬 Principais Competências Técnicas**

#### **🧪 Testing & Quality Assurance**
- 🔹 **Testes funcionais, regressivos, exploratórios e de smoke** em ambientes web e mobile
- 🔹 **Automação de testes E2E e de API** com Cypress (aplicado neste projeto!)
- 🔹 **Testes e validações de API** com Insomnia
- 🔹 **Escrita e revisão de casos de teste** (Test Case Reviews - TCR)
- 🔹 **Atuação colaborativa** na definição e melhoria contínua de features

#### **💻 Desenvolvimento & DevOps**
- 🔹 **JavaScript e CSS** aplicados em testes e análises de front-end
- 🔹 **Deploys em ambientes de homologação** com Kubernetes
- 🔹 **Consultas e investigações avançadas** em banco de dados MySQL 8
- 🔹 **Node.js, React, Socket.IO** (stack completa deste projeto)

#### **📋 Documentação & Colaboração**
- 🔹 **Criação e manutenção** de documentações técnicas claras
- 🔹 **Comunicação eficaz** e colaboração com times de desenvolvimento, produto e UX
- 🔹 **Alinhamento** entre negócio, tecnologia e experiência do usuário

### **🎯 Filosofia de Trabalho**
> *"Busco fortalecer a qualidade em todas as etapas do ciclo de desenvolvimento, alinhando negócio, tecnologia e experiência do usuário."*

### **🌐 Conecte-se Comigo**

<div align="center">

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/rafael-domingos-aab12060/)
[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Raffadom)

**Vamos conversar sobre Quality Assurance, Desenvolvimento Web e Tecnologia!**

</div>

### **🚀 Sobre Este Projeto**
O **Stop Game Online** é uma demonstração prática das minhas competências em:
- ✅ **Desenvolvimento Full Stack** (React + Node.js + Socket.IO + Firebase)
- ✅ **Testes Automatizados** (Cypress E2E implementados)
- ✅ **Qualidade de Software** (tratamento de edge cases, validações, UX)
- ✅ **DevOps** (estrutura de deploy, monitoring, documentação)
- ✅ **Colaboração** (código limpo, documentação detalhada, boas práticas)

Confira outros projetos no meu [GitHub](https://github.com/Raffadom) e conecte-se no [LinkedIn](https://www.linkedin.com/in/rafael-domingos-aab12060/) para oportunidades de **colaboração, networking e troca de experiências** em QA e desenvolvimento!

---

**⭐ Se você gostou do projeto, deixe uma estrela no GitHub e compartilhe com seus amigos!**

*"A tecnologia é melhor quando aproxima as pessoas."* - Matt Mullenweg