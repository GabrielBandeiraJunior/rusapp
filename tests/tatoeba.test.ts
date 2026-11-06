import { describe, expect, it } from 'vitest';
import { pairUp } from '../scripts/pipeline/tatoeba';

describe('tatoeba (fixture)', () => {
  it('cruza ru↔pt pelos links, sem duplicar', () => {
    const rus = '1\trus\tЯ читаю.\n2\trus\tЭто дом.\n';
    const por = '10\tpor\tEu leio.\n11\tpor\tEsta é a casa.\n';
    const links = '1\t10\n10\t1\n2\t11\n1\t11\n';
    expect(pairUp(rus, por, links)).toEqual([{ id: '1', ru: 'Я читаю.', pt: 'Eu leio.' }, { id: '2', ru: 'Это дом.', pt: 'Esta é a casa.' }]);
  });
});

import { readFileSync } from 'node:fs';
import { brazilianFriendly } from '../scripts/pipeline/build';

describe('filtro pt-BR das frases do Tatoeba', () => {
  it('descarta tradução tipicamente europeia e frases com «ты»', () => {
    expect(brazilianFriendly('Что ты делаешь?', 'O que estás a fazer?')).toBe(false);
    expect(brazilianFriendly('Он ждёт', 'Ele está a esperar.')).toBe(false);
    expect(brazilianFriendly('Это автобус', 'Isto é um autocarro.')).toBe(false);
    expect(brazilianFriendly('Я не понимаю', 'Eu não entendo.')).toBe(true);
  });
  it('as frases do Tatoeba presentes nos dados passam no filtro e citam a fonte', () => {
    const c = JSON.parse(readFileSync('public/data/content.json', 'utf8')) as { sentences: { ru: string; pt: string; src: string }[]; attributions: { name: string }[] };
    const t = c.sentences.filter((s) => s.src.startsWith('tatoeba:'));
    for (const s of t) expect(brazilianFriendly(s.ru, s.pt), s.pt).toBe(true);
    if (t.length) expect(c.attributions.some((a) => a.name === 'Tatoeba')).toBe(true);
  });
});
