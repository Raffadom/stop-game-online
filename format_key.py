import json
import os

# Substitua 'seu-arquivo-de-credenciais.json' pelo nome real do seu arquivo JSON
# Ex: 'stopgamebackend-12345-firebase-adminsdk-abx12.json'
FIREBASE_JSON_PATH = 'stopgamebackend-firebase-adminsdk-fbsvc-98bb158f26.json'

# Verifique se o arquivo existe
if not os.path.exists(FIREBASE_JSON_PATH):
    print(f"Erro: O arquivo '{FIREBASE_JSON_PATH}' não foi encontrado.")
    print("Certifique-se de que o nome do arquivo está correto e que ele está na mesma pasta que este script.")
else:
    try:
        with open(FIREBASE_JSON_PATH, 'r') as f:
            service_account_info = json.load(f)

        project_id = service_account_info['project_id']
        private_key = service_account_info['private_key']
        client_email = service_account_info['client_email']

        # Imprime as linhas que você deve COPIAR e COLAR no seu .env
        print("\n--- COPIE E COLE ESTAS LINHAS NO SEU ARQUIVO .env (DO SEU BACKEND) ---")
        print(f'FIREBASE_PROJECT_ID="{project_id}"')
        print(f'FIREBASE_PRIVATE_KEY="{private_key}"')
        print(f'FIREBASE_CLIENT_EMAIL="{client_email}"')
        print("----------------------------------------------------------------------\n")
        print("Lembre-se de deletar o arquivo .env antigo e criar um novo com este conteúdo.")
        print("E garanta que 'require(\'dotenv\').config();' é a primeira linha do seu index.js.")

    except Exception as e:
        print(f"Erro ao processar o arquivo JSON: {e}")
        print("Certifique-se de que o arquivo JSON não está corrompido.")