// Alfabeto e regras de leitura. Palavras de exemplo vêm do conteúdo (acentos dos dados): {{id}} = palavra, {{p:id}} = leitura.

export interface Letter {
  c: string; // minúscula
  sound: string;
}

export const LETTERS: Letter[] = [
  { c: 'а', sound: 'como o “a” de “casa”' },
  { c: 'б', sound: 'como o “b” de “bola”' },
  { c: 'в', sound: 'como o “v” de “vaca”' },
  { c: 'г', sound: 'como o “g” de “gato” (sempre duro)' },
  { c: 'д', sound: 'como o “d” de “dado” (nunca vira “dji”)' },
  { c: 'е', sound: '“iê”, como o “ye” de “yes”; suaviza a consoante anterior' },
  { c: 'ё', sound: '“iô”; é sempre tônica (por isso o acento não é escrito)' },
  { c: 'ж', sound: 'como o “j” de “jato”' },
  { c: 'з', sound: 'como o “z” de “zebra”' },
  { c: 'и', sound: 'como o “i” de “livro”' },
  { c: 'й', sound: '“i” curto, semivogal, como em “pai”' },
  { c: 'к', sound: 'como o “k” de “kit” / “c” de “casa” (sem aspirar)' },
  { c: 'л', sound: '“l” firme, com a língua nos dentes — não vira “u” como no “sal” brasileiro' },
  { c: 'м', sound: 'como o “m” de “mala”' },
  { c: 'н', sound: 'como o “n” de “nada”' },
  { c: 'о', sound: 'como o “o” de “bolo” (só quando tônico; átono vira “a”)' },
  { c: 'п', sound: 'como o “p” de “pato”' },
  { c: 'р', sound: '“r” vibrante, como o de “caro”, bem rolado' },
  { c: 'с', sound: 'como o “s” de “sapo” (sempre /s/, nunca /z/)' },
  { c: 'т', sound: 'como o “t” de “tudo” (nunca vira “tchi”)' },
  { c: 'у', sound: 'como o “u” de “uva”' },
  { c: 'ф', sound: 'como o “f” de “faca”' },
  { c: 'х', sound: '“h” fricativo áspero, como o “rr” carioca de “rato”' },
  { c: 'ц', sound: 'como o “ts” de “pizza”' },
  { c: 'ч', sound: 'como o “tch” de “tchau”' },
  { c: 'ш', sound: 'como o “ch” de “chá”, mais grave' },
  { c: 'щ', sound: '“ch” longo e suave (algo como “xtch”)' },
  { c: 'ъ', sound: 'sinal duro: separa a consoante da vogal seguinte (raro)' },
  { c: 'ы', sound: 'vogal sem equivalente: um “i” com a língua recuada' },
  { c: 'ь', sound: 'sinal mole: suaviza a consoante anterior' },
  { c: 'э', sound: 'como o “é” de “pé”' },
  { c: 'ю', sound: 'como o “iu” de “iupi”' },
  { c: 'я', sound: 'como o “ia” de “iate”' },
];

export interface Rule {
  title: string;
  body: string;
}

export const RULES: Rule[] = [
  {
    title: 'Falsos amigos: parecem latinas, não são',
    body: 'В = v · Н = n · Р = r · С = s · У = u · Х = kh · З parece o 3 mas é z · И é um i (não “n”).',
  },
  {
    title: 'Vogais duras e moles',
    body: 'Cinco pares: а–я, о–ё, у–ю, ы–и, э–е. A vogal “mole” (я ё ю и е) suaviza (palataliza) a consoante anterior; no início da palavra ou depois de vogal ganha um som de “i” antes (я = ia, е = iê).',
  },
  {
    title: 'Acento livre e redução vocálica',
    body: 'O acento russo é livre e móvel — por isso TODA palavra aqui vem acentuada (a marca ́ fica na vogal tônica; ё é sempre tônica). Vogal átona se reduz: о → a e е/я → i. Ex.: {{n:молоко}} lê-se [{{p:n:молоко}}]; {{n:язык}} lê-se [{{p:n:язык}}]; {{n:вода}} lê-se [{{p:n:вода}}].',
  },
  {
    title: 'Consoantes vozeadas e surdas (pares)',
    body: 'б–п · в–ф · г–к · д–т · ж–ш · з–с. Sem par: л м н р й (soantes) e х ц ч щ (surdas).',
  },
  {
    title: 'Ensurdecimento no fim da palavra',
    body: 'Consoante vozeada no fim lê-se surda: {{n:друг}} → [{{p:n:друг}}]; {{n:хлеб}} → [{{p:n:хлеб}}]; {{n:сад}} → [{{p:n:сад}}].',
  },
  {
    title: 'Assimilação dentro da palavra',
    body: 'Uma consoante assume o vozeamento da seguinte: {{n:ложка}} → [{{p:n:ложка}}] (ж antes de к vira ш).',
  },
  {
    title: 'г → в em -ого / -его',
    body: 'Nas terminações de genitivo masculino/neutro dos adjetivos, o г lê-se [v]. Você verá isso em “Casos”.',
  },
  {
    title: 'Regra ortográfica: ы e и',
    body: 'Depois de г, к, х, ж, ш, ч, щ nunca se escreve ы — escreve-se и. Isso explica muitas terminações no plural.',
  },
];

/** Tokens {{id}} e {{p:id}} → partes para renderização. */
export function splitRich(text: string): { t: 'text' | 'word' | 'read'; v: string }[] {
  const out: { t: 'text' | 'word' | 'read'; v: string }[] = [];
  const re = /\{\{(p:)?([a-z]:[^}]+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    out.push({ t: m[1] ? 'read' : 'word', v: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}
