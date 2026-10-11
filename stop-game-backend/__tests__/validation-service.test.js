const { normalize, validateAnswer } = require('../validation-service');

describe('validation service', () => {
    it('normalizes Portuguese accents and casing', () => {
        expect(normalize('  Árvore  ')).toBe('arvore');
    });

    it('rejects empty answers before calling the API', async () => {
        const client = { get: jest.fn() };

        await expect(validateAnswer({ answer: '', letter: 'A', theme: 'Animal', client }))
            .resolves.toMatchObject({ status: 'invalid', reason: 'Resposta vazia' });
        expect(client.get).not.toHaveBeenCalled();
    });

    it('rejects one-character answers before calling the API', async () => {
        const client = { get: jest.fn() };

        await expect(validateAnswer({ answer: 'A', letter: 'A', theme: 'Nome', client }))
            .resolves.toMatchObject({ status: 'invalid', reason: 'Resposta deve ter pelo menos duas letras' });
        expect(client.get).not.toHaveBeenCalled();
    });

    it('rejects answers with a different initial locally', async () => {
        const client = { get: jest.fn() };

        await expect(validateAnswer({ answer: 'Casa', letter: 'A', theme: 'Cidade', client }))
            .resolves.toMatchObject({ status: 'invalid' });
        expect(client.get).not.toHaveBeenCalled();
    });

    it('accepts an exact Datamuse match for general themes', async () => {
        const client = { get: jest.fn().mockResolvedValue({ data: [{ word: 'árvore' }] }) };

        await expect(validateAnswer({ answer: 'Árvore', letter: 'A', theme: 'Planta', client }))
            .resolves.toMatchObject({ status: 'valid', provider: 'datamuse' });
    });

    it('accepts a Brazilian city from IBGE', async () => {
        const client = {
            get: jest.fn().mockResolvedValue({ data: [{ nome: 'Limeira' }] })
        };

        await expect(validateAnswer({ answer: 'Limeira', letter: 'L', theme: 'Cidade', client }))
            .resolves.toMatchObject({ status: 'valid', provider: 'ibge' });
    });

    it('accepts a country through the translated local catalog', async () => {
        const client = { get: jest.fn() };

        await expect(validateAnswer({ answer: 'Itália', letter: 'I', theme: 'País', client }))
            .resolves.toMatchObject({ status: 'valid', provider: 'i18n-iso-countries' });
        expect(client.get).not.toHaveBeenCalled();
    });

    it('accepts Holanda as an alias for Países Baixos', async () => {
        const client = { get: jest.fn() };

        await expect(validateAnswer({ answer: 'Holanda', letter: 'H', theme: 'País', client }))
            .resolves.toMatchObject({ status: 'valid' });
    });

    it('accepts common country abbreviations without calling an API', async () => {
        const client = { get: jest.fn() };

        await expect(validateAnswer({ answer: 'EUA', letter: 'E', theme: 'País', client }))
            .resolves.toMatchObject({ status: 'valid', provider: 'i18n-iso-countries' });
        expect(client.get).not.toHaveBeenCalled();
    });

    it('accepts Brazilian states with accents optional', async () => {
        const client = { get: jest.fn() };

        await expect(validateAnswer({ answer: 'Sao Paulo', letter: 'S', theme: 'Estado', client }))
            .resolves.toMatchObject({ status: 'valid', provider: 'local-brazilian-states' });
        expect(client.get).not.toHaveBeenCalled();
    });

    it('accepts common brands without using a generic word API', async () => {
        const client = { get: jest.fn() };

        await expect(validateAnswer({ answer: 'Samsung', letter: 'S', theme: 'Marca', client }))
            .resolves.toMatchObject({ status: 'valid', provider: 'local-brands' });
        expect(client.get).not.toHaveBeenCalled();
    });

    it('validates the stable catalog themes locally', async () => {
        const client = { get: jest.fn() };
        const cases = [
            ['Azul', 'A', 'Cor'],
            ['Banana', 'B', 'Fruta'],
            ['Caneta', 'C', 'Objeto'],
            ['Cristo Redentor', 'C', 'Ponto turístico'],
            ['Professor', 'P', 'Profissão'],
            ['Brigadeiro', 'B', 'Doce']
        ];

        for (const [answer, letter, theme] of cases) {
            await expect(validateAnswer({ answer, letter, theme, client }))
                .resolves.toMatchObject({ status: 'valid' });
        }
        expect(client.get).not.toHaveBeenCalled();
    });

    it('accepts a subjective answer without querying a word API', async () => {
        const client = { get: jest.fn() };

        await expect(validateAnswer({
            answer: 'Amorosa',
            letter: 'A',
            theme: 'Minha sogra é?',
            client
        })).resolves.toMatchObject({ status: 'valid', provider: 'subjective-answer' });
        expect(client.get).not.toHaveBeenCalled();
    });

    it('uses IBGE names for the Nome theme', async () => {
        const client = { get: jest.fn().mockResolvedValue({ data: [{ nome: 'Walace', freq: 1 }] }) };

        await expect(validateAnswer({ answer: 'Walace', letter: 'W', theme: 'Nome', client }))
            .resolves.toMatchObject({ status: 'valid', provider: 'ibge-names' });
    });

    it('uses ViaCEP for numeric CEP answers', async () => {
        const client = { get: jest.fn().mockResolvedValue({ data: { cep: '01001-000', logradouro: 'Praça da Sé' } }) };

        await expect(validateAnswer({
            answer: '01001000',
            letter: 'A',
            theme: 'CEP (Cidade, Estado, País)',
            client
        })).resolves.toMatchObject({ status: 'valid', provider: 'viacep' });
    });

    it('uses TVMaze for a title outside the local media catalog', async () => {
        const client = { get: jest.fn().mockResolvedValue({ data: [{ show: { name: 'Lost' } }] }) };

        await expect(validateAnswer({
            answer: 'Lost',
            letter: 'L',
            theme: 'Filme, séries e novelas',
            client
        })).resolves.toMatchObject({ status: 'valid', provider: 'tvmaze' });
    });

    it('uses TheMealDB for a dish outside the local catalog', async () => {
        const client = { get: jest.fn().mockResolvedValue({ data: { meals: [{ strMeal: 'Ramen' }] } }) };

        await expect(validateAnswer({ answer: 'Ramen', letter: 'R', theme: 'Prato de comida', client }))
            .resolves.toMatchObject({ status: 'valid', provider: 'themealdb' });
    });

    it('accepts Hipopotamo when accents are optional', async () => {
        const client = { get: jest.fn().mockResolvedValue({ data: [{ word: 'hipopótamo' }] }) };

        await expect(validateAnswer({ answer: 'Hipopotamo', letter: 'H', theme: 'Animal', client }))
            .resolves.toMatchObject({ status: 'valid' });
    });

    it('accepts lowercase rinoceronte from the local animal catalog', async () => {
        const client = { get: jest.fn() };

        await expect(validateAnswer({ answer: 'rinoceronte', letter: 'R', theme: 'Animal', client }))
            .resolves.toMatchObject({ status: 'valid', provider: 'local-animals' });
        expect(client.get).not.toHaveBeenCalled();
    });

    it('accepts uppercase and lowercase animal answers equally', async () => {
        const client = { get: jest.fn() };

        await expect(validateAnswer({ answer: 'RINOCERONTE', letter: 'R', theme: 'Animal', client }))
            .resolves.toMatchObject({ status: 'valid' });
    });

    it('rejects missing accents when the administrator requires them', async () => {
        const client = { get: jest.fn().mockResolvedValue({ data: [{ word: 'hipopótamo' }] }) };

        await expect(validateAnswer({ answer: 'Hipopotamo', letter: 'H', theme: 'Animal', requireAccents: true, client }))
            .resolves.toMatchObject({ status: 'invalid' });
    });

    it('falls back to OpenStreetMap for a non-Brazilian city', async () => {
        const client = {
            get: jest.fn()
                .mockResolvedValueOnce({ data: [] })
                .mockResolvedValueOnce({ data: [{ address: { city: 'Roma' } }] })
        };

        await expect(validateAnswer({ answer: 'Roma', letter: 'R', theme: 'Cidade', client }))
            .resolves.toMatchObject({ status: 'valid', provider: 'nominatim' });
    });

    it('falls back to OpenStreetMap when IBGE is unavailable', async () => {
        const client = {
            get: jest.fn()
                .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
                .mockResolvedValueOnce({ data: [{ name: 'Roma', address: {} }] })
        };

        await expect(validateAnswer({ answer: 'Roma', letter: 'R', theme: 'Cidade', client }))
            .resolves.toMatchObject({ status: 'valid', provider: 'nominatim' });
    });

    it('returns invalid when the API has no exact match', async () => {
        const client = { get: jest.fn().mockResolvedValue({ data: [{ word: 'aviãozinho' }] }) };

        await expect(validateAnswer({ answer: 'Avião', letter: 'A', theme: 'Objeto', client }))
            .resolves.toMatchObject({ status: 'invalid' });
    });

    it('returns failed when the API cannot be reached', async () => {
        const client = { get: jest.fn().mockRejectedValue({ code: 'ETIMEDOUT' }) };

        await expect(validateAnswer({ answer: 'Árvore', letter: 'A', theme: 'Planta', client }))
            .resolves.toMatchObject({ status: 'failed', errorCode: 'ETIMEDOUT' });
    });

    it('does not mistake a provider outage for an invalid answer', async () => {
        const client = { get: jest.fn().mockRejectedValue({ code: 'ECONNRESET' }) };

        await expect(validateAnswer({ answer: 'Arvore', letter: 'A', theme: 'Tema livre', client }))
            .resolves.toMatchObject({ status: 'failed', errorCode: 'ECONNRESET' });
    });
});
