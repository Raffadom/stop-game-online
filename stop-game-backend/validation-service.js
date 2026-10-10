const axios = require('axios');
const countries = require('i18n-iso-countries');
const portugueseLocale = require('i18n-iso-countries/langs/pt.json');

const DEFAULT_API_URL = 'https://api.datamuse.com/words';
const IBGE_CITIES_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const COMMON_ANIMALS = [
    'abelha', 'águia', 'aranha', 'avestruz', 'baleia', 'barata', 'beija-flor',
    'besouro', 'boi', 'borboleta', 'búfalo', 'cachorro', 'camarão', 'camelo',
    'canguru', 'capivara', 'caracol', 'caranguejo', 'castor', 'cavalo', 'cebra',
    'chimpanzé', 'coala', 'cobra', 'coelho', 'coruja', 'crocodilo', 'cupim',
    'doninha', 'elefante', 'escorpião', 'falcão', 'flamingo', 'formiga', 'foca',
    'galo', 'gamba', 'gato', 'girafa', 'golfinho', 'gorila', 'grilo', 'hamster',
    'hipopótamo', 'iguana', 'jacaré', 'javali', 'joaninha', 'lagarta', 'lagarto',
    'leão', 'leopardo', 'lhama', 'lobo', 'lontra', 'macaco', 'mamute', 'mariposa',
    'morcego', 'mosca', 'mosquito', 'ovelha', 'panda', 'pantera', 'papagaio',
    'pato', 'pavão', 'peixe', 'pelicano', 'pinguim', 'porco', 'preguiça', 'pulga',
    'rato', 'rinoceronte', 'robalo', 'sapo', 'serpente', 'tamanduá', 'tartaruga',
    'tatu', 'tigre', 'tubarão', 'urso', 'vaca', 'veado', 'zebra'
];

countries.registerLocale(portugueseLocale);

function normalize(value) {
    if (typeof value !== 'string') return '';
    return value
        .trim()
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function normalizeWithAccents(value) {
    if (typeof value !== 'string') return '';
    return value.trim().toLocaleLowerCase('pt-BR');
}

function matchesAnswer(candidate, answer, requireAccents = false) {
    if (requireAccents) {
        return normalizeWithAccents(candidate) === normalizeWithAccents(answer);
    }
    return normalize(candidate) === normalize(answer);
}

function startsWithLetter(answer, letter) {
    const normalizedAnswer = normalize(answer);
    const normalizedLetter = normalize(letter);
    return Boolean(normalizedAnswer && normalizedLetter && normalizedAnswer.startsWith(normalizedLetter));
}

function isTheme(theme, ...names) {
    const normalizedTheme = normalize(theme);
    return names.some(name => normalizedTheme === normalize(name));
}

function validResult(reason, provider) {
    return { status: 'valid', reason, provider };
}

function invalidResult(reason, provider) {
    return { status: 'invalid', reason, provider };
}

function failedResult(provider, error) {
    return {
        status: 'failed',
        reason: 'Não foi possível consultar a fonte de validação',
        provider,
        errorCode: error.code || (error.response && error.response.status) || 'UNKNOWN',
        errorMessage: error.message
    };
}

async function validateBrazilianCity(answer, client, timeout, requireAccents) {
    try {
        const response = await client.get(IBGE_CITIES_URL, {
            params: { nome: answer },
            timeout
        });
        const cities = Array.isArray(response.data) ? response.data : [];
        const exactMatch = cities.some(city => matchesAnswer(city.nome, answer, requireAccents));
        return exactMatch
            ? validResult('Município encontrado no IBGE', 'ibge')
            : invalidResult('Cidade não encontrada no IBGE', 'ibge');
    } catch (error) {
        return failedResult('ibge', error);
    }
}

function validateCountry(answer, requireAccents) {
    const countryNames = countries.getNames('pt', { select: 'official' });
    const aliases = {
        holanda: 'Países Baixos',
        holland: 'Países Baixos'
    };
    const names = [...Object.values(countryNames), ...Object.values(aliases), ...Object.keys(aliases)];
    const exactMatch = names.some(name => matchesAnswer(name, answer, requireAccents));

    return exactMatch
        ? validResult('País encontrado no catálogo traduzido', 'i18n-iso-countries')
        : invalidResult('País não encontrado no catálogo traduzido', 'i18n-iso-countries');
}

async function validateGlobalCity(answer, client, timeout, requireAccents) {
    try {
        const response = await client.get(NOMINATIM_URL, {
            params: {
                q: answer,
                format: 'jsonv2',
                addressdetails: 1,
                limit: 10
            },
            headers: { 'User-Agent': 'stop-game-online/1.0' },
            timeout
        });
        const places = Array.isArray(response.data) ? response.data : [];
        const exactMatch = places.some(place => {
            const address = place.address || {};
            const placeNames = [address.city, address.town, address.village, address.municipality, address.county];
            return placeNames.some(name => matchesAnswer(name, answer, requireAccents));
        });
        return exactMatch
            ? validResult('Cidade encontrada no OpenStreetMap', 'nominatim')
            : invalidResult('Cidade não encontrada no OpenStreetMap', 'nominatim');
    } catch (error) {
        return failedResult('nominatim', error);
    }
}

async function validateAnswer({ answer, letter, theme, requireAccents = false, timeout = 4000, client = axios }) {
    const normalizedAnswer = normalize(answer);
    const normalizedLetter = normalize(letter);

    if (!normalizedAnswer) {
        return { status: 'invalid', reason: 'Resposta vazia' };
    }

    if ([...normalizedAnswer].length < 2) {
        return { status: 'invalid', reason: 'Resposta deve ter pelo menos duas letras' };
    }

    if (!startsWithLetter(normalizedAnswer, normalizedLetter)) {
        return { status: 'invalid', reason: `Resposta não começa com a letra ${letter}` };
    }

    if (isTheme(theme, 'País', 'Pais')) {
        return validateCountry(answer, requireAccents);
    }

    if (isTheme(theme, 'Cidade')) {
        const brazilianResult = await validateBrazilianCity(answer, client, timeout, requireAccents);
        if (brazilianResult.status !== 'invalid') return brazilianResult;
        return validateGlobalCity(answer, client, timeout, requireAccents);
    }

    if (isTheme(theme, 'Animal')) {
        const knownAnimal = COMMON_ANIMALS.some(animal => matchesAnswer(animal, answer, requireAccents));
        if (knownAnimal) {
            return validResult('Animal encontrado no catálogo local', 'local-animals');
        }
    }

    try {
        const response = await client.get(process.env.VALIDATION_API_URL || DEFAULT_API_URL, {
            params: {
                sp: normalizedAnswer,
                max: 5
            },
            timeout
        });

        const words = Array.isArray(response.data) ? response.data : [];
        const exactMatch = words.some(word => matchesAnswer(word.word, answer, requireAccents));

        return {
            status: exactMatch ? 'valid' : 'invalid',
            reason: exactMatch ? `Resposta encontrada para o tema ${theme}` : 'Resposta não encontrada na API',
            provider: 'datamuse'
        };
    } catch (error) {
        return failedResult('datamuse', error);
    }
}

module.exports = {
    normalize,
    normalizeWithAccents,
    validateAnswer
};
