const axios = require('axios');
const countries = require('i18n-iso-countries');
const portugueseLocale = require('i18n-iso-countries/langs/pt.json');

const DEFAULT_API_URL = 'https://api.datamuse.com/words';
const IBGE_CITIES_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
const IBGE_NAMES_URL = 'https://servicodados.ibge.gov.br/api/v2/censos/nomes';
const VIA_CEP_URL = 'https://viacep.com.br/ws';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const TVMAZE_SEARCH_URL = 'https://api.tvmaze.com/search/shows';
const TMDB_SEARCH_URL = 'https://api.themoviedb.org/3/search/multi';
const MEALDB_SEARCH_URL = 'https://www.themealdb.com/api/json/v1/1/search.php';
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
const BRAZILIAN_STATES = [
    'Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal',
    'Espírito Santo', 'Goiás', 'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul',
    'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí',
    'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia',
    'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins'
];
const COMMON_BRANDS = [
    'Adidas', 'Apple', 'Audi', 'Avon', 'Boticário', 'Brastemp', 'Burger King',
    'Cacau Show', 'Canon', 'Coca-Cola', 'Colgate', 'Dell', 'Dior', 'Disney',
    'Dove', 'Fanta', 'Ferrari', 'Fiat', 'Ford', 'Havaianas', 'Heineken',
    'Honda', 'Hyundai', 'Itaú', 'Kibon', 'Kia', 'Lacoste', 'LG', 'Lego',
    'Lexus', 'McDonald\'s', 'Microsoft', 'Mitsubishi', 'Motorola', 'Nestlé',
    'Netflix', 'Nike', 'Nintendo', 'Nivea', 'Nokia', 'Omo', 'Oral-B', 'Pepsi',
    'Puma', 'Samsung', 'Schin', 'Sony', 'Sadia', 'Skol', 'Subway', 'Tefal',
    'TikTok', 'Toyota', 'Tramontina', 'Uber', 'Unilever', 'Volkswagen', 'Walmart',
    'Xiaomi', 'Yamaha', 'YouTube'
];
const COMMON_COLORS = [
    'amarelo', 'azul', 'bege', 'branco', 'cinza', 'dourado', 'laranja', 'lilás',
    'marrom', 'preto', 'prata', 'roxo', 'rosa', 'verde', 'vermelho', 'turquesa',
    'violeta', 'ciano', 'magenta', 'creme', 'bordô', 'coral', 'índigo'
];
const COMMON_FRUITS = [
    'abacate', 'abacaxi', 'acerola', 'açaí', 'ameixa', 'amora', 'banana', 'caju',
    'caqui', 'carambola', 'cereja', 'coco', 'figo', 'framboesa', 'goiaba',
    'graviola', 'jabuticaba', 'jaca', 'kiwi', 'laranja', 'limão', 'maçã', 'mamão',
    'manga', 'maracujá', 'melancia', 'melão', 'morango', 'pêra', 'pitanga',
    'tangerina', 'uva'
];
const COMMON_DISHES = [
    'arroz', 'acarajé', 'baião de dois', 'brigadeiro', 'cachorro-quente', 'caldo',
    'coxinha', 'cuscuz', 'escondidinho', 'feijoada', 'lasanha', 'macarrão',
    'moqueca', 'panqueca', 'pastel', 'pizza', 'pão de queijo', 'quibe',
    'risoto', 'salgadinho', 'sanduíche', 'sopa', 'strogonoff', 'tapioca', 'vatapá'
];
const COMMON_MOVIES_AND_SHOWS = [
    'Avatar', 'Batman', 'Breaking Bad', 'Chaves', 'Coringa', 'Friends', 'Frozen',
    'Game of Thrones', 'Harry Potter', 'Homem-Aranha', 'Interestelar', 'Joker',
    'La Casa de Papel', 'Matrix', 'Moana', 'Naruto', 'O Rei Leão', 'Os Simpsons',
    'Pantera Negra', 'Peaky Blinders', 'Shrek', 'Stranger Things', 'Supernatural',
    'The Office', 'Titanic', 'Toy Story', 'Wandinha', 'Wolverine'
];
const COMMON_OBJECTS = [
    'agenda', 'anel', 'armário', 'balão', 'caneta', 'cadeira', 'cama', 'celular',
    'chave', 'chuveiro', 'computador', 'copo', 'escova', 'espelho', 'faca',
    'garfo', 'geladeira', 'guarda-chuva', 'lápis', 'livro', 'mesa', 'mochila',
    'panela', 'papel', 'relógio', 'sacola', 'sapato', 'tesoura', 'televisão',
    'toalha', 'vaso'
];
const COMMON_TOURIST_SPOTS = [
    'Cristo Redentor', 'Pão de Açúcar', 'Pelourinho', 'Praia de Copacabana',
    'Cataratas do Iguaçu', 'Torre Eiffel', 'Big Ben', 'Coliseu', 'Disney',
    'Machu Picchu', 'Maracanã', 'Museu do Louvre', 'Estátua da Liberdade',
    'Times Square', 'Fernando de Noronha'
];
const COMMON_PROFESSIONS = [
    'advogado', 'arquiteto', 'ator', 'biólogo', 'bombeiro', 'cabeleireiro',
    'cantor', 'carpinteiro', 'cientista', 'cozinheiro', 'dentista', 'designer',
    'engenheiro', 'enfermeiro', 'escritor', 'fotógrafo', 'garçom', 'jornalista',
    'médico', 'motorista', 'nutricionista', 'padeiro', 'pedreiro', 'policial',
    'professor', 'programador', 'psicólogo', 'veterinário'
];
const COMMON_SWEETS = [
    'brigadeiro', 'beijinho', 'bolo', 'bombom', 'brownie', 'cajuzinho', 'canjica',
    'caramelo', 'cocada', 'doce de leite', 'gelatina', 'goiabada', 'jujuba',
    'maria-mole', 'marshmallow', 'mousse', 'paçoca', 'pavê', 'pé de moleque',
    'pudim', 'quindim', 'sorvete', 'suspiro', 'torta'
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

function validateFromCatalog(answer, catalog, reason, provider, requireAccents) {
    return catalog.some(item => matchesAnswer(item, answer, requireAccents))
        ? validResult(reason, provider)
        : invalidResult(`Resposta não encontrada no catálogo de ${provider}`, provider);
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
        const exactMatch = cities.some(city =>
            [city.nome, city.name].some(name => matchesAnswer(name, answer, requireAccents))
        );
        return exactMatch
            ? validResult('Município encontrado no IBGE', 'ibge')
            : invalidResult('Cidade não encontrada no IBGE', 'ibge');
    } catch (error) {
        return failedResult('ibge', error);
    }
}

function validateBrazilianState(answer, requireAccents) {
    return validateFromCatalog(
        answer,
        BRAZILIAN_STATES,
        'Estado brasileiro encontrado no catálogo local',
        'local-brazilian-states',
        requireAccents
    );
}

function validateCountry(answer, requireAccents) {
    const countryNames = countries.getNames('pt', { select: 'official' });
    const aliases = {
        holanda: 'Países Baixos',
        holland: 'Países Baixos',
        eua: 'Estados Unidos',
        usa: 'Estados Unidos',
        inglaterra: 'Reino Unido',
        russia: 'Rússia',
        coreia: 'Coreia do Sul',
        emirados: 'Emirados Árabes Unidos'
    };
    const names = [...Object.values(countryNames), ...Object.values(aliases), ...Object.keys(aliases)];
    const exactMatch = names.some(name => matchesAnswer(name, answer, requireAccents));

    return exactMatch
        ? validResult('País encontrado no catálogo traduzido', 'i18n-iso-countries')
        : invalidResult('País não encontrado no catálogo traduzido', 'i18n-iso-countries');
}

function validateBrand(answer, requireAccents) {
    return validateFromCatalog(
        answer,
        COMMON_BRANDS,
        'Marca encontrada no catálogo local',
        'local-brands',
        requireAccents
    );
}

function validateCatalogAnswer(answer, catalog, theme, requireAccents) {
    const result = validateFromCatalog(
        answer,
        catalog,
        `Resposta encontrada no catálogo de ${theme}`,
        `local-${normalize(theme).replace(/\s+/g, '-')}`,
        requireAccents
    );
    return result.status === 'valid' ? result : null;
}

async function validateName(answer, client, timeout, requireAccents) {
    try {
        const response = await client.get(`${IBGE_NAMES_URL}/${encodeURIComponent(answer)}`, { timeout });
        const names = Array.isArray(response.data) ? response.data : [];
        const knownName = names.length > 0 && names.some(item =>
            !item.nome || matchesAnswer(item.nome, answer, requireAccents)
        );
        return knownName
            ? validResult('Nome encontrado no catálogo de nomes do IBGE', 'ibge-names')
            : invalidResult('Nome não encontrado no catálogo de nomes do IBGE', 'ibge-names');
    } catch (error) {
        return failedResult('ibge-names', error);
    }
}

async function validateCep(answer, client, timeout) {
    const cep = normalize(answer).replace(/\D/g, '');
    if (!/^\d{8}$/.test(cep)) {
        return invalidResult('CEP deve conter oito números', 'viacep');
    }

    try {
        const response = await client.get(`${VIA_CEP_URL}/${cep}/json`, { timeout });
        return response.data && !response.data.erro
            ? validResult('CEP encontrado no ViaCEP', 'viacep')
            : invalidResult('CEP não encontrado no ViaCEP', 'viacep');
    } catch (error) {
        return failedResult('viacep', error);
    }
}

async function validateMedia(answer, client, timeout, requireAccents) {
    const localResult = validateCatalogAnswer(answer, COMMON_MOVIES_AND_SHOWS, 'filmes e séries', requireAccents);
    if (localResult) return localResult;

    if (process.env.TMDB_API_KEY) {
        try {
            const response = await client.get(TMDB_SEARCH_URL, {
                params: {
                    api_key: process.env.TMDB_API_KEY,
                    query: answer,
                    language: 'pt-BR',
                    include_adult: false
                },
                timeout
            });
            const results = Array.isArray(response.data && response.data.results) ? response.data.results : [];
            const exactMatch = results.some(item =>
                [item.title, item.name, item.original_title, item.original_name]
                    .some(name => matchesAnswer(name, answer, requireAccents))
            );
            return exactMatch
                ? validResult('Título encontrado no TMDB', 'tmdb')
                : invalidResult('Título não encontrado no TMDB', 'tmdb');
        } catch (error) {
            return failedResult('tmdb', error);
        }
    }

    try {
        const response = await client.get(TVMAZE_SEARCH_URL, { params: { q: answer }, timeout });
        const results = Array.isArray(response.data) ? response.data : [];
        const exactMatch = results.some(item => matchesAnswer(item.show && item.show.name, answer, requireAccents));
        return exactMatch
            ? validResult('Série encontrada no TVMaze', 'tvmaze')
            : invalidResult('Filme ou série não encontrado no TVMaze', 'tvmaze');
    } catch (error) {
        return failedResult('tvmaze', error);
    }
}

async function validateMeal(answer, client, timeout, requireAccents) {
    const localResult = validateCatalogAnswer(answer, [...COMMON_DISHES, ...COMMON_SWEETS], 'comidas', requireAccents);
    if (localResult) return localResult;

    try {
        const response = await client.get(MEALDB_SEARCH_URL, { params: { s: answer }, timeout });
        const meals = Array.isArray(response.data && response.data.meals) ? response.data.meals : [];
        const exactMatch = meals.some(meal => matchesAnswer(meal.strMeal, answer, requireAccents));
        return exactMatch
            ? validResult('Prato encontrado no TheMealDB', 'themealdb')
            : invalidResult('Prato não encontrado no TheMealDB', 'themealdb');
    } catch (error) {
        return failedResult('themealdb', error);
    }
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
            const placeNames = [
                place.name,
                address.city,
                address.town,
                address.village,
                address.municipality,
                address.county
            ];
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
    const isCepTheme = isTheme(theme, 'CEP', 'CEP (Cidade, Estado, País)', 'CEP (Cidade, Estado, Pais)');

    if (!normalizedAnswer) {
        return { status: 'invalid', reason: 'Resposta vazia' };
    }

    if ([...normalizedAnswer].length < 2) {
        return { status: 'invalid', reason: 'Resposta deve ter pelo menos duas letras' };
    }

    if (!isCepTheme && !startsWithLetter(normalizedAnswer, normalizedLetter)) {
        return { status: 'invalid', reason: `Resposta não começa com a letra ${letter}` };
    }

    if (isCepTheme) {
        return validateCep(answer, client, timeout);
    }

    if (isTheme(theme, 'Nome')) {
        return validateName(answer, client, timeout, requireAccents);
    }

    if (isTheme(theme, 'País', 'Pais')) {
        return validateCountry(answer, requireAccents);
    }

    if (isTheme(theme, 'Estado', 'Estados')) {
        return validateBrazilianState(answer, requireAccents);
    }

    if (isTheme(theme, 'Marca', 'Marcas')) {
        return validateBrand(answer, requireAccents);
    }

    if (isTheme(theme, 'Cor', 'Cores')) {
        return validateCatalogAnswer(answer, COMMON_COLORS, 'cores', requireAccents)
            || invalidResult('Cor não encontrada no catálogo local', 'local-colors');
    }

    if (isTheme(theme, 'Fruta', 'Frutas')) {
        return validateCatalogAnswer(answer, COMMON_FRUITS, 'frutas', requireAccents)
            || invalidResult('Fruta não encontrada no catálogo local', 'local-fruits');
    }

    if (isTheme(theme, 'Prato de comida', 'Comida', 'Comidas', 'Prato')) {
        return validateMeal(answer, client, timeout, requireAccents);
    }

    if (isTheme(theme, 'Filme, séries e novelas', 'Filmes e séries', 'Filme', 'Série', 'Novela')) {
        return validateMedia(answer, client, timeout, requireAccents);
    }

    if (isTheme(theme, 'Minha sogra é', 'Minha sogra é?')) {
        return validResult('Resposta subjetiva aceita para o tema', 'subjective-answer');
    }

    if (isTheme(theme, 'Objeto', 'Objetos')) {
        return validateCatalogAnswer(answer, COMMON_OBJECTS, 'objetos', requireAccents)
            || invalidResult('Objeto não encontrado no catálogo local', 'local-objects');
    }

    if (isTheme(theme, 'Ponto turístico', 'Ponto turistico', 'Pontos turísticos', 'Pontos turisticos')) {
        return validateCatalogAnswer(answer, COMMON_TOURIST_SPOTS, 'pontos turísticos', requireAccents)
            || invalidResult('Ponto turístico não encontrado no catálogo local', 'local-tourist-spots');
    }

    if (isTheme(theme, 'Profissão', 'Profissao', 'Profissões', 'Profissoes')) {
        return validateCatalogAnswer(answer, COMMON_PROFESSIONS, 'profissões', requireAccents)
            || invalidResult('Profissão não encontrada no catálogo local', 'local-professions');
    }

    if (isTheme(theme, 'Doce', 'Doces')) {
        return validateCatalogAnswer(answer, COMMON_SWEETS, 'doces', requireAccents)
            || invalidResult('Doce não encontrado no catálogo local', 'local-sweets');
    }

    if (isTheme(theme, 'Cidade')) {
        const brazilianResult = await validateBrazilianCity(answer, client, timeout, requireAccents);
        if (brazilianResult.status === 'valid') return brazilianResult;

        const globalResult = await validateGlobalCity(answer, client, timeout, requireAccents);
        if (globalResult.status === 'valid') return globalResult;
        if (brazilianResult.status === 'failed' && globalResult.status === 'failed') {
            return failedResult('city-validation', {
                code: globalResult.errorCode,
                message: 'IBGE e OpenStreetMap indisponíveis'
            });
        }
        return invalidResult('Cidade não encontrada no IBGE ou OpenStreetMap', 'city-validation');
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
    validateAnswer,
    validateBrazilianState,
    validateBrand
};
