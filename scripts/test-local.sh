#!/bin/bash
# Script para executar testes localmente

echo "🚀 Iniciando pipeline de testes local..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para mostrar status
show_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        exit 1
    fi
}

# 1. Instalar dependências
echo -e "${YELLOW}📦 Instalando dependências...${NC}"
npm run install:all
show_status $? "Dependências instaladas"

# 2. Lint do frontend
echo -e "${YELLOW}🔍 Executando lint do frontend...${NC}"
cd stop-game-frontend && npm run lint
show_status $? "Lint do frontend"
cd ..

# 3. Testes unitários do frontend
echo -e "${YELLOW}🧪 Executando testes unitários do frontend...${NC}"
cd stop-game-frontend && npm run test:unit
show_status $? "Testes unitários do frontend"
cd ..

# 4. Testes unitários do backend
echo -e "${YELLOW}🧪 Executando testes unitários do backend...${NC}"
cd stop-game-backend && npm run test:unit
show_status $? "Testes unitários do backend"
cd ..

# 5. Build do frontend
echo -e "${YELLOW}🏗️ Fazendo build do frontend...${NC}"
cd stop-game-frontend && npm run build
show_status $? "Build do frontend"
cd ..

# 6. Testes E2E (opcional - requer servidores rodando)
if [ "$1" == "--e2e" ]; then
    echo -e "${YELLOW}🌐 Executando testes E2E...${NC}"
    
    # Iniciar backend em background
    cd stop-game-backend && npm start &
    BACKEND_PID=$!
    
    # Iniciar frontend em background  
    cd ../stop-game-frontend && npm run preview &
    FRONTEND_PID=$!
    
    # Aguardar servidores
    sleep 10
    
    # Executar testes Cypress
    cd ..
    npx cypress run --env environment=local
    E2E_STATUS=$?
    
    # Matar processos
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    
    show_status $E2E_STATUS "Testes E2E"
fi

echo -e "${GREEN}🎉 Pipeline de testes local concluído com sucesso!${NC}"