# 🧪 Pipeline de Testes - Stop Game Online

Este documento descreve a estratégia de testes e como executar o pipeline completo do projeto Stop Game Online.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Tipos de Teste](#tipos-de-teste)
- [Estrutura do Pipeline](#estrutura-do-pipeline)
- [Executando Localmente](#executando-localmente)
- [CI/CD no GitHub Actions](#cicd-no-github-actions)
- [Configuração de Ambiente](#configuração-de-ambiente)
- [Troubleshooting](#troubleshooting)

## 🎯 Visão Geral

O projeto possui uma estratégia de testes em três camadas:

1. **Unit Tests** - Testes de componentes e lógica isolada
2. **Integration Tests** - Testes de APIs e Socket.io
3. **E2E Tests** - Testes de fluxo completo com Cypress

### Tecnologias Utilizadas

- **Frontend**: Vitest + Testing Library (React)
- **Backend**: Jest + Supertest 
- **E2E**: Cypress
- **CI/CD**: GitHub Actions

## 🧪 Tipos de Teste

### Unit Tests - Frontend (Vitest)
```bash
cd stop-game-frontend
npm run test:unit        # Executa uma vez
npm run test:watch       # Modo watch
npm run test:coverage    # Com relatório de cobertura
```

**Arquivos de teste**: `src/**/*.{test,spec}.{js,jsx}`

### Unit Tests - Backend (Jest)
```bash
cd stop-game-backend
npm run test:unit           # Executa com cobertura
npm run test:watch          # Modo watch
npm run test:integration    # Apenas testes de integração
```

**Arquivos de teste**: `__tests__/**/*.{test,spec}.js`

### E2E Tests (Cypress)
```bash
# Interface gráfica
npm run cypress:open

# Headless
npm run cypress:run
npm run cypress:run:chrome   # Chrome específico
npm run cypress:run:firefox  # Firefox específico

# Para CI
npm run cypress:run:ci       # Com relatórios JSON
```

**Arquivos de teste**: `cypress/e2e/**/*.cy.js`

## 🚀 Estrutura do Pipeline

### Pipeline Local
1. ✅ Instalação de dependências
2. 🔍 Lint (ESLint)
3. 🧪 Testes unitários (Frontend + Backend)
4. 🏗️ Build do frontend
5. 🌐 Testes E2E (opcional)

### Pipeline CI/CD (GitHub Actions)
1. **Setup** - Instalação e cache de dependências
2. **Lint** - Verificação de qualidade de código
3. **Unit Tests** - Paralelo (Frontend + Backend)
4. **Security** - Auditoria de vulnerabilidades
5. **E2E Tests** - Matrix (Chrome/Firefox + Desktop/Mobile)
6. **Performance** - Lighthouse CI (apenas main)
7. **Deploy** - Deploy automático (apenas main)

## 💻 Executando Localmente

### Método 1: Script Automático

**Windows:**
```bash
.\scripts\test-local.bat
```

**Linux/Mac:**
```bash
chmod +x scripts/test-local.sh
./scripts/test-local.sh

# Com E2E tests
./scripts/test-local.sh --e2e
```

### Método 2: Comandos Individuais

```bash
# 1. Instalar todas as dependências
npm run install:all

# 2. Executar todos os testes unitários
npm test

# 3. Executar apenas frontend
npm run test:frontend

# 4. Executar apenas backend
npm run test:backend

# 5. Build e preview
npm run build:frontend

# 6. Testes E2E (requer servidores rodando)
npm run test:e2e
```

### Método 3: Desenvolvimento Paralelo

```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend  
npm run dev:frontend

# Terminal 3 - Testes E2E
npm run cypress:open
```

## ⚙️ Configuração de Ambiente

### Variáveis de Ambiente

Copie o arquivo de exemplo:
```bash
cp cypress.env.example cypress.env.json
```

### Configurações por Ambiente

**Local (desenvolvimento):**
- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Cypress: Modo interativo

**CI (GitHub Actions):**
- Frontend: http://localhost:4173 (preview)
- Backend: http://localhost:3000
- Cypress: Headless com vídeos

**Production:**
- Frontend: https://stop-paper.netlify.app
- Cypress: Smoke tests

### Firebase/Backend

Configure as variáveis no `.env`:
```env
GOOGLE_APPLICATION_CREDENTIALS_JSON={"project_id":"..."}
```

## 🔧 CI/CD no GitHub Actions

### Workflow Triggers

- **Push** para `main` ou `develop`
- **Pull Request** para `main` ou `develop`
- **Manual** via GitHub UI

### Jobs Executados

| Job | Função | Duração Aprox. |
|-----|---------|----------------|
| setup | Cache de dependências | 2-3 min |
| lint | Verificação de código | 1-2 min |
| unit-tests-frontend | Testes React | 2-4 min |
| unit-tests-backend | Testes Node.js | 1-3 min |
| e2e-tests | Testes Cypress (matrix) | 5-10 min |
| security | Auditoria npm | 1-2 min |
| performance | Lighthouse (main only) | 3-5 min |
| deploy | Deploy Netlify (main only) | 2-3 min |

### Secrets Necessários

Configure no GitHub (Settings > Secrets):

```
NETLIFY_AUTH_TOKEN=your_netlify_token
NETLIFY_SITE_ID=your_site_id
LHCI_GITHUB_APP_TOKEN=lighthouse_token
GOOGLE_APPLICATION_CREDENTIALS_JSON=firebase_credentials
```

## 📊 Relatórios e Cobertura

### Cobertura de Código

```bash
# Frontend
cd stop-game-frontend && npm run test:coverage

# Backend  
cd stop-game-backend && npm run test:unit
```

Relatórios gerados em:
- `stop-game-frontend/coverage/`
- `stop-game-backend/coverage/`

### Relatórios Cypress

```bash
npm run cypress:run:ci
```

Relatórios em:
- `cypress/videos/` - Vídeos dos testes
- `cypress/screenshots/` - Screenshots de falhas
- `cypress/results/` - Relatórios JSON

## 🐛 Troubleshooting

### Problemas Comuns

**1. Cypress não encontra elementos**
```bash
# Verificar se o baseUrl está correto
npx cypress run --config baseUrl=http://localhost:5173
```

**2. Testes de socket falhando**
```bash
# Verificar se o backend está rodando
cd stop-game-backend && npm start
```

**3. Build do frontend falhando**
```bash
# Limpar cache e reinstalar
cd stop-game-frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

**4. Testes unitários falhando no CI**
```bash
# Verificar se todas as dependências estão no package.json
npm run install:all
```

### Debug no CI

Adicione debug nos workflows:
```yaml
- name: Debug Environment
  run: |
    echo "Node version: $(node --version)"
    echo "NPM version: $(npm --version)"
    echo "Current directory: $(pwd)"
    ls -la
```

### Logs Úteis

```bash
# Cypress debug
DEBUG=cypress:* npm run cypress:run

# Vitest verbose
npm run test:unit -- --reporter=verbose

# Jest verbose
cd stop-game-backend && npm test -- --verbose
```

## 📈 Métricas e Monitoramento

### Métricas de Teste

- **Cobertura mínima**: 70%
- **Tempo máximo E2E**: 10 minutos
- **Taxa de sucesso**: 95%+

### Monitoramento

- GitHub Actions dashboard
- Netlify deploy logs
- Cypress dashboard (se configurado)

## 🚀 Próximos Passos

1. **Component Testing** - Adicionar testes de componentes Cypress
2. **Visual Testing** - Screenshots comparativos
3. **Performance Budget** - Limites de performance
4. **Parallel E2E** - Execução paralela no CI
5. **Test Data Management** - Dados de teste isolados

---

## 📞 Suporte

Para problemas específicos:
1. Verifique os logs no GitHub Actions
2. Execute localmente para reproduzir
3. Consulte a documentação das ferramentas:
   - [Vitest](https://vitest.dev/)
   - [Jest](https://jestjs.io/)
   - [Cypress](https://cypress.io/)
   - [GitHub Actions](https://docs.github.com/en/actions)