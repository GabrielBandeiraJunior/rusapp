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
