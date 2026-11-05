import { describe, expect, it } from 'vitest';
import {
  ACUTE, cyrillicTokens, fromApostrophe, normalizeAnswer, normalizeTranslit, phonetic, sameAnswer, stressIndex,
  stripStress, syllableCount, transliterate, wordHasRequiredStress,
} from '../shared/russian';

describe('acento', () => {
  it('converte apóstrofo em U+0301 e rejeita lixo', () => {
    expect(fromApostrophe("молоко'")).toBe(`молоко${ACUTE}`);
    expect(fromApostrophe("'а")).toBeNull();
    expect(fromApostrophe("к'")).toBeNull();
  });
  it('conta sílabas, índice tônico e exige acento só em polissílabos', () => {
    expect(syllableCount('молоко')).toBe(3);
    expect(stressIndex(`молоко${ACUTE}`)).toBe(5);
    expect(stressIndex('дом')).toBe(1);
    expect(stressIndex('всё')).toBe(2);
    expect(wordHasRequiredStress('дом')).toBe(true);
    expect(wordHasRequiredStress('молоко')).toBe(false);
    expect(wordHasRequiredStress(`молоко${ACUTE}`)).toBe(true);
    expect(wordHasRequiredStress('ребёнок')).toBe(true); // ё é sempre tônico
  });
});

describe('normalização da resposta', () => {
  it('NFC, caixa, espaços, ё≡е e ignora o acento — mas é exata nas letras', () => {
    expect(sameAnswer('  Мо́ЛОКО ', 'молоко')).toBe(true);
    expect(sameAnswer('все', 'всё')).toBe(true);
    expect(sameAnswer('й', 'й')).toBe(true); // й decomposto (iOS) ≡ й
    expect(normalizeAnswer('а б')).toBe('а б');
    expect(sameAnswer('молоко', 'малако')).toBe(false);
    expect(sameAnswer('книги', 'книгы')).toBe(false);
  });
  it('stripStress remove só marcas', () => {
    expect(stripStress(`го${ACUTE}род`)).toBe('город');
  });
});

describe('transliteração e leitura', () => {
  it('esquema BGN simplificado', () => {
    expect(transliterate('молоко')).toBe('moloko');
    expect(transliterate('щи')).toBe('shchi');
    expect(transliterate('ёлка')).toBe('yolka');
    expect(transliterate('мой')).toBe('moy');
    expect(transliterate('Екатерина')).toBe('yekaterina');
    expect(transliterate('мне')).toBe('mne');
    expect(transliterate('семья')).toBe("sem'ya");
    expect(transliterate('объект')).toBe("ob'yekt");
  });
  it('compara transliteração ignorando apóstrofos', () => {
    expect(normalizeTranslit("Sem'ya")).toBe('semya');
  });
  it('leitura: redução vocálica, vozeamento e -ого', () => {
    expect(phonetic(`молоко${ACUTE}`)).toBe('malako');
    expect(phonetic(`вода${ACUTE}`)).toBe('vada');
    expect(phonetic('друг')).toBe('druk');
    expect(phonetic('хлеб')).toBe('khlep');
    expect(phonetic(`хорошо${ACUTE}`)).toBe('kharasho');
    expect(phonetic(`го${ACUTE}род`)).toBe('gorat');
    expect(phonetic(`язы${ACUTE}к`)).toBe('yizyk');
    expect(phonetic(`но${ACUTE}вого`)).toBe('novava');
  });
  it('tokeniza cirílico preservando acentos', () => {
    expect(cyrillicTokens(`Это${ACUTE} мой до${ACUTE}м.`)).toHaveLength(3);
  });
});
