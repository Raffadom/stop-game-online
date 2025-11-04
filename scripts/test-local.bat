@echo off
rem Script para executar testes localmente no Windows

echo 🚀 Iniciando pipeline de testes local...

rem 1. Instalar dependências
echo 📦 Instalando dependências...
call npm run install:all
if %errorlevel% neq 0 (
    echo ❌ Erro ao instalar dependências
    exit /b 1
)
echo ✅ Dependências instaladas

rem 2. Lint do frontend
echo 🔍 Executando lint do frontend...
cd stop-game-frontend
call npm run lint
if %errorlevel% neq 0 (
    echo ❌ Erro no lint do frontend
    exit /b 1
)
echo ✅ Lint do frontend passou
cd ..

rem 3. Testes unitários do frontend
echo 🧪 Executando testes unitários do frontend...
cd stop-game-frontend
call npm run test:unit
if %errorlevel% neq 0 (
    echo ❌ Erro nos testes unitários do frontend
    exit /b 1
)
echo ✅ Testes unitários do frontend passaram
cd ..

rem 4. Testes unitários do backend
echo 🧪 Executando testes unitários do backend...
cd stop-game-backend
call npm run test:unit
if %errorlevel% neq 0 (
    echo ❌ Erro nos testes unitários do backend
    exit /b 1
)
echo ✅ Testes unitários do backend passaram
cd ..

rem 5. Build do frontend
echo 🏗️ Fazendo build do frontend...
cd stop-game-frontend
call npm run build
if %errorlevel% neq 0 (
    echo ❌ Erro no build do frontend
    exit /b 1
)
echo ✅ Build do frontend concluído
cd ..

echo 🎉 Pipeline de testes local concluído com sucesso!