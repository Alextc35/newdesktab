const STOP_WORDS = new Set(`a al algo algun alguna algunos ante como con cual cuando de del donde el ella en es este esto esta estos estas hago hacer hay la las lo los me mi mis necesito para por porque puedo que quiero se ser su sus tengo un una unos unas y yo
  about an and are can do does for how i in is it me my of on or please the to want what when where which with would you your
  ao aos as com da das dessa desse do dos ela em eu fazer ha isso meu meus minha minhas na nas no nos o os ou pela pelo posso pra preciso qual quando quero sao se sem sua suas tem tenho um uma voce`.split(/\s+/u));
const segmenter = new Intl.Segmenter('und', { granularity: 'word' });

function normalize(value) {
  return String(value ?? '').normalize('NFD')
    .replace(/([\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}])\p{M}+/gu, '$1')
    .toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}

function words(value) {
  return [...new Set([...segmenter.segment(normalize(value))]
    .filter(part => part.isWordLike && !STOP_WORDS.has(part.segment)).map(part => part.segment))];
}

/** A single missing, added or mistyped letter, without broad fuzzy matches. */
function oneEditApart(left, right) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (left.length >= right.length) i++;
    if (right.length >= left.length) j++;
  }
  return edits + Number(i < left.length || j < right.length) <= 1;
}

function wordMatch(query, candidate) {
  if (query === candidate) return 1;
  if (query.length >= 3 && candidate.startsWith(query)) return .8;
  if (candidate.length >= 4 && query.startsWith(candidate) && query.length - candidate.length <= 2) return .85;
  if (query.length >= 5 && candidate.length >= 5 && oneEditApart(query, candidate)) return .55;
  return 0;
}

function bestMatch(query, candidates) {
  return candidates.reduce((best, candidate) => Math.max(best, wordMatch(query, candidate)), 0);
}

/** Rank actual manual answers by question, synonyms, instructions and coverage. */
export function rankManualTopics(topics, query, translate) {
  const queryWords = words(query);
  if (!normalize(query)) return topics;
  if (!queryWords.length) return [];
  const documents = topics.map(topic => {
    const key = `manual.topics.${topic.id}`;
    const phrases = String(translate(`${key}.searchTerms`) ?? '').split(';').map(words);
    return {
      topic,
      phrases,
      primary: words(['title', 'question', 'searchTerms'].map(part => translate(`${key}.${part}`)).join(' ')),
      body: words(['summary', 'note', 'tip', 'steps.0', 'steps.1', 'steps.2']
        .map(part => translate(`${key}.${part}`)).join(' '))
    };
  });
  const weights = queryWords.map(word => 1 + Math.log((topics.length + 1)
    / (1 + documents.filter(document => document.primary.includes(word) || document.body.includes(word)).length)));
  const results = documents.map(document => {
    let matched = 0;
    let score = 0;
    for (const [index, word] of queryWords.entries()) {
      const primary = bestMatch(word, document.primary);
      const body = bestMatch(word, document.body);
      if (primary || body) matched++;
      score += Math.max(primary * 4, body) * weights[index];
    }
    const coverage = matched / queryWords.length;
    const phrase = document.phrases.some(phrase => phrase.length >= 2
      && phrase.every(word => queryWords.includes(word)));
    return { topic: document.topic, score: coverage >= .6 ? score * coverage ** 2 + (phrase ? 12 : 0) : 0 };
  });
  const ranked = results.filter(result => result.score > 0).sort((left, right) => right.score - left.score);
  return ranked.filter(result => result.score >= ranked[0].score * .4).map(result => result.topic);
}
