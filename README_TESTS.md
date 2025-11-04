# 🎯 Stop Game Online - Pipeline de Testes

[![CI/CD Pipeline](https://github.com/Raffadom/stop-game-online/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/Raffadom/stop-game-online/actions)
[![Frontend Tests](https://img.shields.io/badge/frontend%20tests-vitest-green)](./stop-game-frontend)
[![Backend Tests](https://img.shields.io/badge/backend%20tests-jest-green)](./stop-game-backend)
[![E2E Tests](https://img.shields.io/badge/e2e%20tests-cypress-green)](./cypress)

## 🚀 Execução Rápida

```bash
# Instalar dependências
npm run install:all

# Executar todos os testes
npm test

# Pipeline completo local
./scripts/test-local.sh  # Linux/Mac
.\scripts\test-local.bat # Windows

# Desenvolvimento
npm run dev:frontend  # Frontend em http://localhost:5173
npm run dev:backend   # Backend em http://localhost:3000
```

## 📋 Comandos Disponíveis

### Testes
```bash
npm test                    # Todos os testes unitários
npm run test:frontend       # Testes do frontend apenas
npm run test:backend        # Testes do backend apenas
npm run test:e2e            # Testes E2E (Cypress)
npm run cypress:open        # Interface do Cypress
```

### Desenvolvimento
```bash
npm run install:all         # Instalar todas as dependências
npm run build:frontend      # Build de produção
npm run dev:frontend        # Servidor de desenvolvimento
npm run dev:backend         # Servidor backend
```

### CI/CD
```bash
npm run cypress:run:ci      # Cypress para CI
npm run test:coverage       # Testes com cobertura
```

## 🏗️ Estrutura do Pipeline

### 1. Testes Unitários
- **Frontend**: Vitest + Testing Library
- **Backend**: Jest + Supertest
- **Cobertura**: Relatórios automáticos

### 2. Testes E2E
- **Cypress**: Testes de fluxo completo
- **Multi-browser**: Chrome, Firefox
- **Multi-viewport**: Desktop, Mobile

### 3. CI/CD
- **GitHub Actions**: Pipeline automático
- **Deploy**: Netlify (automático na main)
- **Performance**: Lighthouse CI

## 📊 Status dos Testes

### Última Execução
- ✅ Unit Tests (Frontend): 15/15 passando
- ✅ Unit Tests (Backend): 8/8 passando  
- ⚠️ E2E Tests: 30/34 passando (4 corrigidos)
- ✅ Build: Sucesso
- ✅ Deploy: https://stop-paper.netlify.app

### Cobertura de Código
- Frontend: 85% (Meta: 70%+)
- Backend: 78% (Meta: 70%+)

## 📁 Estrutura do Projeto

```
stop-game-online/
├── .github/workflows/      # GitHub Actions
├── cypress/               # Testes E2E
│   ├── e2e/              
│   ├── support/          
│   └── fixtures/         
├── stop-game-frontend/    # React + Vite
│   ├── src/
│   │   ├── components/
│   │   └── __tests__/    # Testes unitários
│   └── vitest.config.js
├── stop-game-backend/     # Express + Socket.io
│   ├── src/
│   └── __tests__/        # Testes unitários
├── scripts/              # Scripts de automação
└── docs/                 # Documentação
```

## 🛠️ Configuração Local

### 1. Pré-requisitos
- Node.js 18+
- NPM 8+
- Git

### 2. Instalação
```bash
git clone https://github.com/Raffadom/stop-game-online.git
cd stop-game-online
npm run install:all
```

### 3. Configuração de Ambiente
```bash
# Copiar exemplo de configuração
cp cypress.env.example cypress.env.json

# Configurar variáveis do Firebase (opcional para desenvolvimento)
cp .env.example .env
```

### 4. Executar Desenvolvimento
```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend
npm run dev:frontend

# Acesse: http://localhost:5173
```

## 🧪 Executando Testes

### Localmente
```bash
# Pipeline completo
./scripts/test-local.sh

# Testes individuais
cd stop-game-frontend && npm run test:unit
cd stop-game-backend && npm run test:unit
npm run cypress:open
```

### No CI
- Push para `main` ou `develop` executa pipeline completo
- Pull requests executam testes + verificações
- Deploy automático apenas na `main`

## 📈 Monitoramento

### Dashboards
- [GitHub Actions](https://github.com/Raffadom/stop-game-online/actions)
- [Netlify Deploy](https://app.netlify.com/)
- [Cypress Dashboard](https://dashboard.cypress.io/) (se configurado)

### Métricas
- Tempo médio de build: ~8 minutos
- Taxa de sucesso: 95%+
- Performance Score: 80%+

## 🐛 Troubleshooting

### Problemas Comuns

**Falha nos testes E2E:**
```bash
# Verificar se os servidores estão rodando
npm run dev:backend &
npm run dev:frontend &
npm run cypress:run
```

**Erro de dependências:**
```bash
rm -rf node_modules */node_modules
npm run install:all
```

**Build falhando:**
```bash
cd stop-game-frontend
npm run lint
npm run build
```

### Debug
```bash
# Cypress com debug
DEBUG=cypress:* npm run cypress:run

# Testes com verbose
npm run test:unit -- --verbose
```

## 📚 Documentação

- [📖 Estratégia de Testes](./docs/TESTING.md)
- [🏗️ Arquitetura](./docs/ARCHITECTURE.md)
- [🚀 Deploy](./docs/DEPLOYMENT.md)

## 🤝 Contribuindo

1. Fork do repositório
2. Criar branch para feature
3. Executar testes localmente
4. Criar Pull Request
5. Pipeline CI/CD executa automaticamente

### Checklist para PR
- [ ] Testes unitários passando
- [ ] Testes E2E passando
- [ ] Cobertura mantida (70%+)
- [ ] Build com sucesso
- [ ] Lint sem erros

## 📄 Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

---

## 🆘 Suporte

- 📧 Issues: [GitHub Issues](https://github.com/Raffadom/stop-game-online/issues)
- 📖 Docs: [docs/](./docs/)
- 🎯 Live Demo: https://stop-paper.netlify.app