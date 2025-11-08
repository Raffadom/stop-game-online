#!/bin/bash
# Script específico para executar Cypress no CI

set -e  # Exit on any error

echo "🔧 Preparing Cypress for CI environment..."

# Verificar Node.js
echo "📋 Node.js version: $(node --version)"
echo "📋 NPM version: $(npm --version)"

# Definir caminho do Cypress
CYPRESS_BIN="./node_modules/.bin/cypress"

# Verificar se o Cypress está instalado
echo "🔍 Checking Cypress installation..."
if [ ! -f "$CYPRESS_BIN" ]; then
    echo "❌ Cypress binary not found at $CYPRESS_BIN"
    exit 1
fi

# Verificar binário do Cypress
echo "✅ Verifying Cypress binary..."
$CYPRESS_BIN verify

# Verificar versão
echo "� Cypress version:"
$CYPRESS_BIN version

# Aguardar servidores
echo "⏳ Waiting for servers to be ready..."
timeout 120 bash -c 'until curl -f http://localhost:3001 && curl -f http://localhost:4173; do sleep 2; done' || {
    echo "❌ Servers failed to start within timeout"
    echo "🔍 Checking server status:"
    curl -I http://localhost:3001 || echo "Backend not responding"
    curl -I http://localhost:4173 || echo "Frontend not responding"
    exit 1
}

# Criar diretório de resultados se não existir
mkdir -p cypress/results

# Configurar display se não estiver definido
export DISPLAY=${DISPLAY:-:99}

# Executar testes
echo "🧪 Running Cypress tests..."
$CYPRESS_BIN run \
    --browser chrome \
    --headless \
    --config baseUrl=http://localhost:4173 \
    --env environment=ci \
    --reporter json \
    --reporter-options output=cypress/results/results.json || {
    echo "❌ Cypress tests failed"
    echo "🔍 Cypress debug info:"
    $CYPRESS_BIN version
    ls -la ~/.cache/Cypress/ || echo "No Cypress cache found"
    exit 1
}

echo "✅ Cypress tests completed successfully!"